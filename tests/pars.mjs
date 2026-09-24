// ── Mission pars ─────────────────────────────────────────────
// A mission's par is the price of the cheapest catalog setup that serves its
// crowd. It is computed, not chosen: this script simulates every buyable box,
// model, precision and server against every mission and reports the cheapest
// setup that earns a star.
//
//   node tests/pars.mjs            print pars and the setup behind each
//   node tests/pars.mjs --check    exit 1 if missions.js disagrees
//   node tests/pars.mjs bookclub   one mission only
//
// A par must earn a star on every seed in SEEDS. Run it whenever prices,
// efficiencies or missions change (make pars); it takes a few minutes, so
// make test only re-checks each mission's recorded parSetup.

import { runScenario } from '../js/engine/sim.js';
import { MISSIONS, scoreMission } from '../js/data/missions.js';
import { BOXES } from '../js/data/hardware.js';
import { MODELS, quantsFor } from '../js/data/models.js';
import { runtimesFor } from '../js/data/runtimes.js';
import { buildEngine } from '../js/engine/perf.js';

const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.find((a) => !a.startsWith('--'));

// Slot servers start with one fixed layout; the sweep tries the common ones.
const SLOT_LAYOUTS = [
  { slots: 4, ctxPerSlot: 16384 }, { slots: 8, ctxPerSlot: 16384 }, { slots: 16, ctxPerSlot: 8192 },
  { slots: 16, ctxPerSlot: 32768 }, { slots: 32, ctxPerSlot: 8192 }, { slots: 64, ctxPerSlot: 4096 },
  { slots: 4, ctxPerSlot: 65536 }, { slots: 2, ctxPerSlot: 131072 },
];
const KV = ['f16', 'q8', 'q4'];

/**
 * Every setup worth trying for a mission, cheapest hardware first. Setups
 * that cannot load (weights or KV do not fit) or fall under the tier floor
 * are pruned before any simulation runs.
 */
export function candidates(m) {
  const out = [];
  for (const b of BOXES.filter((x) => x.status !== 'announced')) {
    for (const [count, mode] of [[1, 'replica'], [2, 'replica'], ...(b.pairable ? [[2, 'split']] : [])]) {
      for (const model of MODELS.filter((x) => !x.hidden)) {
        for (const q of quantsFor(model)) {
          if (model.tier - q.tierLoss < m.minTier) continue;
          for (const kv of KV) {
            for (const rt of runtimesFor(b.platform)) {
              const layouts = rt.batching === 'slots' ? SLOT_LAYOUTS : [{}];
              for (const overrides of layouts) {
                const setup = { box: b.id, count, mode, model: model.id, quant: q.id, kv, runtime: rt.id, overrides };
                if (!buildEngine(scenarioFor(m, setup)).fit.ok) continue;
                out.push({ price: b.priceUsd * count, setup });
              }
            }
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.price - b.price);
}

/** A par has to hold on every one of these seeds, not on one lucky run. */
export const SEEDS = [7, 11, 23, 42];

export function scenarioFor(m, setup, seed = 7) {
  return {
    box: { id: setup.box, count: setup.count, mode: setup.mode || 'replica' },
    model: { id: setup.model, quant: setup.quant, kv: setup.kv || 'f16' },
    runtime: { id: setup.runtime, overrides: setup.overrides || {} },
    groups: m.groups, seed,
  };
}

/** Lowest share on target across the seeds, or -1 if any seed misses a star. */
export function worstPass(m, setup, stars = 1) {
  let worst = 1;
  for (const seed of SEEDS) {
    const r = runScenario(scenarioFor(m, setup, seed), { duration: m.duration });
    if (scoreMission({ ...m, par: stars === 3 ? m.par : Infinity }, r).stars < stars) return -1;
    worst = Math.min(worst, r.passRate ?? 0);
  }
  return worst;
}

/** Cheapest setup that earns at least one star on every seed, or null. */
export function solve(m) {
  let best = null;
  for (const c of candidates(m)) {
    if (best && c.price > best.price) break;   // sorted: nothing cheaper remains
    const pass = worstPass(m, c.setup);
    if (pass >= 0 && (!best || pass > best.pass)) best = { ...c, pass };
  }
  return best;
}

const roundUp = (usd) => Math.ceil(usd / 100) * 100;

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  for (const m of MISSIONS.filter((x) => !only || x.id === only)) {
    const best = solve(m);
    const par = best ? roundUp(best.price) : null;
    const ok = par === m.par && m.parSetup && JSON.stringify(m.parSetup) === JSON.stringify(best?.setup);
    if (!ok) bad++;
    const s = best?.setup;
    const layout = s?.overrides?.slots ? ` ${s.overrides.slots}x${s.overrides.ctxPerSlot / 1024}K` : '';
    if (!ok && best) console.log(`    parSetup: ${JSON.stringify(best.setup)},`);
    console.log(`${ok ? 'ok ' : 'OFF'} ${m.id.padEnd(20)} par ${String(par).padStart(6)} (data ${m.par})  ${s ? `${s.count}x ${s.box}${s.mode === 'split' ? ' split' : ''} ${s.model} ${s.quant} kv ${s.kv} ${s.runtime}${layout}, ${Math.round(best.pass * 100)}% on target` : 'unsolvable'}`);
  }
  if (check && bad) { console.error(`${bad} mission par(s) disagree with js/data/missions.js`); process.exit(1); }
}

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
// Run it whenever prices, efficiencies or missions change. It takes about a
// minute because it runs a few thousand full simulations.

import { runScenario } from '../js/engine/sim.js';
import { MISSIONS, scoreMission } from '../js/data/missions.js';
import { BOXES } from '../js/data/hardware.js';
import { MODELS, quantsFor } from '../js/data/models.js';
import { runtimesFor } from '../js/data/runtimes.js';

const QUANTS = ['q4', 'mxfp4', 'q8', 'f16'];
const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.find((a) => !a.startsWith('--'));

/** Every setup worth trying for a mission, cheapest hardware first. */
export function candidates(m) {
  const out = [];
  for (const b of BOXES.filter((x) => x.status !== 'announced')) {
    for (const count of [1, 2]) {
      for (const model of MODELS.filter((x) => !x.hidden && x.tier >= m.minTier - 0.2)) {
        for (const q of quantsFor(model).filter((x) => QUANTS.includes(x.id))) {
          for (const rt of runtimesFor(b.platform)) {
            const overrides = rt.batching === 'slots' ? { slots: 16, ctxPerSlot: 32768 } : {};
            out.push({ price: b.priceUsd * count, setup: { box: b.id, count, model: model.id, quant: q.id, runtime: rt.id, overrides } });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.price - b.price);
}

export function scenarioFor(m, setup) {
  return {
    box: { id: setup.box, count: setup.count, mode: 'replica' },
    model: { id: setup.model, quant: setup.quant, kv: 'f16' },
    runtime: { id: setup.runtime, overrides: setup.overrides || {} },
    groups: m.groups, seed: 7,
  };
}

/** Cheapest setup that earns at least one star, or null. */
export function solve(m) {
  let best = null;
  for (const c of candidates(m)) {
    if (best && c.price > best.price) break;   // sorted: nothing cheaper remains
    const r = runScenario(scenarioFor(m, c.setup), { duration: m.duration });
    const s = scoreMission({ ...m, par: Infinity }, r);
    if (s.stars >= 1 && (!best || r.passRate > best.pass)) best = { ...c, pass: r.passRate };
  }
  return best;
}

const roundUp = (usd) => Math.ceil(usd / 100) * 100;

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  for (const m of MISSIONS.filter((x) => !only || x.id === only)) {
    const best = solve(m);
    const par = best ? roundUp(best.price) : null;
    const ok = par === m.par;
    if (!ok) bad++;
    const s = best?.setup;
    console.log(`${ok ? 'ok ' : 'OFF'} ${m.id.padEnd(12)} par ${String(par).padStart(6)} (data ${m.par})  ${s ? `${s.count}x ${s.box} ${s.model} ${s.quant} ${s.runtime}, ${Math.round(best.pass * 100)}% on target` : 'unsolvable'}`);
  }
  if (check && bad) { console.error(`${bad} mission par(s) disagree with js/data/missions.js`); process.exit(1); }
}

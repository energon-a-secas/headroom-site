// ── Regression suite ─────────────────────────────────────────
// Zero dependencies: `node tests/run.mjs` (or `make test`). The engine is pure
// ES modules with no DOM, so every behaviour a reader relies on is pinned
// here as a use case with an expected outcome. When a change to the model
// moves one of these, the change is deliberate or it is a bug; either way a
// person decides, not a silent diff.

import { runScenario, createSim } from '../js/engine/sim.js';
import { buildEngine, singleUserSpeeds, batchDecodeTps } from '../js/engine/perf.js';
import { findRedline, compareBoxes } from '../js/engine/batch.js';
import { MISSIONS, scoreMission } from '../js/data/missions.js';
import { CALIBRATION, BATCH_CALIBRATION } from '../js/data/calibration.js';
import { CROWDS } from '../js/state.js';
import { USE_CASES } from './use-cases.mjs';
import { worstPass, SEEDS } from './pars.mjs';

const results = [];
const test = (name, fn) => {
  try {
    const msg = fn();
    results.push({ name, ok: true, msg: msg || '' });
  } catch (err) {
    results.push({ name, ok: false, msg: err.message });
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const sc = (over = {}) => ({
  box: { id: 'dgx-spark', count: 1, mode: 'replica' },
  model: { id: 'gpt-oss-120b', quant: 'mxfp4', kv: 'f16' },
  runtime: { id: 'vllm' }, seed: 7,
  groups: [{ persona: 'reader', count: 50, client: 'kindle', link: 'wifi', distanceKm: 0.015 }],
  ...over,
});

/** Every number in a report is finite (or explicitly null / Infinity for payback). */
function finiteReport(r, path = 'report') {
  for (const [k, v] of Object.entries(r)) {
    if (k === 'series' || k === 'paybackMonths') continue;
    if (typeof v === 'number') assert(!Number.isNaN(v), `${path}.${k} is NaN`);
    else if (v && typeof v === 'object') finiteReport(v, `${path}.${k}`);
  }
}

// ── Engine invariants ──
test('same scenario and seed give the same report', () => {
  const a = JSON.stringify(runScenario(sc(), { duration: 900 }));
  const b = JSON.stringify(runScenario(sc(), { duration: 900 }));
  assert(a === b, 'two identical runs differ');
});

test('a paused sim advanced in pieces equals one advance', () => {
  const one = createSim(sc()); one.advance(900);
  const many = createSim(sc()); for (let t = 60; t <= 900; t += 60) many.advance(t);
  assert(JSON.stringify(one.report(900).groups) === JSON.stringify(many.report(900).groups), 'chunked advance changes the result');
});

test('reports contain no NaN across every crowd preset and box', () => {
  let n = 0;
  for (const [id, c] of Object.entries(CROWDS)) {
    for (const box of ['dgx-spark', 'ryzen-ai-halo', 'mac-m5max-128', 'pi5']) {
      const r = runScenario(sc({ box: { id: box, count: 1 }, runtime: { id: box.startsWith('mac') ? 'mlx' : box === 'pi5' ? 'llamacpp' : 'vllm' }, model: { id: box === 'pi5' ? 'llama-3.2-3b' : 'gpt-oss-20b', quant: box === 'pi5' ? 'q4' : 'mxfp4', kv: 'f16' }, groups: c.groups }), { duration: 600 });
      finiteReport(r, `${id}@${box}`); n++;
    }
  }
  return `${n} runs`;
});

// ── Calibration: the model stays honest against published numbers ──
test('calibration: typical error under 20%, worst under 3x', () => {
  const errs = [];
  const eng = (c) => buildEngine({ box: { id: c.box, count: 1 }, model: { id: c.model, quant: c.quant, kv: 'f16' }, runtime: { id: c.runtime }, groups: [] });
  for (const c of CALIBRATION) {
    const s = singleUserSpeeds(eng(c), c.ctx || 512, c.chunk);
    if (c.tg) errs.push(Math.abs(Math.log(s.decodeTps / c.tg)));
    if (c.pp) errs.push(Math.abs(Math.log(s.prefillTps / c.pp)));
  }
  for (const b of BATCH_CALIBRATION) for (const [n, agg] of b.points) errs.push(Math.abs(Math.log(batchDecodeTps(eng(b), n, b.ctx) / agg)));
  const typical = Math.exp(errs.reduce((a, x) => a + x, 0) / errs.length);
  const worst = Math.exp(Math.max(...errs));
  assert(typical < 1.2, `typical error factor ${typical.toFixed(2)}`);
  assert(worst < 3, `worst error factor ${worst.toFixed(2)}`);
  return `typical ${((typical - 1) * 100).toFixed(0)}%, worst ${worst.toFixed(2)}x over ${errs.length} points`;
});

test('mixture-of-experts batching scales less than dense', () => {
  const e = (model, quant) => buildEngine({ box: { id: 'dgx-spark', count: 1 }, model: { id: model, quant, kv: 'f16' }, runtime: { id: 'llamacpp' }, groups: [] });
  const ratio = (eng) => batchDecodeTps(eng, 32, 512) / batchDecodeTps(eng, 1, 512);
  const moe = ratio(e('gpt-oss-120b', 'mxfp4')), dense = ratio(e('qwen2.5-7b', 'q8'));
  assert(moe < dense / 2, `MoE ${moe.toFixed(1)}x vs dense ${dense.toFixed(1)}x`);
  return `MoE ${moe.toFixed(1)}x, dense ${dense.toFixed(1)}x from 1 to 32 users`;
});

// ── Rules added in v1.1 ──
const mission = (id, over = {}) => {
  const m = MISSIONS.find((x) => x.id === id), ps = { ...m.parSetup, ...over };
  return [m, runScenario({ box: { id: ps.box, count: ps.count, mode: ps.mode }, model: { id: ps.model, quant: ps.quant, kv: ps.kv },
    runtime: { id: ps.runtime, overrides: ps.overrides }, groups: m.groups, seed: 7 }, { duration: m.duration })];
};

test('a background batch keeps the box busy without making the verdict tight', () => {
  const [, r] = mission('helpdesk-backfill', { box: 'dgx-spark', count: 1, mode: 'replica', model: 'gemma-4-26b-a4b', quant: 'q4', kv: 'f16', runtime: 'vllm', overrides: {} });
  assert(r.util.busy > 0.9 && r.verdict.id === 'right', `${Math.round(r.util.busy * 100)}% busy, verdict ${r.verdict.id}`);
  return r.verdict.text;
});

test('llama.cpp splits a model by layer and gains no single-stream speed; vLLM splits by tensor and does', () => {
  const e = (count, rt) => buildEngine({ box: { id: 'dgx-spark', count, mode: count > 1 ? 'split' : 'replica' }, model: { id: 'gpt-oss-120b', quant: 'mxfp4', kv: 'f16' }, runtime: { id: rt }, groups: [] });
  const tps = (count, rt) => singleUserSpeeds(e(count, rt)).decodeTps;
  assert(Math.abs(tps(2, 'llamacpp') / tps(1, 'llamacpp') - 1) < 0.05, `llama.cpp ${tps(1, 'llamacpp')} -> ${tps(2, 'llamacpp')}`);
  assert(tps(2, 'vllm') > 1.25 * tps(1, 'vllm'), `vLLM ${tps(1, 'vllm')} -> ${tps(2, 'vllm')}`);
  assert(e(2, 'ollama').fit.code === 'split', 'Ollama cannot split');
  return `llama.cpp ${tps(1, 'llamacpp').toFixed(0)} -> ${tps(2, 'llamacpp').toFixed(0)} tok/s, vLLM ${tps(1, 'vllm').toFixed(0)} -> ${tps(2, 'vllm').toFixed(0)}`;
});

test('a 4-bit KV cache costs capability; an 8-bit one does not', () => {
  const tier = (kv) => buildEngine({ ...sc(), model: { id: 'gpt-oss-120b', quant: 'mxfp4', kv } }).tier;
  assert(tier('q8') === tier('f16') && tier('q4') < tier('f16') - 0.05, `f16 ${tier('f16')}, q8 ${tier('q8')}, q4 ${tier('q4')}`);
});

test('a lost packet stalls an internet path for a TCP recovery; Wi-Fi resends at the radio', () => {
  const run = (link, km) => runScenario(sc({ model: { id: 'qwen3-next-80b', quant: 'q4', kv: 'f16' },
    groups: [{ persona: 'chat', count: 10, client: 'browser', link, distanceKm: km }] }), { duration: 1200 }).groups[0].ttft;
  const wifi = run('wifi', 0.01), geo = run('geo', 3000);
  assert(wifi.p95 - wifi.p50 < 0.1 && geo.p95 - geo.p50 > 0.4, `Wi-Fi ${wifi.p50}/${wifi.p95} s, GEO ${geo.p50}/${geo.p95} s`);
  return `first text p50/p95: Wi-Fi ${wifi.p50.toFixed(2)}/${wifi.p95.toFixed(2)} s, GEO ${geo.p50.toFixed(2)}/${geo.p95.toFixed(2)} s`;
});

test('mission stars need a box you can buy', () => {
  const [m, custom] = mission('bookclub', { box: 'custom' });
  const [, soon] = mission('bookclub', { box: 'rtx-spark-devbox', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'vllm', overrides: {} });
  for (const r of [custom, soon]) assert(scoreMission(m, r).stars === 0 && scoreMission(m, r).checks.some((c) => !c.ok && /custom box|not on sale/.test(c.text)), `${r.engine.box}: ${scoreMission(m, r).stars} stars`);
});

test("llama-server's slots share one context pool, so one long conversation fits where a fixed 16K slot would refuse it", () => {
  const eng = buildEngine({ ...sc(), runtime: { id: 'llamacpp' } });
  assert(eng.slotCtx === 4 * 16384, `longest request ${eng.slotCtx}`);
  const r = runScenario(sc({ model: { id: 'qwen3-30b-a3b', quant: 'q4', kv: 'f16' }, runtime: { id: 'llamacpp' }, groups: CROWDS.monorepo.groups.map((g) => ({ ...g, count: 1 })) }), { duration: 900 });
  assert(!r.fails.context, `refused ${r.fails.context}`);
});

test('a translation is as long as the article it translates', () => {
  const [, r] = mission('foreign-desk');
  const g = r.groups[0], per = (x) => x / g.n;
  const input = per(g.tokIn) - 900, output = per(g.tokOut);
  assert(Math.abs(output / input - 0.8) < 0.12, `output ${output.toFixed(0)} for input ${input.toFixed(0)}`);
});

// ── Missions: every par setup earns three stars, and pars match the solver ──
// Minimality (nothing cheaper passes) is make pars --check, which is slow;
// here the recorded setup must still earn three stars on every seed.
for (const m of MISSIONS) {
  test(`mission ${m.id}: its par setup earns three stars on every seed`, () => {
    assert(m.parSetup, 'missions.js has no parSetup; run make pars');
    const pass = worstPass(m, m.parSetup, 3);
    assert(pass >= 0, `the par setup misses three stars on one of seeds ${SEEDS.join(', ')}`);
    const b = m.parSetup;
    return `$${m.par}: ${b.count}x ${b.box}, ${b.model} ${b.quant}, ${b.runtime}, worst seed ${Math.round(pass * 100)}%`;
  });
}

// ── Use cases: each pins the lesson it exists to teach ──
for (const u of USE_CASES) {
  test(`use case: ${u.name}`, () => u.check({ runScenario, findRedline, compareBoxes, buildEngine, sc, assert }));
}

// ── Report ──
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.msg ? `  (${r.msg})` : ''}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

// ── Use cases under test ─────────────────────────────────────
// Each entry is a situation a buyer might simulate, with the outcome the
// simulator must keep producing. They are the lessons Headroom exists to
// teach, so a model change that breaks one is either a deliberate
// correction (update the case and say why in the commit) or a bug.
//
// check(ctx) throws on failure and may return a short note for the report.

import { missionById, scoreMission } from '../js/data/missions.js';
import { CROWDS } from '../js/state.js';

const groups = (persona, count, client, link, extra = {}) => [{ persona, count, client, link, distanceKm: 0.015, ...extra }];

/** Run a mission's or preset's crowd on one setup, the way the page would. */
const on = (runScenario, crowd, box, model, quant, runtime, overrides = {}, extra = {}) => runScenario({
  box: { id: box, count: extra.count || 1, mode: extra.mode || 'replica' },
  model: { id: model, quant, kv: extra.kv || 'f16' },
  runtime: { id: runtime, overrides }, groups: crowd, seed: 7,
}, { duration: extra.duration || 1800 });
const failing = (m, r) => scoreMission(m, r).checks.filter((c) => !c.ok).map((c) => c.text);

export const USE_CASES = [
  {
    name: '50 Kindle readers on a DGX Spark are right-sized, and Wi-Fi caps them before the box does',
    check({ runScenario, findRedline, sc, assert }) {
      const r = runScenario(sc(), { duration: 1200 });
      assert(r.verdict.id === 'right', `verdict ${r.verdict.id}`);
      assert(r.passRate >= 0.95, `pass ${r.passRate}`);
      const rl = findRedline(sc(), { duration: 600 });
      assert(rl.why === 'connections', `redline limited by ${rl.why}`);
      assert(rl.boxUsers > rl.users, `box alone ${rl.boxUsers} vs system ${rl.users}`);
      return `system ${rl.users}, box alone ${rl.boxUsers}`;
    },
  },
  {
    name: "Ollama's 8K single slot cannot hold a coding agent's prompt",
    check({ runScenario, sc, assert }) {
      const r = runScenario(sc({ runtime: { id: 'ollama' }, groups: groups('coder', 6, 'ide', 'lan') }), { duration: 900 });
      assert(r.bottleneck.id === 'context', `bottleneck ${r.bottleneck.id}`);
      assert(r.verdict.id === 'overloaded', `verdict ${r.verdict.id}`);
    },
  },
  {
    name: 'Four llama.cpp slots queue 50 chatting users, and vLLM serves them',
    check({ runScenario, sc, assert }) {
      const chat = groups('chat', 50, 'phone', 'wifi');
      const slots = runScenario(sc({ runtime: { id: 'llamacpp' }, groups: chat }), { duration: 1200 });
      assert(slots.bottleneck.id === 'slots', `llama.cpp bottleneck ${slots.bottleneck.id}`);
      const paged = runScenario(sc({ runtime: { id: 'vllm' }, groups: chat }), { duration: 1200 });
      assert(paged.passRate > slots.passRate + 0.5, `vLLM ${paged.passRate} vs llama.cpp ${slots.passRate}`);
    },
  },
  {
    name: 'A Bluetooth hub holds 10 readers and the rest never connect',
    check({ runScenario, sc, assert }) {
      const r = runScenario(sc({ groups: groups('reader', 40, 'kindle', 'ble', { distanceKm: 0.01 }) }), { duration: 900 });
      assert(r.unserved === 30, `unserved ${r.unserved}`);
      assert(r.bottleneck.id === 'connections', `bottleneck ${r.bottleneck.id}`);
    },
  },
  {
    name: 'Token-by-token SSE over LoRa jams the channel; compact packets work',
    check({ runScenario, sc, assert }) {
      const tweak = { output: 60, prefix: 200, history: false, think: 240, slo: { ttft: 0, tps: 0, e2e: 180 }, patience: 600 };
      const bad = runScenario(sc({ groups: [{ persona: 'chat', count: 12, client: 'phone', link: 'lora', protocol: 'sse', distanceKm: 5, tweak }] }), { duration: 1800 });
      const good = runScenario(sc({ groups: [{ persona: 'chat', count: 12, client: 'badge', link: 'lora', protocol: 'mesh', distanceKm: 5, tweak }] }), { duration: 1800 });
      assert(bad.bottleneck.id === 'link', `SSE bottleneck ${bad.bottleneck.id}`);
      assert(good.passRate >= 0.95, `mesh pass ${good.passRate}`);
    },
  },
  {
    name: 'Qwen3 235B does not fit one 128 GB box at 3-bit, and fits two Sparks split at 4-bit',
    check({ buildEngine, assert }) {
      const one = buildEngine({ box: { id: 'dgx-spark', count: 1 }, model: { id: 'qwen3-235b-a22b', quant: 'q3', kv: 'f16' }, runtime: { id: 'vllm' }, groups: [] });
      const two = buildEngine({ box: { id: 'dgx-spark', count: 2, mode: 'split' }, model: { id: 'qwen3-235b-a22b', quant: 'q4', kv: 'f16' }, runtime: { id: 'vllm' }, groups: [] });
      assert(!one.fit.ok && one.fit.code === 'weights', 'one box should not fit');
      assert(two.fit.ok, `two boxes should fit: ${two.fit.reason}`);
    },
  },
  {
    name: 'A 70B dense model on a 273 GB/s box generates at about 5 tokens a second',
    check({ buildEngine, assert }) {
      const e = buildEngine({ box: { id: 'ryzen-ai-halo', count: 1 }, model: { id: 'llama-3.3-70b', quant: 'q4', kv: 'f16' }, runtime: { id: 'llamacpp' }, groups: [] });
      const tps = 1 / (e.fp.sharedRead / e.bw + e.stepS + e.perSeqS);
      assert(tps > 4 && tps < 6.5, `${tps.toFixed(1)} tok/s`);
      return `${tps.toFixed(1)} tok/s`;
    },
  },
  {
    name: 'The classroom bell swamps four slots while the box still has spare time',
    check({ runScenario, sc, assert }) {
      const r = runScenario(sc({ box: { id: 'mac-mini-m5pro', count: 1 }, runtime: { id: 'llamacpp' }, model: { id: 'qwen3-32b', quant: 'q4', kv: 'f16' }, groups: groups('student', 30, 'browser', 'wifi') }), { duration: 1500 });
      assert(r.bottleneck.id === 'slots', `bottleneck ${r.bottleneck.id}`);
      assert(r.util.busy < 0.75, `busy ${r.util.busy}`);
      assert(r.passRate < 0.5, `pass ${r.passRate}`);
      return `${Math.round(r.util.busy * 100)}% busy, ${Math.round(r.passRate * 100)}% on target`;
    },
  },
  {
    name: 'A Raspberry Pi 5 cannot keep two chat users at reading speed',
    check({ runScenario, sc, assert }) {
      const r = runScenario(sc({ box: { id: 'pi5', count: 1 }, runtime: { id: 'llamacpp' }, model: { id: 'llama-3.2-3b', quant: 'q4', kv: 'f16' }, groups: groups('chat', 2, 'phone', 'wifi') }), { duration: 1200 });
      assert(r.verdict.id === 'overloaded', `verdict ${r.verdict.id}`);
    },
  },
  {
    name: 'Compare puts every buyable box in the table and flags the ones that cannot fit',
    check({ compareBoxes, sc, assert }) {
      const rows = compareBoxes(sc(), { duration: 600, redline: false });
      assert(rows.length >= 11, `${rows.length} rows`);
      const noFit = rows.filter((r) => !r.report.ok).map((r) => r.boxId);
      assert(noFit.includes('rtx-5090') && noFit.includes('pi5'), `no-fit rows ${noFit.join(',')}`);
    },
  },

  // ── v1.1 use cases (missions and presets added after the first release) ──
  {
    name: "The house is the prompt: an 8,500-token device list breaks Ollama's 8K default, and prefix caching is what makes it cheap",
    check({ runScenario, assert }) {
      const m = missionById('house-is-the-prompt');
      const ollama = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'ollama');
      assert(ollama.bottleneck.id === 'context', `Ollama bottleneck ${ollama.bottleneck.id}`);
      assert(ollama.groups[0].passPct === 0, `voice on Ollama ${ollama.groups[0].passPct}`);
      const cached = on(runScenario, m.groups, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'llamacpp');
      const cold = on(runScenario, m.groups, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'llamacpp', { prefixCache: false });
      assert(scoreMission(m, cached).stars === 3, `Mac mini with the cache scores ${scoreMission(m, cached).stars}`);
      assert(cold.bottleneck.id === 'prefill' && cold.passRate < 0.6, `without the cache: ${cold.bottleneck.id} ${cold.passRate}`);
      return `cache on ${Math.round(cached.passRate * 100)}%, off ${Math.round(cold.passRate * 100)}%`;
    },
  },
  {
    name: 'Voice badges on the ward: the same Spark flips from 0% to 99% on the server, because charts put prompt reading on the first word',
    check({ runScenario, assert }) {
      const m = missionById('ward-voice-badges');
      const vllm = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      const cpp = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'llamacpp');
      const halo = on(runScenario, m.groups, 'ryzen-ai-halo', 'gpt-oss-120b', 'mxfp4', 'vllm');
      assert(vllm.passRate - cpp.passRate > 0.9, `vLLM ${vllm.passRate} vs llama.cpp ${cpp.passRate}`);
      assert(cpp.bottleneck.id === 'prefill' && halo.bottleneck.id === 'prefill', `blame ${cpp.bottleneck.id}, ${halo.bottleneck.id}`);
      assert(halo.passRate < 0.05, `Strix Halo ${halo.passRate}`);
    },
  },
  {
    name: 'The foreign desk: with one or two long answers in flight, llama.cpp beats vLLM on the same Spark',
    check({ runScenario, assert }) {
      const m = missionById('foreign-desk');
      const cpp = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'llamacpp');
      const vllm = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      assert(cpp.passRate > vllm.passRate + 0.05, `llama.cpp ${cpp.passRate} vs vLLM ${vllm.passRate}`);
      assert(vllm.bottleneck.id === 'bandwidth', `vLLM bottleneck ${vllm.bottleneck.id}`);
    },
  },
  {
    name: 'Twenty ships, two satellites: the Starlink half passes and the GEO half fails on the same box',
    check({ runScenario, assert }) {
      const m = missionById('fleet-two-satellites');
      const r = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      assert(r.groups[0].passPct >= 0.95, `Starlink ${r.groups[0].passPct}`);
      assert(r.groups[1].passPct <= 0.6, `GEO ${r.groups[1].passPct}`);
      assert(r.bottleneck.id === 'bandwidth', `bottleneck ${r.bottleneck.id}`);
    },
  },
  {
    name: 'The backfill that ate the help desk: first-come slots starve the agents, and every group must pass on its own',
    check({ runScenario, assert }) {
      const m = missionById('helpdesk-backfill');
      const slots = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'llamacpp');
      assert(slots.bottleneck.id === 'slots', `bottleneck ${slots.bottleneck.id}`);
      assert(slots.groups[0].passPct === 0 && slots.groups[1].passPct > 0.95, `agents ${slots.groups[0].passPct}, backfill ${slots.groups[1].passPct}`);
      const pooled = on(runScenario, m.groups, 'mac-m5max-128', 'qwen3-next-80b', 'q8', 'ollama', { slots: 16, ctxPerSlot: 16384 });
      assert(pooled.passRate >= 0.95 && pooled.groups[0].passPct < 0.95, `pooled ${pooled.passRate}, agents ${pooled.groups[0].passPct}`);
      assert(scoreMission(m, pooled).stars === 0, 'a lagging group must cost the star');
    },
  },
  {
    name: "The solar school lab: a DGX Spark answers every student and still fails on its idle draw",
    check({ runScenario, assert }) {
      const m = missionById('solar-school-lab');
      const spark = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-20b', 'mxfp4', 'vllm', {}, { duration: 1500 });
      assert(spark.passRate >= 0.95 && spark.util.avgW > m.maxWatts, `Spark ${spark.passRate}, ${spark.util.avgW} W`);
      assert(failing(m, spark).some((t) => t.includes('solar limit')), 'the power check must fail');
      const mini = on(runScenario, m.groups, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'llamacpp', {}, { duration: 1500 });
      assert(mini.util.avgW <= m.maxWatts && scoreMission(m, mini).stars === 3, `Mac mini ${Math.round(mini.util.avgW)} W, ${scoreMission(m, mini).stars} stars`);
      return `Spark ${Math.round(spark.util.avgW)} W, Mac mini ${Math.round(mini.util.avgW)} W`;
    },
  },
  {
    name: 'The six-language guide: six system prompts compete for slot caches; host RAM helps, a paged server passes',
    check({ runScenario, assert }) {
      const m = missionById('six-language-guide');
      const noHost = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-20b', 'mxfp4', 'llamacpp', { hostCacheGB: 0 });
      const host = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-20b', 'mxfp4', 'llamacpp');
      const paged = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-20b', 'mxfp4', 'vllm');
      assert(noHost.passRate < 0.5, `slots without host cache ${noHost.passRate}`);
      assert(host.passRate > noHost.passRate + 0.3 && host.passRate < 0.95, `with host cache ${host.passRate}`);
      assert(paged.passRate >= 0.95, `vLLM ${paged.passRate}`);
      return `slots ${Math.round(noHost.passRate * 100)}%, with host RAM ${Math.round(host.passRate * 100)}%, paged ${Math.round(paged.passRate * 100)}%`;
    },
  },
  {
    name: 'The tier 4.5 proof lab: the quality floor rules out every 128 GB box before the crowd matters',
    check({ runScenario, assert }) {
      const m = missionById('tier-floor-lab');
      const big = on(runScenario, m.groups, 'dgx-spark', 'qwen3-235b-a22b', 'q6', 'vllm');
      assert(!big.ok && big.fit.code === 'weights', 'Qwen3 235B Q6 must not fit one Spark');
      const def = on(runScenario, m.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      const fails = failing(m, def);
      assert(def.passRate >= 0.95 && fails.length >= 1 && fails.every((t) => t.startsWith('Capability tier') || t.startsWith('Par')), `default fails: ${fails.join(' | ')}`);
    },
  },
  {
    name: 'Deep in the monorepo: at 100K tokens the KV cache, not the weights, sets the speed',
    check({ runScenario, assert }) {
      const lean = on(runScenario, CROWDS.monorepo.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      const dense = on(runScenario, CROWDS.monorepo.groups, 'dgx-spark', 'qwen3-32b', 'q8', 'vllm');
      const slots = on(runScenario, CROWDS.monorepo.groups, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'llamacpp');
      assert(lean.passRate - dense.passRate > 0.8, `gpt-oss-120b ${lean.passRate} vs Qwen3 32B ${dense.passRate}`);
      assert(slots.bottleneck.id === 'context', `16K slots ${slots.bottleneck.id}`);
    },
  },
  {
    name: 'Twenty-four agents, one box: a 32 GB RTX 5090 beats two DGX Sparks on step latency',
    check({ runScenario, assert }) {
      const gpu = on(runScenario, CROWDS.swarm.groups, 'rtx-5090', 'gpt-oss-20b', 'mxfp4', 'vllm');
      const two = on(runScenario, CROWDS.swarm.groups, 'dgx-spark', 'gpt-oss-20b', 'mxfp4', 'vllm', {}, { count: 2 });
      assert(gpu.passRate >= 0.95 && two.passRate < 0.6, `5090 ${gpu.passRate}, 2x Spark ${two.passRate}`);
    },
  },
  {
    name: "The dairy's five-minute herd: width beats speed, and jittered timers need an eighth of the slots",
    check({ runScenario, assert }) {
      const herd = CROWDS.dairy.groups;
      const narrow = on(runScenario, herd, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'mlx', { slots: 16, ctxPerSlot: 8192 });
      const wide = on(runScenario, herd, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'mlx', { slots: 64, ctxPerSlot: 4096 });
      const jitter = herd.map((g) => ({ ...g, tweak: { ...g.tweak, burst: false, think: 300 } }));
      const calm = on(runScenario, jitter, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'mlx', { slots: 8, ctxPerSlot: 8192 });
      const oneAp = on(runScenario, [{ ...herd[0], count: 120 }], 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'mlx', { slots: 64, ctxPerSlot: 4096 });
      assert(narrow.bottleneck.id === 'slots' && narrow.util.busy < 0.3, `16 slots: ${narrow.bottleneck.id}, busy ${narrow.util.busy}`);
      assert(wide.passRate >= 0.95 && calm.passRate >= 0.95, `64 slots ${wide.passRate}, jittered 8 slots ${calm.passRate}`);
      assert(oneAp.unserved === 56 && oneAp.bottleneck.id === 'connections', `one access point: ${oneAp.unserved} unserved`);
    },
  },
  {
    name: 'Forty robots waiting for orders: a second box barely speeds one stream, a sparser model does',
    check({ runScenario, assert }) {
      const two = on(runScenario, CROWDS.robots.groups, 'asus-gx10', 'gpt-oss-120b', 'mxfp4', 'vllm', {}, { count: 2 });
      const sparse = on(runScenario, CROWDS.robots.groups, 'mac-m5max-128', 'qwen3-next-80b', 'q8', 'llamacpp');
      assert(two.passRate < 0.6 && two.bottleneck.id === 'bandwidth', `2x GX10 ${two.passRate} ${two.bottleneck.id}`);
      assert(sparse.passRate >= 0.95, `M5 Max with Qwen3-Next ${sparse.passRate}`);
    },
  },
];

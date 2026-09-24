// ── Use cases under test ─────────────────────────────────────
// Each entry is a situation a buyer might simulate, with the outcome the
// simulator must keep producing. They are the lessons Headroom exists to
// teach, so a model change that breaks one is either a deliberate
// correction (update the case and say why in the commit) or a bug.
//
// check(ctx) throws on failure and may return a short note for the report.

const groups = (persona, count, client, link, extra = {}) => [{ persona, count, client, link, distanceKm: 0.015, ...extra }];

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
    name: 'The classroom bell overloads a box that idles the rest of the hour',
    check({ runScenario, sc, assert }) {
      const r = runScenario(sc({ box: { id: 'mac-mini-m5pro', count: 1 }, runtime: { id: 'llamacpp' }, model: { id: 'qwen3-32b', quant: 'q4', kv: 'f16' }, groups: groups('student', 30, 'browser', 'wifi') }), { duration: 1500 });
      assert(r.util.busy < 0.6, `busy ${r.util.busy}`);
      assert(r.passRate < 0.95, `pass ${r.passRate}`);
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
];

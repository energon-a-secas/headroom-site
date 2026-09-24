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
    name: '50 Kindle readers on a DGX Spark: Qwen3-Next is right-sized and Wi-Fi caps it first, while gpt-oss-120b, slower per token and reasoning before every page, keeps the box over 80% busy',
    check({ runScenario, findRedline, sc, assert }) {
      const next = sc({ model: { id: 'qwen3-next-80b', quant: 'q4', kv: 'f16' } });
      const r = runScenario(next, { duration: 1200 });
      assert(r.verdict.id === 'right', `verdict ${r.verdict.id}`);
      assert(r.passRate >= 0.95, `pass ${r.passRate}`);
      const rl = findRedline(next, { duration: 600 });
      assert(rl.why === 'connections', `redline limited by ${rl.why}`);
      assert(rl.boxUsers > rl.users, `box alone ${rl.boxUsers} vs system ${rl.users}`);
      const oss = runScenario(sc(), { duration: 1200 });
      assert(oss.util.busy > 0.8 && oss.util.busy > r.util.busy + 0.2, `gpt-oss-120b ${oss.util.busy} busy vs Qwen3-Next ${r.util.busy}`);
      return `system ${rl.users}, box alone ${rl.boxUsers}; ${Math.round(r.util.busy * 100)}% busy, ${Math.round(oss.util.busy * 100)}% with gpt-oss-120b`;
    },
  },
  {
    name: "Ollama's 8K default cuts a coding agent's prompt and answers anyway, and a wider window only exposes its single slot",
    check({ runScenario, sc, assert }) {
      const crew = groups('coder', 6, 'ide', 'lan');
      const cut = runScenario(sc({ runtime: { id: 'ollama' }, groups: crew }), { duration: 900 });
      assert(cut.bottleneck.id === 'context' && cut.bottleneck.text.includes('cut'), `bottleneck ${cut.bottleneck.id}: ${cut.bottleneck.text}`);
      assert(cut.fails.truncated > 0 && !cut.fails.context, `fails ${JSON.stringify(cut.fails)}`);
      assert(cut.passRate === 0 && cut.verdict.id === 'overloaded', `pass ${cut.passRate}, verdict ${cut.verdict.id}`);
      const wide = runScenario(sc({ runtime: { id: 'ollama', overrides: { ctxPerSlot: 65536 } }, groups: crew }), { duration: 900 });
      assert(!wide.fails.truncated && wide.bottleneck.id === 'slots', `64K window: ${wide.bottleneck.id} ${JSON.stringify(wide.fails)}`);
      return `${cut.fails.truncated} prompts cut to fit`;
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
    name: "The house is the prompt: Home Assistant's 8K Ollama window cuts the 8,500-token voice prompt, a wider window leaves one slot swapping two prompts, and a cache that keeps both serves the house on a $2,299 Mac mini",
    check({ runScenario, assert }) {
      const m = missionById('house-is-the-prompt');
      const at = (seed, runtime, overrides = {}) => runScenario({
        box: { id: 'mac-mini-m5pro', count: 1, mode: 'replica' },
        model: { id: 'qwen3-30b-a3b', quant: 'q8', kv: 'q8' },
        runtime: { id: runtime, overrides }, groups: m.groups, seed,
      }, { duration: m.duration });
      let worstOn = 1, bestOff = 0, worstNoHost = 1;
      for (const seed of [7, 11, 23, 42]) {
        // Ollama at the 8K Home Assistant asks for: the voice prompt is cut, answered on time, and wrong.
        const cut = at(seed, 'ollama');
        assert(cut.bottleneck.id === 'context', `seed ${seed}: Ollama 8K bottleneck ${cut.bottleneck.id}`);
        assert(cut.groups[0].passPct === 0 && cut.groups[0].fail.truncated > 0, `seed ${seed}: Ollama 8K voice ${cut.groups[0].passPct}, cut ${cut.groups[0].fail.truncated}`);
        // Change only the window: nothing is cut, and the one slot still swaps two prompts.
        const wide = at(seed, 'ollama', { ctxPerSlot: 16384 });
        assert(!wide.groups[0].fail.truncated, `seed ${seed}: Ollama 16K still cuts ${wide.groups[0].fail.truncated}`);
        assert(wide.bottleneck.id === 'prefill' && wide.groups[0].passPct < 0.8, `seed ${seed}: Ollama 16K ${wide.bottleneck.id}, voice ${wide.groups[0].passPct}`);
        // The par box on llama.cpp's defaults, then the same server with one cache setting changed.
        const on = at(seed, 'llamacpp');
        const off = at(seed, 'llamacpp', { prefixCache: false });
        const noHost = at(seed, 'llamacpp', { hostCacheGB: 0 });
        assert(scoreMission(m, on).stars === 3, `seed ${seed}: par box scores ${scoreMission(m, on).stars}`);
        assert(off.bottleneck.id === 'prefill' && off.passRate < 0.4, `seed ${seed}: cache off ${off.bottleneck.id} ${off.passRate}`);
        assert(noHost.util.cacheHit < on.util.cacheHit, `seed ${seed}: cache hit without host RAM ${noHost.util.cacheHit} vs ${on.util.cacheHit}`);
        worstOn = Math.min(worstOn, on.passRate);
        bestOff = Math.max(bestOff, off.passRate);
        worstNoHost = Math.min(worstNoHost, noHost.groups[0].passPct);
      }
      // A cache that only keeps each slot's last prompt misses the voice goal on some evenings.
      assert(worstNoHost < 0.92, `voice without the host-RAM cache never drops below ${worstNoHost}`);
      return `cache on worst ${Math.round(worstOn * 100)}%, off best ${Math.round(bestOff * 100)}%, slot-only cache worst voice ${Math.round(worstNoHost * 100)}%`;
    },
  },
  {
    name: 'Voice badges on the ward: without the chart a Ryzen AI Halo answers in time and with it misses, the par box holds, and 60 tokens of hidden thinking sink even the par box',
    check({ runScenario, assert }) {
      const m = missionById('ward-voice-badges');
      const noChart = m.groups.map((g) => ({ ...g, tweak: { ...g.tweak, context: 0 } }));
      const thinking = m.groups.map((g) => ({ ...g, tweak: { ...g.tweak, reason: 60 } }));
      const at = (crowd, box, model, quant, runtime, seed) => runScenario({
        box: { id: box, count: 1, mode: 'replica' }, model: { id: model, quant, kv: 'f16' },
        runtime: { id: runtime, overrides: {} }, groups: crowd, seed,
      }, { duration: m.duration });
      const notes = [];
      for (const seed of [7, 11, 23, 42]) {
        const par = at(m.groups, 'asus-gx10', 'qwen3-next-80b', 'q4', 'trtllm', seed);
        const halo = at(m.groups, 'ryzen-ai-halo', 'qwen3-next-80b', 'q4', 'vllm', seed);
        const bare = at(noChart, 'ryzen-ai-halo', 'qwen3-next-80b', 'q4', 'vllm', seed);
        const thinks = at(thinking, 'asus-gx10', 'qwen3-next-80b', 'q4', 'trtllm', seed);
        assert(scoreMission(m, par).stars === 3, `seed ${seed}: par setup ${par.passRate}: ${failing(m, par).join(' | ')}`);
        assert(bare.passRate >= 0.9 && halo.passRate < 0.4 && halo.bottleneck.id === 'prefill', `seed ${seed}: Halo ${bare.passRate} without the chart, ${halo.passRate} with it (${halo.bottleneck.id})`);
        assert(thinks.passRate < 0.05 && thinks.groups[0].ttft.p50 > 1.2, `seed ${seed}: with 60 thinking tokens ${thinks.passRate}, first word ${thinks.groups[0].ttft.p50} s`);
        notes.push(`${seed}: par ${Math.round(par.passRate * 100)}%, Halo ${Math.round(bare.passRate * 100)}% -> ${Math.round(halo.passRate * 100)}%, thinking ${Math.round(thinks.passRate * 100)}%`);
      }
      return notes.join('; ');
    },
  },
  {
    name: 'The foreign desk: with about two answers in flight, vLLM\'s 10 ms fixed step costs a Spark several points against llama.cpp\'s 1 ms step, and cutting that step wins them back',
    check({ runScenario, assert }) {
      const m = missionById('foreign-desk');
      const at = (runtime, seed, overrides = {}) => runScenario({
        box: { id: 'dgx-spark', count: 1, mode: 'replica' }, model: { id: 'gpt-oss-120b', quant: 'mxfp4', kv: 'f16' },
        runtime: { id: runtime, overrides }, groups: m.groups, seed,
      }, { duration: m.duration });
      const pct = (r) => Math.round(r.passRate * 1000) / 10;
      let note = '';
      for (const seed of [7, 11, 23, 42]) {
        const cpp = at('llamacpp', seed), vllm = at('vllm', seed), lean = at('vllm', seed, { stepMs: 1 });
        const tag = `seed ${seed}: llama.cpp ${pct(cpp)}%, vLLM ${pct(vllm)}%, vLLM at 1 ms a step ${pct(lean)}%`;
        // Few answers in flight: a batching server has little to batch.
        assert(vllm.util.avgBatch < 3, `${tag}; vLLM average batch ${vllm.util.avgBatch}`);
        // vLLM at its calibrated 10 ms a step misses the desk, and the 1 ms slot server does better on every seed.
        assert(scoreMission(m, vllm).stars === 0 && cpp.passRate > vllm.passRate + 0.04, tag);
        // Change one thing: cut vLLM's fixed cost per step to llama.cpp's.
        assert(lean.passRate > vllm.passRate + 0.04, tag);
        assert(lean.groups[0].e2e.p50 < 0.85 * vllm.groups[0].e2e.p50, `${tag}; median ${lean.groups[0].e2e.p50} s vs ${vllm.groups[0].e2e.p50} s`);
        if (seed === 7) note = tag;
      }
      return note;
    },
  },
  {
    name: 'Twenty ships, two satellite links: the proxy that holds each reply fails the old-link half, not the orbit, and the same satellite passes once the answer streams',
    check({ runScenario, assert }) {
      const m = missionById('fleet-two-satellites');
      const [starlink, geo] = m.groups;
      const spark = (crowd) => on(runScenario, crowd, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm', {}, { duration: m.duration });
      const r = spark(m.groups);
      assert(r.groups[0].passPct >= 0.95 && r.groups[1].passPct <= 0.4, `Starlink ${r.groups[0].passPct}, GEO ${r.groups[1].passPct}`);
      assert(r.bottleneck.id === 'bandwidth', `bottleneck ${r.bottleneck.id}`);
      assert(scoreMission(m, r).stars === 0, 'a lagging half must cost the star');
      // Only the link changes: Starlink's round trip behind the same proxy still fails.
      const moved = spark([starlink, { ...geo, link: 'starlink' }]);
      assert(moved.groups[1].passPct <= 0.6, `held replies over Starlink ${moved.groups[1].passPct}`);
      // Only the delivery changes: the same satellite, streamed, with the Starlink half's targets.
      const streamed = spark([starlink, { ...geo, protocol: 'sse', tweak: { think: geo.tweak.think } }]);
      assert(streamed.groups[1].passPct >= 0.95, `streamed over GEO ${streamed.groups[1].passPct}`);
      assert(streamed.groups[1].passPct - moved.groups[1].passPct >= 0.4, `streaming gains ${streamed.groups[1].passPct - moved.groups[1].passPct}, the shorter orbit ${moved.groups[1].passPct - r.groups[1].passPct}`);
      return `GEO ${Math.round(r.groups[1].passPct * 100)}%, on Starlink's orbit ${Math.round(moved.groups[1].passPct * 100)}%, streamed ${Math.round(streamed.groups[1].passPct * 100)}%`;
    },
  },
  {
    name: 'The backfill that ate the help desk: eight workers that never pause fill four slots, and more slots still leave the agents behind a passing average',
    check({ runScenario, assert }) {
      const m = missionById('helpdesk-backfill');
      const [agents, backfill] = m.groups;
      const mac = ['mac-m5max-128', 'qwen3-next-80b', 'q4', 'llamacpp'];
      // The desk alone passes on four slots; add the backfill and the agents wait behind it.
      const alone = on(runScenario, [agents], ...mac);
      const busy = on(runScenario, m.groups, ...mac);
      assert(alone.groups[0].passPct >= 0.95, `agents alone ${alone.groups[0].passPct}`);
      assert(busy.bottleneck.id === 'slots' && busy.groups[0].passPct < 0.05 && busy.groups[1].passPct > 0.95, `bottleneck ${busy.bottleneck.id}, agents ${busy.groups[0].passPct}, backfill ${busy.groups[1].passPct}`);
      // One worker leaves slots free, and the desk comes back.
      const one = on(runScenario, [agents, { ...backfill, count: 1 }], ...mac);
      assert(one.groups[0].passPct >= 0.9, `agents with one worker ${one.groups[0].passPct}`);
      // Sixteen slots end the wait, but the tickets' prompts share every pass:
      // the average passes, the agents do not, and the star is lost.
      const wide = { slots: 16, ctxPerSlot: 8192 };
      const wideAlone = on(runScenario, [agents], ...mac, wide);
      const pooled = on(runScenario, m.groups, ...mac, wide);
      assert(wideAlone.groups[0].passPct >= 0.95, `agents alone on 16 slots ${wideAlone.groups[0].passPct}`);
      assert(pooled.passRate >= 0.95 && pooled.groups[0].passPct >= 0.8 && pooled.groups[0].passPct < 0.95, `pooled ${pooled.passRate}, agents ${pooled.groups[0].passPct}`);
      const s = scoreMission(m, pooled);
      assert(s.stars === 0 && failing(m, pooled).some((t) => t.includes('only')), 'a lagging group must cost the star');
      return `agents ${Math.round(alone.groups[0].passPct * 100)}% alone, ${Math.round(busy.groups[0].passPct * 100)}% with the backfill, ${Math.round(pooled.groups[0].passPct * 100)}% on 16 slots (average ${Math.round(pooled.passRate * 100)}%)`;
    },
  },
  {
    name: 'The solar-powered school lab: on gpt-oss-20b a DGX Spark answers all 36 students but idles above the 30 W allowance, and a Mac mini passes once the burst gets eight slots',
    check({ runScenario, assert }) {
      const m = missionById('solar-school-lab');
      const at = (seed, box, runtime, overrides = {}) => runScenario({
        box: { id: box, count: 1, mode: 'replica' }, model: { id: 'gpt-oss-20b', quant: 'mxfp4', kv: 'f16' },
        runtime: { id: runtime, overrides }, groups: m.groups, seed,
      }, { duration: m.duration });
      const notes = [];
      for (const seed of [7, 11, 23, 42]) {
        // The Spark serves the class within budget; its idle alone is over the allowance.
        const spark = at(seed, 'dgx-spark', 'vllm');
        assert(spark.engine.idleW > m.maxWatts, `Spark idle ${spark.engine.idleW} W`);
        assert(spark.passRate >= 0.97 && spark.util.avgW > m.maxWatts + 15, `seed ${seed}: Spark ${spark.passRate}, ${spark.util.avgW} W`);
        const lost = failing(m, spark).filter((t) => !t.startsWith('Par'));
        assert(lost.length === 1 && lost[0].includes('solar limit'), `seed ${seed}: Spark fails ${lost.join(' | ')}`);
        // Same Mac mini, same model, same server: only the slot count changes.
        const four = at(seed, 'mac-mini-m5pro', 'llamacpp');
        const eight = at(seed, 'mac-mini-m5pro', 'llamacpp', { slots: 8, ctxPerSlot: 16384 });
        assert(four.bottleneck.id === 'slots' && four.passRate < m.goal - 0.05, `seed ${seed}: 4 slots ${four.passRate}, ${four.bottleneck.id}`);
        assert(scoreMission(m, eight).stars === 3 && eight.util.avgW <= m.maxWatts - 3, `seed ${seed}: 8 slots ${scoreMission(m, eight).stars} stars, ${eight.util.avgW} W`);
        assert(eight.util.avgW < four.util.avgW - 3, `seed ${seed}: 8 slots ${eight.util.avgW} W vs 4 slots ${four.util.avgW} W`);
        notes.push(`${Math.round(spark.util.avgW)}/${Math.round(four.passRate * 100)}%/${Math.round(eight.util.avgW)}`);
      }
      return `Spark W / 4-slot pass / 8-slot W by seed: ${notes.join(', ')}`;
    },
  },
  {
    name: 'The six-language guide: without a host-RAM prompt cache, six tour scripts evict each other from four slots; with it, six languages cost what one does',
    check({ runScenario, assert }) {
      const m = missionById('six-language-guide');
      // The same 100 visitors, all on one shared script: only the prompt identity changes.
      const one = m.groups.map((g) => ({ ...g, prefixId: 'guide' }));
      const cold6 = on(runScenario, m.groups, 'mac-m5max-128', 'qwen3-next-80b', 'q2', 'llamacpp', { hostCacheGB: 0 }, { kv: 'q8' });
      const cold1 = on(runScenario, one, 'mac-m5max-128', 'qwen3-next-80b', 'q2', 'llamacpp', { hostCacheGB: 0 }, { kv: 'q8' });
      assert(cold6.util.cacheHit < 0.5 && cold1.util.cacheHit > 0.8, `from cache without host RAM: six scripts ${cold6.util.cacheHit}, one ${cold1.util.cacheHit}`);
      assert(cold1.passRate > cold6.passRate + 0.5, `without host RAM: six scripts ${cold6.passRate}, one ${cold1.passRate}`);
      // llama.cpp's default 8 GiB host cache keeps all six, so the language count stops mattering.
      const warm6 = on(runScenario, m.groups, 'mac-m5max-128', 'qwen3-next-80b', 'q2', 'llamacpp', {}, { kv: 'q8' });
      const warm1 = on(runScenario, one, 'mac-m5max-128', 'qwen3-next-80b', 'q2', 'llamacpp', {}, { kv: 'q8' });
      assert(warm6.util.cacheHit > 0.88 && Math.abs(warm6.passRate - warm1.passRate) < 0.02, `with host RAM: six scripts ${warm6.passRate}, one ${warm1.passRate}`);
      assert(scoreMission(m, warm6).stars >= 1, `default llama.cpp: ${failing(m, warm6).join(' | ')}`);
      // A paged prefix cache holds all six as well.
      const paged = on(runScenario, m.groups, 'dgx-spark', 'qwen3-next-80b', 'q2', 'vllm', {}, { kv: 'q8' });
      assert(paged.util.cacheHit > 0.88, `vLLM from cache ${paged.util.cacheHit}`);
      return `no host RAM: six ${Math.round(cold6.passRate * 100)}%, one ${Math.round(cold1.passRate * 100)}%; host RAM: six ${Math.round(warm6.passRate * 100)}%, one ${Math.round(warm1.passRate * 100)}%`;
    },
  },
  {
    name: "The law faculty's drafting assistant: the tier 4.5 floor, not the crowd, rules out every single 128 GB box, and a split pair makes par only with a smaller KV cache",
    check({ runScenario, compareBoxes, buildEngine, assert }) {
      const m = missionById('tier-floor-lab');
      const run = (seed, box, count, model, quant, kv, runtime, overrides = {}) => runScenario({
        box: { id: box, count, mode: count > 1 ? 'split' : 'replica' },
        model: { id: model, quant, kv }, runtime: { id: runtime, overrides }, groups: m.groups, seed,
      }, { duration: m.duration });
      const stars = (r) => scoreMission(m, r).stars;
      // Qwen3 235B at Q6_K is the smallest load at tier 4.5 in the catalog. With one
      // 4K slot and a 4-bit KV cache it still fits no box of 128 GB or less
      // (and a 4-bit KV cache would cost it the tier anyway).
      const qwen = { id: 'qwen3-235b-a22b', quant: 'q6', kv: 'q4' };
      const rows = compareBoxes({ box: { id: 'dgx-spark', count: 1, mode: 'replica' }, model: qwen,
        runtime: { id: 'llamacpp', overrides: { slots: 1, ctxPerSlot: 4096 } }, groups: m.groups, seed: 7, includeAnnounced: true }, { duration: 60 });
      const small = rows.filter((r) => buildEngine({ box: { id: r.boxId, count: 1 }, model: qwen, runtime: { id: 'llamacpp' }, groups: [] }).box.memGB <= 128);
      assert(small.length >= 7, `${small.length} boxes of 128 GB or less`);
      const fits = small.filter((r) => r.report.ok || r.report.fit.code !== 'weights').map((r) => r.boxId);
      assert(!fits.length, `tier 4.5 fits on ${fits.join(', ')}`);
      // The same Spark and server: lowering the precision until Qwen3 235B fits lowers its tier below the floor.
      const q2 = buildEngine({ box: { id: 'dgx-spark', count: 1 }, model: { id: 'qwen3-235b-a22b', quant: 'q2', kv: 'q8' }, runtime: { id: 'vllm' }, groups: [] });
      assert(q2.fit.ok && q2.model.tier - q2.quant.tierLoss < m.minTier, 'Q2_K should fit one Spark and sit under the floor');
      // Two split M5 Max boxes keep about 7 GB beside the weights: llama.cpp's default 4 x 16K slots need 12.6 GB at FP16.
      const f16 = run(7, 'mac-m5max-128', 2, 'qwen3-235b-a22b', 'q6', 'f16', 'llamacpp');
      assert(!f16.ok && f16.fit.code === 'kv', 'FP16 KV should not fit the split pair');
      let low = 1, pair8 = 1, ultra = 1;
      for (const seed of [7, 11, 23, 42]) {
        // One change, the model: gpt-oss-120b serves the crowd on a Spark and fails only on tier.
        const oss = run(seed, 'dgx-spark', 1, 'gpt-oss-120b', 'mxfp4', 'f16', 'vllm');
        const fails = failing(m, oss);
        assert(oss.passRate >= 0.95 && fails.some((t) => t.startsWith('Capability tier 4.0')) && fails.every((t) => t.startsWith('Capability tier') || t.startsWith('Par')), `seed ${seed} gpt-oss-120b: ${Math.round(oss.passRate * 100)}%, ${fails.join(' | ')}`);
        // One change, the KV type: FP16 does not fit beside the weights (above); Q8 in the default 4 slots serves.
        const q8 = run(seed, 'mac-m5max-128', 2, 'qwen3-235b-a22b', 'q6', 'q8', 'llamacpp');
        assert(stars(q8) === 3, `seed ${seed}: split pair with Q8 KV, 4 slots: ${Math.round(q8.passRate * 100)}%, ${stars(q8)} stars`);
        low = Math.min(low, q8.passRate);
        // One change, the box: the same server layout on one M5 Ultra 256 serves as well and costs more than par.
        const par = run(seed, 'mac-m5max-128', 2, 'qwen3-235b-a22b', 'q6', 'q8', 'llamacpp');
        const big = run(seed, 'mac-m5ultra-256', 1, 'qwen3-235b-a22b', 'q6', 'q8', 'llamacpp');
        assert(stars(par) === 3 && stars(big) === 2, `seed ${seed}: split pair ${stars(par)} stars, M5 Ultra ${stars(big)} stars`);
        pair8 = Math.min(pair8, par.passRate); ultra = Math.min(ultra, big.passRate);
        // One change, the precision: Q5_K_M serves the crowd and lands at tier 4.45, shown as such.
        const q5 = run(seed, 'mac-m5max-128', 2, 'qwen3-235b-a22b', 'q5', 'q8', 'llamacpp', { slots: 8, ctxPerSlot: 16384 });
        assert(q5.passRate >= 0.95 && stars(q5) === 0 && failing(m, q5).includes('Capability tier 4.45 (needs 4.5)'), `seed ${seed} Q5: ${failing(m, q5).join(' | ')}`);
      }
      return `worst seed: split pair ${Math.round(pair8 * 100)}% (Q8 KV, 4 slots ${Math.round(low * 100)}%), M5 Ultra ${Math.round(ultra * 100)}%`;
    },
  },
  {
    name: 'Deep in the monorepo: Qwen3 30B-A3B passes at 18K tokens and fails near 100K; a smaller KV cache wins it back, smaller weights do not',
    check({ runScenario, assert }) {
      const deep = CROWDS.monorepo.groups;
      const oneStep = deep.map((g) => ({ ...g, tweak: { ...g.tweak, turns: 1 } }));
      const heavy = on(runScenario, deep, 'dgx-spark', 'qwen3-30b-a3b', 'q8', 'vllm');
      const shallow = on(runScenario, oneStep, 'dgx-spark', 'qwen3-30b-a3b', 'q8', 'vllm');
      const lean = on(runScenario, deep, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      const fp8Kv = on(runScenario, deep, 'dgx-spark', 'qwen3-30b-a3b', 'q8', 'vllm', {}, { kv: 'q8' });
      const q4Weights = on(runScenario, deep, 'dgx-spark', 'qwen3-30b-a3b', 'q4', 'vllm');
      assert(shallow.passRate >= 0.9 && heavy.passRate < 0.5, `Qwen3 30B-A3B at one step ${shallow.passRate}, over the full run ${heavy.passRate}`);
      assert(lean.passRate >= 0.85, `gpt-oss-120b (36 KB of KV per token against 96 KB) ${lean.passRate}`);
      assert(heavy.bottleneck.id === 'bandwidth' && heavy.util.kvShare > 0.6 && heavy.advice.some((t) => t.includes('KV cache')), `blame ${heavy.bottleneck.id}, KV share of reads ${heavy.util.kvShare}`);
      assert(fp8Kv.passRate > heavy.passRate + 0.25 && q4Weights.passRate < heavy.passRate + 0.15, `FP8 KV ${fp8Kv.passRate}, Q4 weights ${q4Weights.passRate}, against ${heavy.passRate}`);
      return `one step ${Math.round(shallow.passRate * 100)}%, full run ${Math.round(heavy.passRate * 100)}%, FP8 KV ${Math.round(fp8Kv.passRate * 100)}%, Q4 weights ${Math.round(q4Weights.passRate * 100)}%, gpt-oss-120b ${Math.round(lean.passRate * 100)}%`;
    },
  },
  {
    name: 'Twenty-four agents on 8-second steps: an RTX 5090 PC with gpt-oss-20b serves them and two DGX Sparks do not, until longer tool output fills its 32 GB',
    check({ runScenario, assert }) {
      const swarm = CROWDS.swarm.groups;
      const gpu = on(runScenario, swarm, 'rtx-5090', 'gpt-oss-20b', 'mxfp4', 'vllm');
      const two = on(runScenario, swarm, 'dgx-spark', 'gpt-oss-20b', 'mxfp4', 'vllm', {}, { count: 2 });
      assert(gpu.passRate >= 0.95 && two.passRate < 0.5, `5090 ${gpu.passRate}, 2x Spark ${two.passRate}`);
      assert(two.groups[0].e2e.p50 > 3 * gpu.groups[0].e2e.p50, `step p50: 2x Spark ${two.groups[0].e2e.p50}, 5090 ${gpu.groups[0].e2e.p50}`);
      // Fewer agents do not rescue the Sparks: one stream is too slow for the step.
      const three = on(runScenario, [{ ...swarm[0], count: 3 }], 'dgx-spark', 'gpt-oss-20b', 'mxfp4', 'vllm', {}, { count: 2 });
      assert(three.passRate < 0.95, `3 agents on 2x Spark ${three.passRate}`);
      // Same box, longer tool output: 24 histories outgrow the 32 GB card's KV cache.
      const long = [{ ...swarm[0], tweak: { ...swarm[0].tweak, prompt: 1400 } }];
      const full = on(runScenario, long, 'rtx-5090', 'gpt-oss-20b', 'mxfp4', 'vllm');
      assert(full.passRate < 0.6 && full.util.kvPeak > 0.95 && full.util.blockedKv > 0.4, `5090 at 1,400-token tool output: ${full.passRate}, KV ${full.util.kvPeak}, blocked ${full.util.blockedKv}`);
      // Same box, a model of the same tier without sliding-window layers: the KV cache fills too.
      const dense = on(runScenario, swarm, 'rtx-5090', 'qwen3-30b-a3b', 'q4', 'vllm');
      assert(dense.passRate < 0.6 && dense.util.blockedKv > 0.4, `Qwen3 30B-A3B on 5090 ${dense.passRate}, blocked ${dense.util.blockedKv}`);
      return `5090 ${Math.round(gpu.passRate * 100)}%, 2x Spark ${Math.round(two.passRate * 100)}%, 5090 at 1,400-token tool output ${Math.round(full.passRate * 100)}%`;
    },
  },
{
    name: 'The dairy on one clock: 120 controllers that fire on the same second fail on a Mac mini and on a DGX Spark, and spreading the timers over two minutes passes on both',
    check({ runScenario, assert }) {
      // Every five minutes each barn controller posts its readings and waits 20 s for the model's answer before it
      // falls back to its fixed schedule. cron on NTP-synced clocks fires within a second or two of the others;
      // systemd's RandomizedDelaySec=120 keeps the five-minute cycle and spreads it over two minutes.
      const herd = CROWDS.dairy.groups;
      const spread = herd.map((g) => ({ ...g, tweak: { ...g.tweak, burstSpread: 120 } }));
      const mini = on(runScenario, herd, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'mlx');
      const miniSpread = on(runScenario, spread, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'mlx');
      assert(mini.passRate < 0.4 && miniSpread.passRate >= 0.95, `Mac mini, MLX defaults: one clock ${mini.passRate}, spread ${miniSpread.passRate}`);
      const spark = on(runScenario, herd, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      const sparkSpread = on(runScenario, spread, 'dgx-spark', 'gpt-oss-120b', 'mxfp4', 'vllm');
      assert(spark.passRate < 0.2 && sparkSpread.passRate >= 0.95, `DGX Spark, vLLM: one clock ${spark.passRate}, spread ${sparkSpread.passRate}`);
      // More slots alone fall short: at 64 the Mac mini is pegged while the burst lasts and idle after it.
      const wide = on(runScenario, herd, 'mac-mini-m5pro', 'gpt-oss-20b', 'mxfp4', 'mlx', { slots: 64, ctxPerSlot: 4096 });
      const peak = Math.max(...wide.series.map((s) => s.busy));
      assert(wide.passRate < 0.7 && peak >= 0.95 && wide.util.busy < 0.2, `64 slots: pass ${wide.passRate}, peak busy ${peak}, average busy ${wide.util.busy}`);
      return `one clock ${Math.round(mini.passRate * 100)}% and ${Math.round(spark.passRate * 100)}%, spread ${Math.round(miniSpread.passRate * 100)}% and ${Math.round(sparkSpread.passRate * 100)}%, 64 slots ${Math.round(wide.passRate * 100)}%`;
    },
  },
  {
    name: 'Forty robots waiting on a task: replicas shorten the queue, not the task, so eight mostly idle GX10s still run late; two paired as one server write each task faster, and a box with more GB/s clears it',
    check({ runScenario, assert }) {
      const crowd = CROWDS.robots.groups;
      const one = on(runScenario, crowd, 'asus-gx10', 'gpt-oss-120b', 'mxfp4', 'vllm');
      const eight = on(runScenario, crowd, 'asus-gx10', 'gpt-oss-120b', 'mxfp4', 'vllm', {}, { count: 8 });
      assert(eight.engine.decodeTps === one.engine.decodeTps, `one task at ${one.engine.decodeTps} tok/s on one GX10, ${eight.engine.decodeTps} on eight`);
      assert(eight.passRate > one.passRate + 0.2, `replicas must shorten the queue: 1x ${one.passRate}, 8x ${eight.passRate}`);
      assert(eight.util.busy < 0.3 && eight.passRate < 0.8, `8x GX10 ${Math.round(eight.util.busy * 100)}% busy, ${eight.passRate} on time`);
      const two = on(runScenario, crowd, 'asus-gx10', 'gpt-oss-120b', 'mxfp4', 'vllm', {}, { count: 2 });
      const paired = on(runScenario, crowd, 'asus-gx10', 'gpt-oss-120b', 'mxfp4', 'vllm', {}, { count: 2, mode: 'split' });
      assert(paired.engine.decodeTps > two.engine.decodeTps * 1.25, `paired ${paired.engine.decodeTps} tok/s vs replicas ${two.engine.decodeTps}`);
      assert(paired.passRate > two.passRate + 0.08, `paired ${paired.passRate} vs replicas ${two.passRate}`);
      const card = on(runScenario, crowd, 'rtx-pro-6000', 'gpt-oss-120b', 'mxfp4', 'vllm');
      assert(card.passRate >= 0.97, `RTX PRO 6000 ${card.passRate}`);
      return `1x ${Math.round(one.passRate * 100)}%, 8x ${Math.round(eight.passRate * 100)}% at ${Math.round(eight.util.busy * 100)}% busy, 2x ${Math.round(two.passRate * 100)}%, paired ${Math.round(paired.passRate * 100)}%, RTX PRO 6000 ${Math.round(card.passRate * 100)}%`;
    },
  },
];

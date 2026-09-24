// ── Report ───────────────────────────────────────────────────
// Turns a finished (or paused) simulation into the answer a buyer needs:
// did people get good answers, what ran out first, and what the box costs
// to run against what the same tokens would cost from a cloud API.

import { percentile } from './rng.js';
import { singleUserSpeeds, fmtK } from './perf.js';

const G = 1e9;

/** Defaults: $/kWh, amortization years, busy hours a day, cloud $/M tokens in and out. */
export const DEFAULT_ECON = { kwh: 0.17, years: 3, hours: 8, cloudIn: 0.4, cloudOut: 1.6 };

const pct = (a, p) => (a.length ? percentile(a, p) : null);

export function engineSummary(eng) {
  const speeds = eng.fit.ok || eng.fit.code === 'kv' ? singleUserSpeeds(eng) : { decodeTps: 0, prefillTps: 0, decodeBound: '' };
  return {
    box: eng.box.short, boxName: eng.box.name, count: eng.count, split: eng.split, servers: eng.servers,
    model: eng.model.name, quant: eng.quant.label, kv: eng.kv.label, runtime: eng.rt.name,
    weightsGB: eng.fp.weightBytes / G, usableGB: eng.usable / G, overheadGB: eng.overhead / G,
    kvPoolGB: eng.kvPool / G, freeGB: eng.freeBytes / G,
    kvPerTokKB: eng.fp.kvFull / 1024, maxBatch: eng.maxBatch, slotCtx: eng.slotCtx,
    batching: eng.rt.batching, tier: eng.tier, priceUsd: eng.priceUsd,
    idleW: eng.idleW, loadW: eng.loadW, dtype: eng.dtype,
    ...speeds,
  };
}

function groupSummary(sim, Gp, T) {
  const S = Gp.stats, P = Gp.persona;
  // Requests still in flight past their deadline are misses too, or a box so
  // slow that nothing finishes would look perfect.
  // Their waiting time is blamed on the phase they are stuck in.
  const limit = P.slo.e2e || P.slo.ttft || P.patience;
  const blame = { ...S.blame };
  const PHASE = ['net', 'net', 'queue', 'prefill', 'decode', 'net'];
  let late = 0;
  for (const u of Gp.users) {
    if (!u.req || sim.t - u.req.tSend <= limit) continue;
    late++;
    const phase = PHASE[u.state];
    if (phase) blame[phase] += sim.t - Math.max(u.req.tSend, sim.warmup);
  }
  const n = S.n + late;
  return {
    gi: Gp.gi, persona: P.name, personaId: P.id, client: Gp.client.name, link: Gp.link.def.name,
    linkId: Gp.link.def.id, maxClients: Gp.link.maxClients,
    count: Gp.users.length, unserved: Gp.unserved, offReason: Gp.offReason,
    n, pass: S.pass, miss: S.miss + late, late,
    passPct: n ? S.pass / n : null,
    ttft: { p50: pct(S.ttft, 0.5), p95: pct(S.ttft, 0.95) },
    e2e: { p50: pct(S.e2e, 0.5), p95: pct(S.e2e, 0.95) },
    tps: { p50: pct(S.tps, 0.5), p5: pct(S.tps, 0.05) },
    fail: { ...S.fail }, truncated: S.truncated,
    perHour: S.n / T * 3600, tokIn: S.tokIn, tokOut: S.tokOut,
    blame, time: { ...S.time },
    linkUtil: Gp.link.shared ? Gp.link.busyS / Math.max(1, sim.t) : 0,
    linkWaitPeak: Gp.link.backlogPeakS,
    slo: P.slo,
  };
}

export function buildReport(sim, duration) {
  const { eng } = sim;
  const summary = engineSummary(eng);
  if (!eng.fit.ok) {
    return { ok: false, fit: eng.fit, engine: summary, groups: [], verdict: { id: 'nofit', label: 'Does not fit', text: eng.fit.reason }, advice: fitAdvice(eng), series: [] };
  }
  const D = Math.max(1, duration);
  const T = Math.max(1, D - sim.warmup);
  const groups = sim.groups.map((g) => groupSummary(sim, g, T));

  // ── Utilisation ──
  const n = sim.servers.length;
  const sum = (f) => sim.servers.reduce((a, s) => a + f(s.stats), 0);
  const busyS = sum((s) => s.busyS);
  const busy = busyS / (n * D);
  const bwUtil = sum((s) => s.bytes) / (eng.peakBw * n * D);
  const computeUtil = sum((s) => s.flops) / (eng.peakFlops * n * D);
  const memS = sum((s) => s.memS), compS = sum((s) => s.compS);
  const memShare = memS + compS ? memS / (memS + compS) : 1;
  const kvPeak = Math.max(...sim.servers.map((s) => s.kvPeak)) / Math.max(1, eng.kvPool);
  const avgBatch = busyS ? sum((s) => s.batchTime) / busyS : 0;
  const cached = sum((s) => s.tokCached), prefilled = sum((s) => s.tokPrefill);
  const blockedSlots = sum((s) => s.blockedSlots) / (n * D);
  const blockedKv = sum((s) => s.blockedKv) / (n * D);
  const tokOut = sum((s) => s.tokOut);
  const intensity = busy > 0 ? Math.min(1, Math.max(bwUtil, computeUtil) / busy) : 0;
  const avgW = eng.idleW + (eng.loadW - eng.idleW) * Math.min(1, busy) * (0.55 + 0.45 * intensity);
  const util = { busy, bwUtil, computeUtil, memShare, kvPeak, avgBatch, blockedSlots, blockedKv,
    cacheHit: cached + prefilled ? cached / (cached + prefilled) : 0, tokPerS: tokOut / D, avgW };

  // ── Outcome ──
  const tot = groups.reduce((a, g) => ({ n: a.n + g.n, pass: a.pass + g.pass, unserved: a.unserved + g.unserved, users: a.users + g.count }), { n: 0, pass: 0, unserved: 0, users: 0 });
  const passRate = tot.n ? tot.pass / tot.n : null;
  const blame = { queue: 0, prefill: 0, decode: 0, net: 0, render: 0 };
  const fails = {};
  for (const g of groups) {
    for (const k in blame) blame[k] += g.blame[k];
    for (const k in g.fail) fails[k] = (fails[k] || 0) + g.fail[k];
  }
  const bottleneck = findBottleneck({ eng, groups, util, blame, fails, passRate, tot });
  const verdict = judge({ passRate, util, tot, bottleneck });
  const econ = economics(sim, groups, util, T);
  return {
    ok: true, engine: summary, groups, util, blame, fails, passRate,
    users: tot.users, unserved: tot.unserved, requests: tot.n,
    bottleneck, verdict, econ, advice: advise(eng, bottleneck, util, groups, verdict),
    series: sim.series, duration: D, measured: T,
  };
}

function findBottleneck({ eng, groups, util, blame, fails, passRate, tot }) {
  if (tot.unserved > 0) {
    const g = groups.find((x) => x.unserved > 0);
    const why = g.offReason === 'range' ? `is out of range of the ${g.link}` : `cannot join: the ${g.link} holds ${g.maxClients} clients`;
    return { id: 'connections', label: 'Connections', text: `${g.unserved} ${g.persona.toLowerCase()} ${g.unserved === 1 ? 'user' : 'users'} ${why}.` };
  }
  const ctxFails = fails.context || 0;
  if (ctxFails > 0 && ctxFails >= 0.2 * (tot.n || 1)) {
    return { id: 'context', label: 'Context window', text: `${ctxFails} requests were longer than the ${fmtK(eng.slotCtx)} context the server was started with.` };
  }
  const missing = passRate === null || passRate < 0.95;
  if (missing) {
    const totalBlame = Object.values(blame).reduce((a, b) => a + b, 0);
    const gaveUp = fails['gave up'] || 0;
    let top = 'queue';
    if (totalBlame > 0) top = Object.entries(blame).sort((a, b) => b[1] - a[1])[0][0];
    if (gaveUp > 0 && gaveUp >= 0.3 * (tot.n - tot.pass)) top = 'queue';
    const share = totalBlame ? blame[top] / totalBlame : 1;
    if (top === 'queue') {
      if (util.blockedKv > util.blockedSlots && util.blockedKv > 0.02) return mk('kv', share, `Requests waited for KV cache space: memory for conversations peaked at ${Math.round(util.kvPeak * 100)}% of the pool.`);
      if (util.blockedSlots > 0.02) return mk('slots', share, `Requests waited for one of ${eng.maxBatch} ${eng.rt.batching === 'slots' ? 'parallel slots' : 'batch places'}.`);
      return mk(util.memShare > 0.5 ? 'bandwidth' : 'compute', share, `The box ran ${Math.round(util.busy * 100)}% busy and the queue grew faster than it drained.`);
    }
    if (top === 'prefill') return mk('prefill', share, 'Reading long prompts took most of the time. Prompt processing is compute-bound.');
    if (top === 'decode') return mk(util.memShare > 0.5 ? 'bandwidth' : 'compute', share, `Generating answers took most of the time, with an average batch of ${util.avgBatch.toFixed(1)}.`);
    if (top === 'net') return mk('link', share, 'Time on the wire dominated: round trips, airtime or a shared channel queue.');
    return mk('client', share, 'The client device took longest: slow screen refreshes or speech processing.');
  }
  const near = [
    ['bandwidth', util.bwUtil], ['compute', util.computeUtil], ['kv', util.kvPeak], ['slots', util.blockedSlots * 4],
  ].sort((a, b) => b[1] - a[1])[0];
  return { id: 'none', label: 'Nothing yet', near: near[0], text: `Every group is inside its targets. First to run out would be ${LABELS[near[0]].toLowerCase()} (${Math.round(near[1] * 100)}% used).` };
}

export const LABELS = {
  bandwidth: 'Memory bandwidth', compute: 'Compute', prefill: 'Prompt processing', kv: 'KV cache memory',
  slots: 'Parallel slots', link: 'Network link', client: 'Client device', connections: 'Connections',
  context: 'Context window', none: 'Nothing yet',
};
const mk = (id, share, text) => ({ id, label: LABELS[id], share, text });

function judge({ passRate, util, tot, bottleneck }) {
  if (tot.unserved > 0) return { id: 'overloaded', label: 'Overloaded', text: `${tot.unserved} of ${tot.users} users could not connect at all.` };
  if (passRate === null) return { id: 'idle', label: 'No answers yet', text: 'Nobody finished a request in the measured window. Run longer, or check the context window.' };
  const p = Math.round(passRate * 100);
  if (passRate < 0.8) return { id: 'overloaded', label: 'Overloaded', text: `Only ${p}% of answers met their target. ${bottleneck.label} is the limit.` };
  if (passRate < 0.95) return { id: 'tight', label: 'Tight', text: `${p}% of answers on target, short of 95%. ${bottleneck.label} is the limit.` };
  if (util.busy > 0.85) return { id: 'tight', label: 'Tight', text: `${p}% of answers on target with the box ${Math.round(util.busy * 100)}% busy. A few more users will tip it over.` };
  if (util.busy < 0.25) return { id: 'overkill', label: 'Overkill', text: `${p}% on target, but the box idles ${Math.round((1 - util.busy) * 100)}% of the time. A cheaper box may do the same job.` };
  return { id: 'right', label: 'Right-sized', text: `${p}% of answers on target with the box ${Math.round(util.busy * 100)}% busy. Room for more users before answers slip.` };
}

function economics(sim, groups, util, T) {
  const eng = sim.eng;
  const E = { ...DEFAULT_ECON, ...(sim.sc?.econ || {}) };
  const scale = (E.hours * 3600) / T;
  const tokIn = groups.reduce((a, g) => a + g.tokIn, 0) * scale;
  const tokOut = groups.reduce((a, g) => a + g.tokOut, 0) * scale;
  const kWhDay = (util.avgW * E.hours + eng.idleW * (24 - E.hours)) / 1000;
  const elecMonth = kWhDay * 30.4 * E.kwh;
  const amortMonth = eng.priceUsd / (E.years * 12);
  const cloudMonth = ((tokIn * E.cloudIn + tokOut * E.cloudOut) / 1e6) * 30.4;
  const served = groups.reduce((a, g) => a + g.count - g.unserved, 0);
  const saving = cloudMonth - elecMonth;
  return {
    ...E, kWhDay, elecMonth, amortMonth, cloudMonth,
    localMonth: elecMonth + amortMonth,
    perUserMonth: served ? (elecMonth + amortMonth) / served : null,
    paybackMonths: saving > 0 ? eng.priceUsd / saving : Infinity,
    tokInDay: tokIn, tokOutDay: tokOut,
  };
}

function fitAdvice(eng) {
  if (eng.fit.code === 'platform') return ['Pick a runtime that supports this box: llama.cpp runs on every platform.'];
  if (eng.fit.code === 'kv') return ['Lower the parallel slots or the context per slot, or quantize the KV cache to Q8.'];
  return [
    'Try a smaller quantization: Q4_K_M stores about 4.9 bits per weight, a third of FP16.',
    eng.box.pairable ? `Pair two boxes over ${eng.box.link.name} and split the model across them.` : 'Pick a box with more memory, or split the model across two boxes (slow on a 10 GbE link).',
    'Or pick a mixture-of-experts model with a similar capability tier and fewer total parameters.',
  ];
}

function advise(eng, b, util, groups, verdict) {
  const out = [];
  const perStepGB = (eng.fp.sharedRead + eng.fp.expertBytes * (eng.model.moe ? eng.model.moe.topK / eng.model.moe.experts : 0)) / G;
  switch (b.id) {
    case 'slots':
      out.push(eng.rt.batching === 'slots'
        ? `Raise the parallel slots above ${eng.maxBatch}, or switch to a paged runtime (vLLM, SGLang) that admits by memory, not by slot count.`
        : `Raise the batch limit above ${eng.maxBatch}; there is KV space to spare.`);
      break;
    case 'kv':
      out.push(`Quantize the KV cache to Q8 to fit twice the conversations, or cap the context. This model stores ${Math.round(eng.fp.kvFull / 1024)} KB per token.`);
      break;
    case 'bandwidth':
      out.push(`Generation is limited by memory bandwidth: one token reads about ${perStepGB.toFixed(1)} GB. A lower quant, a mixture-of-experts model or more GB/s helps; more TFLOPS does not.`);
      break;
    case 'compute':
      out.push('Generation is compute-bound at this batch size. A lower-precision format, or more tensor TFLOPS, helps.');
      break;
    case 'prefill':
      out.push(`Prompt reading is compute-bound (${Math.round(util.cacheHit * 100)}% of prompt tokens came from cache). Shorter prompts, prefix caching, or more tensor TFLOPS help.`);
      break;
    case 'link':
      out.push('The link is the bottleneck. Send tokens in WebSocket batches instead of one event each, send whole answers, or move these users to a wired link.');
      break;
    case 'client':
      out.push('The device is the slowest step. Keep answers short. On e-ink, send the whole answer and refresh once.');
      break;
    case 'context':
      out.push(eng.rt.batching === 'slots'
        ? `Each slot holds ${fmtK(eng.slotCtx)} tokens. Raise the context per slot (fewer slots), or use a paged runtime.`
        : 'Raise the context cap, or trim what each request sends.');
      break;
    case 'connections':
      out.push('Add access points or hubs, or move these users to a link that can hold them.');
      break;
    default: break;
  }
  if (verdict.id === 'overkill') out.push('Open Compare to see which cheaper boxes still pass this crowd.');
  if (eng.quant.tierLoss >= 0.45) out.push(`${eng.quant.label} costs noticeable answer quality; the capability tier drops to ${eng.tier.toFixed(1)}.`);
  const trunc = groups.reduce((a, g) => a + g.truncated, 0);
  if (trunc > 0) out.push(`${trunc} conversations were cut short to fit the ${fmtK(eng.slotCtx)} context; users lose earlier turns.`);
  return out.slice(0, 3);
}

// ── Report ───────────────────────────────────────────────────
// Turns a finished (or paused) simulation into the answer a buyer needs:
// did people get good answers, what ran out first, and what the box costs
// to run against what the same tokens would cost from a cloud API.

import { percentile } from './rng.js';
import { singleUserSpeeds, fmtK } from './perf.js';
import { quantsFor } from '../data/models.js';
import { runtimesFor } from '../data/runtimes.js';

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
    boxId: eng.box.id, status: eng.box.status, pairable: !!eng.box.pairable, splitMode: eng.splitMode,
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
  const ttft = { p50: pct(S.ttft, 0.5), p95: pct(S.ttft, 0.95) };
  const e2e = { p50: pct(S.e2e, 0.5), p95: pct(S.e2e, 0.95) };
  const tps = { p50: pct(S.tps, 0.5), p5: pct(S.tps, 0.05) };
  // How close the slow tail runs to its limits: 1 means the slowest 5% of
  // answers arrive exactly at the target.
  let strain = 0;
  if (P.slo.ttft && ttft.p95 !== null) strain = Math.max(strain, ttft.p95 / P.slo.ttft);
  if (P.slo.e2e && e2e.p95 !== null) strain = Math.max(strain, e2e.p95 / P.slo.e2e);
  if (P.slo.tps && tps.p5) strain = Math.max(strain, P.slo.tps / tps.p5);
  return {
    gi: Gp.gi, persona: P.name, personaId: P.id, client: Gp.client.name, clientNoun: Gp.client.noun || Gp.client.name, link: Gp.link.def.name,
    linkId: Gp.link.def.id, maxClients: Gp.link.maxClients,
    waitsForThinking: !Gp.client.thinking,
    // A worker that asks again the moment it is answered keeps the box busy
    // by design; its busy time says nothing about headroom for people.
    background: !P.think && !P.readTps,
    count: Gp.users.length, unserved: Gp.unserved, offReason: Gp.offReason,
    n, pass: S.pass, miss: S.miss + late, late,
    passPct: n ? S.pass / n : null,
    ttft, e2e, tps, strain,
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
  // Which limit bound the iterations, weighted by time: an iteration is
  // memory-bound when reading takes longer than computing.
  const memBound = sum((s) => s.memBoundS), compBound = sum((s) => s.compBoundS);
  const memShare = memBound + compBound ? memBound / (memBound + compBound) : 1;
  const kvPeak = Math.max(...sim.servers.map((s) => s.kvPeak)) / Math.max(1, eng.kvPool);
  const avgBatch = busyS ? sum((s) => s.batchTime) / busyS : 0;
  const cached = sum((s) => s.tokCached), prefilled = sum((s) => s.tokPrefill);
  const blockedSlots = sum((s) => s.blockedSlots) / (n * D);
  const blockedKv = sum((s) => s.blockedKv) / (n * D);
  const tokOut = sum((s) => s.tokOut);
  const intensity = busy > 0 ? Math.min(1, Math.max(bwUtil, computeUtil) / busy) : 0;
  const avgW = eng.idleW + (eng.loadW - eng.idleW) * Math.min(1, busy) * (0.55 + 0.45 * intensity);
  const kvShare = sum((s) => s.bytes) ? sum((s) => s.kvBytes) / sum((s) => s.bytes) : 0;
  const prefillShare = busyS ? sum((s) => s.prefillS) / busyS : 0;
  const overShare = busyS ? sum((s) => s.overS) / busyS : 0;
  const steps = sum((s) => s.iters);
  const overMs = steps ? (sum((s) => s.overS) / steps) * 1000 : 0;
  const util = { busy, bwUtil, computeUtil, memShare, kvPeak, kvShare, avgBatch, blockedSlots, blockedKv, prefillShare, overShare, overMs,
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
  const verdict = judge({ eng, passRate, util, tot, bottleneck, groups });
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
    const one = g.unserved === 1;
    const why = g.offReason === 'range'
      ? `${one ? 'is' : 'are'} out of range of the ${g.link}`
      : `cannot join: the ${g.link} holds ${g.maxClients} clients`;
    return { id: 'connections', label: 'Connections', text: `${g.unserved} ${g.persona} ${one ? 'user' : 'users'} ${why}.` };
  }
  const cut = fails.truncated || 0;
  const ctxFails = (fails.context || 0) + cut;
  if (ctxFails > 0 && ctxFails >= 0.2 * (tot.n || 1)) {
    return { id: 'context', label: 'Context window', text: cut >= ctxFails / 2
      ? `${eng.rt.name} cut ${cut} prompts to fit its ${fmtK(eng.slotCtx)} window and answered without their start, so those answers were on time and wrong.`
      : `${ctxFails} requests were longer than the ${fmtK(eng.slotCtx)} context the server was started with.` };
  }
  const missing = passRate === null || passRate < 0.95 || groups.some((g) => g.n > 0 && g.passPct !== null && g.passPct < 0.95);
  if (missing) {
    const totalBlame = Object.values(blame).reduce((a, b) => a + b, 0);
    const gaveUp = fails['gave up'] || 0;
    let top = 'queue';
    if (totalBlame > 0) top = Object.entries(blame).sort((a, b) => b[1] - a[1])[0][0];
    if (gaveUp > 0 && gaveUp >= 0.3 * (tot.n - tot.pass)) top = 'queue';
    const share = totalBlame ? blame[top] / totalBlame : 1;
    const overhead = () => mk('runtime', share, `${eng.rt.name} spends about ${util.overMs.toFixed(1)} ms of every step on fixed work (scheduling, kernel launches, sampling), ${Math.round(util.overShare * 100)}% of the time the box was busy.`);
    if (top === 'queue') {
      if (util.blockedKv > util.blockedSlots && util.blockedKv > 0.02) return mk('kv', share, `Requests waited for KV cache space: memory for conversations peaked at ${Math.round(util.kvPeak * 100)}% of the pool.`);
      if (util.blockedSlots > 0.02) return mk('slots', share, `Requests waited for one of ${eng.maxBatch} ${eng.rt.batching === 'slots' ? 'parallel slots' : 'batch places'}.`);
      // The queue grew because the box was busy; say busy doing what.
      if (util.prefillShare > 0.5) return mk('prefill', share, `The box ran ${Math.round(util.busy * 100)}% busy, and reading prompts took ${Math.round(util.prefillShare * 100)}% of that time. Prompt processing is compute-bound.`);
      if (util.overShare > 0.4) return overhead();
      return mk(util.memShare > 0.5 ? 'bandwidth' : 'compute', share, `The box ran ${Math.round(util.busy * 100)}% busy and the queue grew faster than it drained.`);
    }
    if (top === 'prefill') return mk('prefill', share, 'Reading long prompts took most of the time. Prompt processing is compute-bound.');
    if (top === 'decode') {
      if (util.blockedKv > 0.1 && util.kvPeak > 0.9) return mk('kv', share, `Generation was slow because the KV cache was full ${Math.round(util.blockedKv * 100)}% of the time, so new requests waited while running ones finished.`);
      if (util.overShare > 0.4) return overhead();
      return mk(util.memShare > 0.5 ? 'bandwidth' : 'compute', share, `Generating answers took most of the time, with an average batch of ${util.avgBatch.toFixed(1)}.`);
    }
    if (top === 'net') return mk('link', share, 'Time on the wire dominated: round trips, airtime or a shared channel queue.');
    return mk('client', share, 'The client device took longest: slow screen refreshes or speech processing.');
  }
  const near = [
    ['bandwidth', util.bwUtil], ['compute', util.computeUtil], ['kv', util.kvPeak], ['slots', util.blockedSlots * 4],
  ].sort((a, b) => b[1] - a[1])[0];
  return { id: 'none', label: 'Nothing yet', near: near[0], text: `Every group is inside its targets. First to run out would be ${lowerLabel(near[0])} (${Math.round(near[1] * 100)}% used).` };
}

/** A tier never rounds up across a floor: 4.45 shows as 4.45, not 4.5. */
export function fmtTier(t) {
  return Math.abs(t * 10 - Math.round(t * 10)) < 1e-9 ? t.toFixed(1) : t.toFixed(2);
}

export const LABELS = {
  bandwidth: 'Memory bandwidth', compute: 'Compute', prefill: 'Prompt processing', kv: 'KV cache memory',
  slots: 'Parallel slots', link: 'Network link', client: 'Client device', connections: 'Connections',
  context: 'Context window', runtime: 'Server overhead', none: 'Nothing yet',
};
/** A label mid-sentence: 'memory bandwidth', but 'KV cache memory' keeps its capitals. */
export const lowerLabel = (id) => (LABELS[id] || '').replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
const mk = (id, share, text) => ({ id, label: LABELS[id], share, text });

function judge({ eng, passRate, util, tot, bottleneck, groups }) {
  if (tot.unserved > 0) return { id: 'overloaded', label: 'Overloaded', text: `${tot.unserved} of ${tot.users} users could not connect at all.` };
  if (passRate === null) return { id: 'idle', label: 'No answers yet', text: 'Nobody finished a request in the measured window. Run longer, or check the context window.' };
  const p = Math.round(passRate * 100);
  if (passRate < 0.8) return { id: 'overloaded', label: 'Overloaded', text: `Only ${p}% of answers met their target. ${bottleneck.label} is the limit.` };
  if (passRate < 0.95) return { id: 'tight', label: 'Tight', text: `${p}% of answers on target, short of 95%. ${bottleneck.label} is the limit.` };
  // A pooled share can hide one group that is failing behind an easy one.
  const live = groups.filter((g) => g.n > 0 && g.passPct !== null);
  const worst = [...live].sort((a, b) => a.passPct - b.passPct)[0];
  if (worst && worst.passPct < 0.95) return { id: 'tight', label: 'Tight', text: `${p}% overall, but ${worst.count} x ${worst.persona} get only ${Math.round(worst.passPct * 100)}% on target.` };
  // Headroom is how close the slow tail runs to its limits. Busy time alone
  // misleads: a batching server is busy whenever anyone is generating, and a
  // background worker keeps any box busy on purpose.
  const people = live.filter((g) => !g.background);
  const tightest = [...(people.length ? people : live)].sort((a, b) => b.strain - a.strain)[0];
  const strain = tightest ? tightest.strain : 0;
  const s = Math.round(strain * 100);
  const bg = live.find((g) => g.background);
  const busy = Math.round(util.busy * 100);
  const full = util.avgBatch >= 0.8 * eng.maxBatch || util.blockedSlots > 0.05 || util.blockedKv > 0.05;
  if (strain >= 0.8) return { id: 'tight', label: 'Tight', text: `${p}% of answers on target, but the slowest ${tightest.persona} answers already take ${s}% of the time allowed. A few more users will tip it over.` };
  if (util.busy > 0.85 && full && !bg) return { id: 'tight', label: 'Tight', text: `${p}% of answers on target with the box ${busy}% busy and ${eng.rt.batching === 'slots' ? 'every slot' : 'the batch'} full. A few more users will queue.` };
  if (util.busy < 0.25 && strain < 0.5) return { id: 'overkill', label: 'Overkill', text: `${p}% on target, but the box idles ${100 - busy}% of the time. A cheaper box may do the same job.` };
  if (bg && people.length) return { id: 'right', label: 'Right-sized', text: `${p}% of answers on target. The ${bg.persona.toLowerCase()} keeps the box ${busy}% busy by design, and the slowest ${tightest.persona} answers take ${s}% of the time allowed.` };
  if (bg) return { id: 'right', label: 'Right-sized', text: `${p}% of jobs on target. Workers that never pause keep any box busy, so throughput is the measure: ${Math.round(live.reduce((a, g) => a + g.perHour, 0)).toLocaleString('en-US')} jobs an hour.` };
  return { id: 'right', label: 'Right-sized', text: `${p}% of answers on target with the box ${busy}% busy, and the slowest answers take ${s}% of the time allowed. Room for more users before answers slip.` };
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

/** Is there a server on this box that admits by memory instead of by slot? */
const hasPaged = (eng) => runtimesFor(eng.box.platform).some((r) => r.batching === 'paged');

function kvStep(eng) {
  if (eng.kv.id === 'f16') return 'quantize the KV cache to Q8 to fit twice the conversations';
  if (eng.kv.id === 'q8') return 'quantize the KV cache to Q4 (at some cost in answer quality)';
  return '';
}

function fitAdvice(eng) {
  if (eng.fit.code === 'platform') return [`${eng.rt.name} does not run on ${eng.box.short}. llama.cpp runs on every platform.`];
  if (eng.fit.code === 'kv') {
    const k = kvStep(eng);
    return [`Lower the parallel slots or the context per slot${k ? `, or ${k}` : ''}.`];
  }
  if (eng.fit.code === 'split') return [eng.fit.reason];
  const out = [];
  const smaller = quantsFor(eng.model).filter((q) => q.bits < eng.quant.bits).sort((a, b) => b.bits - a.bits)[0];
  if (smaller) out.push(`Try a smaller quantization: ${smaller.label} stores about ${smaller.bits} bits per weight${smaller.tierLoss >= 0.45 ? ', at a noticeable cost in answer quality' : ''}.`);
  else out.push(`${eng.model.name} ships as ${eng.quant.label} only, so there is no smaller file of it to try.`);
  out.push(eng.box.pairable
    ? `Pair two boxes over ${eng.box.link.name} and split the model across them.`
    : 'Pick a box with more memory. This one cannot be paired to split a model.');
  out.push(eng.model.moe
    ? 'Or pick a model with fewer total parameters: capability tracks active parameters less than you might think.'
    : 'Or pick a mixture-of-experts model with a similar capability tier and fewer total parameters.');
  return out;
}

function advise(eng, b, util, groups, verdict) {
  const out = [];
  const perStepGB = (eng.fp.sharedRead + eng.fp.expertBytes * (eng.model.moe ? eng.model.moe.topK / eng.model.moe.experts : 0)) / G;
  switch (b.id) {
    case 'slots':
      out.push(eng.rt.batching === 'slots'
        ? `Raise the parallel slots above ${eng.maxBatch}${hasPaged(eng) ? ', or switch to a paged runtime (vLLM, SGLang) that admits by memory, not by slot count' : ''}.`
        : `Raise the batch limit above ${eng.maxBatch}; there is KV space to spare.`);
      break;
    case 'kv': {
      const k = kvStep(eng);
      out.push(`${k ? `${k[0].toUpperCase()}${k.slice(1)}, or cap the context` : 'Cap the context, or pick a model that stores less KV per token'}. This model stores ${Math.round(eng.fp.kvFull * eng.kv.bytes / 2 / 1024)} KB per token at ${eng.kv.label}.`);
      break;
    }
    case 'bandwidth': {
      if (util.kvShare > 0.5) {
        const k = kvStep(eng);
        out.push(`Generation is limited by memory bandwidth, and most of it is conversation memory: each step reads more KV cache than weights. ${k ? `${k[0].toUpperCase()}${k.slice(1)}, cap` : 'Cap'} the context, or pick a model that stores less KV per token. A lower weight quant helps less.`);
      } else {
        // Only suggest the levers this setup has not pulled already.
        const levers = [];
        if (eng.quant.bits > 5) levers.push('a lower quant');
        if (!eng.model.moe) levers.push('a mixture-of-experts model');
        else levers.push('a model with fewer active parameters');
        levers.push('more GB/s');
        const list = levers.join(', ').replace(/, ([^,]*)$/, ' or $1');
        out.push(`Generation is limited by memory bandwidth: one token reads about ${perStepGB.toFixed(1)} GB of weights. ${list[0].toUpperCase()}${list.slice(1)} helps; more TFLOPS does not.`);
      }
      break;
    }
    case 'runtime':
      out.push(`Each step costs ${eng.rt.name} about ${util.overMs.toFixed(1)} ms before any math, and with little to batch that fixed cost sets the pace. A leaner server${eng.rt.id === 'trtllm' ? '' : ' (llama.cpp, TensorRT-LLM)'} or more users sharing each step helps; more GB/s does not.`);
      break;
    case 'compute':
      out.push('Generation is compute-bound at this batch size. A lower-precision format, or more tensor TFLOPS, helps.');
      break;
    case 'prefill':
      out.push(eng.rt.prefixCache
        ? `Prompt reading is compute-bound, and prefix caching is already on (${Math.round(util.cacheHit * 100)}% of prompt tokens came from cache). Shorter prompts, a model with fewer active parameters, or more tensor TFLOPS help.`
        : 'Prompt reading is compute-bound and prefix caching is off: turn it on so shared system prompts are read once.');
      if (util.prefillShare > 0.5 && eng.rt.batching === 'slots' && eng.fp.model.moe && hasPaged(eng)) out.push(`${eng.rt.name} reads mixture-of-experts prompts far below the chip's peak; vLLM, SGLang or TensorRT-LLM batch the experts better.`);
      break;
    case 'link':
      out.push('The link is the bottleneck. Send tokens in WebSocket batches instead of one event each, send whole answers, or move these users to a wired link.');
      break;
    case 'client':
      out.push('The device is the slowest step. Keep answers short. On e-ink, send the whole answer and refresh once.');
      break;
    case 'context':
      out.push(eng.rt.batching === 'slots'
        ? `Each slot holds ${fmtK(eng.slotCtx)} tokens. Raise the context per slot${eng.maxBatch > 1 ? ' (with fewer slots if memory is short)' : ''}${hasPaged(eng) ? ', or use a paged runtime' : ''}.`
        : 'Raise the context cap, or trim what each request sends.');
      break;
    case 'connections':
      out.push('Add access points or hubs, or move these users to a link that can hold them.');
      break;
    default: break;
  }
  // A reasoning model thinks before every answer; a device that cannot show
  // that thinking waits for all of it before its first word.
  const lag = groups.find((g) => g.waitsForThinking && g.slo.ttft && g.passPct !== null && g.passPct < 0.95);
  if (eng.model.reasons && lag) out.unshift(`${eng.model.name} always reasons before it answers, and a ${lag.clientNoun} cannot show thinking, so at least ${eng.model.reasons.min} hidden tokens come before the first word. Pick a model that answers straight away.`);
  if (verdict.id === 'overkill') out.push('Open Compare to see which cheaper boxes still pass this crowd.');
  if (eng.quant.tierLoss >= 0.45) out.push(`${eng.quant.label} costs noticeable answer quality; the capability tier drops to ${fmtTier(eng.tier)}.`);
  const trunc = groups.reduce((a, g) => a + g.truncated, 0);
  if (trunc > 0) out.push(`${trunc} ${trunc === 1 ? 'conversation was' : 'conversations were'} cut short to fit the ${fmtK(eng.slotCtx)} context; users lose earlier turns.`);
  return out.slice(0, 3);
}

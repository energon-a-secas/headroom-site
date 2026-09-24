// ── Performance model ────────────────────────────────────────
// A roofline model of one engine iteration. Every iteration reads the
// weights it needs once, reads each running sequence's KV cache, and does
// 2 FLOPs per active parameter per token plus attention. Whichever of
// memory time and compute time is longer sets the iteration's length, plus
// fixed overheads the runtime cannot hide.
//
// That single rule produces the behaviours people discover the hard way:
//   - one user decodes at roughly bandwidth / model size
//   - more users share the same weight read, so total throughput rises
//     until the step turns compute-bound or the KV reads dominate
//   - long prompts are compute-bound, which is where tensor TFLOPS matter
//   - mixture-of-experts models lose part of their edge under batching,
//     because different users wake different experts

import { modelById, quantById, kvById } from '../data/models.js';
import { boxById } from '../data/hardware.js';
import { runtimeById } from '../data/runtimes.js';

const G = 1e9;

/** Weight, KV and FLOP figures for one model at one precision. */
export function footprint(model, quant, kv) {
  const moe = model.moe;
  let sharedB = model.totalB, expertB = 0;
  if (moe) {
    // activeB = shared + topK/E of the experts, and totalB = shared + experts.
    const E = moe.experts, k = moe.topK;
    sharedB = Math.max(0.1, (model.activeB * E - k * model.totalB) / (E - k));
    expertB = model.totalB - sharedB;
  }
  const sharedBits = model.bits?.shared ?? quant.bits;
  const expertBits = model.bits?.expert ?? quant.bits;
  const weightBytes = (sharedB * sharedBits + expertB * expertBits) / 8 * G;
  // Input embeddings are looked up one row per token, not streamed.
  const sharedRead = Math.max(0, sharedB - (model.embedB || 0)) * sharedBits / 8 * G;
  const expertBytes = expertB * expertBits / 8 * G;

  const perLayerTok = 2 * model.kvHeads * model.headDim * kv.bytes;
  const kvFull = model.kvBytesOverride
    ? model.kvBytesOverride / 2 * kv.bytes
    : model.attn.full * perLayerTok;
  const kvSlide = model.attn.sliding * perLayerTok;
  const attnPerCtx = 4 * model.qHeads * model.headDim; // FLOPs per layer per context token

  return {
    model, quant, kv, sharedB, expertB,
    weightBytes, sharedRead, expertBytes,
    kvFull, kvSlide, window: model.attn.window || 0,
    stateBytes: (model.stateMB || 0) * 1e6,
    flopsPerToken: 2 * model.activeB * G,
    flopsExpert: moe ? 2 * Math.max(0, model.activeB - sharedB) * G : 0,
    attnFull: model.attn.full * attnPerCtx,
    attnSlide: model.attn.sliding * attnPerCtx,
    hiddenBytes: model.qHeads * model.headDim * 2,
    layers: model.layers,
  };
}

/** KV bytes held by one sequence at a given context length. */
export function kvBytes(fp, ctx) {
  return fp.kvFull * ctx + fp.kvSlide * Math.min(ctx, fp.window) + fp.stateBytes;
}

/** Attention FLOPs for one new token that sees `ctx` earlier tokens. */
export function attnFlops(fp, ctx) {
  return fp.attnFull * ctx + fp.attnSlide * Math.min(ctx, fp.window);
}

// Routing is skewed: popular experts serve many tokens, so n tokens wake as
// many experts as n^0.65 independent ones would. Fitted to llama.cpp batched
// decoding on DGX Spark (gpt-oss-20b, gpt-oss-120b, Qwen3-30B-A3B at 1, 8, 32).
const ROUTING_SKEW = 0.65;

/** Weight bytes read in an iteration that processes `n` tokens. */
export function weightRead(fp, n) {
  const moe = fp.model.moe;
  if (!moe) return fp.sharedRead;
  const touched = 1 - Math.pow(1 - moe.topK / moe.experts, Math.pow(Math.max(1, n), ROUTING_SKEW));
  return fp.sharedRead + fp.expertBytes * touched;
}

/**
 * Resolve a scenario's hardware, model and runtime into one engine: the
 * effective rates a single server (one box, or several boxes splitting a
 * model) runs at, and how many independent servers there are.
 */
export function buildEngine(sc) {
  const box = boxById(sc.box.id, sc.box.custom);
  const model = modelById(sc.model.id);
  const quant = quantById(sc.model.quant);
  const kv = kvById(sc.model.kv);
  const rt = { ...runtimeById(sc.runtime.id), ...(sc.runtime.overrides || {}) };
  if (rt.batching === 'slots') rt.maxBatch = rt.slots;
  const fp = footprint(model, quant, kv);

  const count = Math.max(1, sc.box.count | 0);
  const split = sc.box.mode === 'split' && count > 1 ? count : 1;
  const servers = sc.box.mode === 'split' ? 1 : count;

  // Low-precision tensor math needs both a runtime that has the kernels and
  // weights stored at that precision.
  const dtype = rt.lowPrecision && box.platform === 'cuda' ? quant.compute : 'fp16';
  const tpEff = split > 1 ? 0.9 : 1;
  const bw = box.bwGBs * G * rt.bwEff * box.eff.bw * split * tpEff;
  const flops = (box.tflops[dtype] || box.tflops.fp16) * 1e12 * rt.computeEff * box.eff.compute * split * tpEff;

  // Tensor parallelism pays two all-reduces per layer per iteration.
  const link = box.link || { latencyUs: 45, gbps: 10 };
  const commPerTok = split > 1 ? 2 * fp.layers * fp.hiddenBytes / (link.gbps * G / 8) : 0;
  const commFixed = split > 1 ? 2 * fp.layers * link.latencyUs * 1e-6 : 0;

  const usable = box.usableGB * G * split;
  const overhead = 1.2 * G + 0.03 * fp.weightBytes + (split > 1 ? 0.5 * G * split : 0);
  const free = usable - fp.weightBytes - overhead;

  const maxBatch = Math.max(1, (rt.batching === 'slots' ? rt.slots : rt.maxBatch) | 0);
  const ctxCap = Math.min(model.maxCtx, sc.model.ctxCap || model.maxCtx);
  const slotCtx = rt.batching === 'slots' ? Math.min(ctxCap, rt.ctxPerSlot | 0) : ctxCap;

  let fit = { ok: true, reason: '' };
  let kvPool = 0;
  if (!rt.platforms.includes(box.platform)) {
    fit = { ok: false, code: 'platform', reason: `${rt.name} does not run on ${box.short} (${box.platform.toUpperCase()}).` };
  } else if (free <= 0) {
    fit = { ok: false, code: 'weights', reason: `${model.name} at ${quant.label} needs ${(fp.weightBytes / G).toFixed(0)} GB of weights plus about ${(overhead / G).toFixed(0)} GB of runtime overhead; ${box.short}${split > 1 ? ` x${split}` : ''} has ${(usable / G).toFixed(0)} GB usable.` };
  } else if (rt.batching === 'slots') {
    const need = maxBatch * kvBytes(fp, slotCtx);
    kvPool = need;
    if (need > free) {
      fit = { ok: false, code: 'kv', reason: `${maxBatch} slots x ${fmtK(slotCtx)} context need ${(need / G).toFixed(1)} GB of KV cache; only ${(free / G).toFixed(1)} GB is left after the weights. Use fewer slots, a shorter context or a smaller KV type.` };
    }
  } else {
    kvPool = free * 0.94; // block fragmentation and scratch space
  }

  // Every iteration launches a few kernels per layer; on fast GPUs with small
  // models that launch floor, not bandwidth, sets the pace.
  const stepMul = box.eff.step ?? 1;
  const launchS = fp.layers * (model.moe ? 60 : 15) * 1e-6 * stepMul;

  return {
    box, model, quant, kv, rt, fp, dtype,
    servers, split, count,
    bw, flops, launchS, moeM0: box.eff.moeM0 ?? 16,
    peakBw: box.bwGBs * G * split, peakFlops: (box.tflops[dtype] || box.tflops.fp16) * 1e12 * split,
    stepS: (rt.stepMs / 1000) * stepMul + commFixed,
    perSeqS: (rt.perSeqMs / 1000) * stepMul,
    commPerTok,
    maxBatch, slotCtx, ctxCap, chunk: rt.chunk || 512,
    kvPool, freeBytes: free, overhead, usable, fit,
    tier: Math.max(0, model.tier - quant.tierLoss),
    idleW: box.idleW * count, loadW: box.loadW * count,
    priceUsd: box.priceUsd * count,
  };
}

/**
 * Length of one iteration.
 *   nDecode      sequences generating one token each
 *   kvRead       total KV bytes those sequences read
 *   attn         total attention FLOPs for the decode tokens
 *   prefillTok   prompt tokens processed in the same iteration
 *   prefillAttn  attention FLOPs for those prompt tokens
 */
export function stepTime(eng, nDecode, kvRead, attn, prefillTok = 0, prefillAttn = 0) {
  const fp = eng.fp;
  const n = nDecode + prefillTok;
  const bytes = weightRead(fp, n) + kvRead;
  const flops = fp.flopsPerToken * n + attn + prefillAttn;
  const tMem = bytes / eng.bw;
  let tComp = flops / eng.flops;
  // Prompt tokens split across experts leave each expert a small matrix
  // multiply, which runs far below peak (worst on RDNA, then Metal, then CUDA).
  const moe = fp.model.moe;
  if (moe && prefillTok > 0) {
    const m = (prefillTok * moe.topK) / moe.experts;
    const eff = m / (m + eng.moeM0);
    tComp += (fp.flopsExpert * prefillTok * (1 / eff - 1)) / eng.flops;
  }
  const t = Math.max(tMem, tComp, eng.launchS) + eng.stepS + eng.perSeqS * nDecode + eng.commPerTok * n;
  return { t, tMem, tComp, bytes, flops };
}

/** Single-user speeds, for the spec card: decode tok/s and prompt tok/s. */
export function singleUserSpeeds(eng, ctx = 2048, chunk = eng.chunk) {
  const d = stepTime(eng, 1, kvBytes(eng.fp, ctx), attnFlops(eng.fp, ctx));
  const p = stepTime(eng, 0, 0, 0, chunk, attnFlops(eng.fp, chunk / 2) * chunk);
  return { decodeTps: 1 / d.t, prefillTps: chunk / p.t, decodeBound: d.tMem >= d.tComp ? 'bandwidth' : 'compute' };
}

/** Total generation tok/s with `batch` streams at context `ctx` (steady decode). */
export function batchDecodeTps(eng, batch, ctx) {
  const st = stepTime(eng, batch, batch * kvBytes(eng.fp, ctx), batch * attnFlops(eng.fp, ctx));
  return batch / st.t;
}

export function fmtK(tokens) {
  return tokens >= 1024 ? `${Math.round(tokens / 1024)}K` : String(tokens);
}

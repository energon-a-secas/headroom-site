// ── Inference server ─────────────────────────────────────────
// Continuous batching, the way llama.cpp slots and vLLM's scheduler both
// work at heart: every iteration, admit waiting requests while capacity
// allows, give prompt tokens a chunk of the iteration, and let every
// running sequence that finished its prompt emit one token.
//
// Two admission regimes:
//   slots  a fixed number of slots with preallocated context. A slot keeps
//          its last conversation, so the same user returning to the same
//          slot skips re-reading history (llama.cpp's prompt cache).
//   paged  a shared KV pool. A sequence reserves the blocks it will need;
//          a shared system prompt is stored once and reused by everyone
//          (vLLM / SGLang prefix caching), and finished conversations stay
//          cached until newer ones evict them.
//
// Pure decode stretches are fused: when no prompt is being read and no
// event is due, k identical iterations run as one step (with KV growth
// accounted at the midpoint), so a simulated hour costs milliseconds.

import { kvBytes, attnFlops, stepTime } from './perf.js';

const K_CAP = 256;      // most iterations fused into one step
const SPAN_CAP = 1.0;   // longest fused step, seconds of simulated time

export function makeServer(eng, idx) {
  const slotted = eng.rt.batching === 'slots';
  return {
    idx, slotted,
    queue: [], running: [],
    kvUsed: 0, kvPeak: 0,
    busy: false, iter: null,
    slots: slotted ? Array.from({ length: eng.maxBatch }, () => ({ req: null, lastUser: -1, lastGroup: -1 })) : null,
    cache: new Map(), cacheBytes: 0, pinnedBytes: 0,
    stats: { busyS: 0, memS: 0, compS: 0, bytes: 0, flops: 0, tokOut: 0, tokPrefill: 0, tokCached: 0,
      batchTime: 0, blockedSlots: 0, blockedKv: 0, iters: 0, steps: 0 },
  };
}

/** KV bytes a request reserves on admission (shared prefix excluded when cached once). */
function reserveBytes(eng, srv, r) {
  const shared = !srv.slotted && eng.rt.prefixCache ? r.prefix : 0;
  return kvBytes(eng.fp, r.total + r.output - shared);
}

function touch(srv, key, bytes, tokens) {
  const e = srv.cache.get(key);
  if (e) { srv.cache.delete(key); srv.cache.set(key, e); return e; }
  const n = { bytes, tokens, refs: 0 };
  srv.cache.set(key, n);
  srv.cacheBytes += bytes;
  return n;
}

function evict(eng, srv) {
  const room = eng.kvPool - srv.kvUsed;
  if (srv.cacheBytes <= room) return;
  for (const [k, e] of srv.cache) {
    if (srv.cacheBytes <= room) break;
    if (e.refs > 0) continue;
    srv.cache.delete(k);
    srv.cacheBytes -= e.bytes;
  }
}

/** Work out how much of the prompt is already cached, and claim a slot. */
function claim(eng, srv, r) {
  const hitPrefix = r.prefix, hitHistory = r.history;
  let cached = 0;
  if (srv.slotted) {
    const free = srv.slots.filter((s) => !s.req);
    const pick = (eng.rt.prefixCache && (free.find((s) => s.lastUser === r.uid) || free.find((s) => s.lastGroup === r.gi))) || free[0];
    if (eng.rt.prefixCache && pick.lastGroup === r.gi) cached += hitPrefix;
    if (eng.rt.prefixCache && pick.lastUser === r.uid) cached += hitHistory;
    pick.req = r; pick.lastUser = r.uid; pick.lastGroup = r.gi;
    r.slot = pick;
  } else if (eng.rt.prefixCache) {
    const pk = `p${r.gi}`;
    const had = srv.cache.has(pk);
    const pe = touch(srv, pk, kvBytes(eng.fp, r.prefix), r.prefix);
    if (pe.refs++ === 0) srv.pinnedBytes += pe.bytes;
    r.prefixEntry = pe;
    if (had) cached += hitPrefix;
    const ue = srv.cache.get(`u${r.uid}`);
    if (ue && hitHistory > 0) { touch(srv, `u${r.uid}`); cached += Math.min(ue.tokens, hitHistory); }
  }
  return Math.min(cached, r.total - 1);
}

/** Admit from the head of the queue while capacity allows. Returns the blocking reason, if any. */
export function admit(eng, srv, t, hooks) {
  while (srv.queue.length) {
    const r = srv.queue[0];
    if (srv.running.length >= eng.maxBatch) return 'slots';
    const need = reserveBytes(eng, srv, r);
    if (!srv.slotted) {
      const prefixNew = eng.rt.prefixCache && !srv.cache.has(`p${r.gi}`) ? kvBytes(eng.fp, r.prefix) : 0;
      if (srv.kvUsed + srv.pinnedBytes + prefixNew + need > eng.kvPool) {
        if (srv.running.length === 0 && srv.pinnedBytes === 0) {
          srv.queue.shift();
          hooks.onFail(r, t, 'context');
          continue;
        }
        return 'kv';
      }
    }
    srv.queue.shift();
    r.cached = claim(eng, srv, r);
    r.prefillLeft = Math.max(1, r.total - r.cached);
    r.ctx = r.cached;
    r.kvNeed = need;
    r.tAdmit = t;
    srv.kvUsed += need;
    srv.stats.tokCached += r.cached;
    if (!srv.slotted) evict(eng, srv);
    if (srv.kvUsed + srv.pinnedBytes > srv.kvPeak) srv.kvPeak = srv.kvUsed + srv.pinnedBytes;
    srv.running.push(r);
    hooks.onAdmit(r, t);
  }
  return '';
}

/** Plan the next iteration starting at `t`; `horizon` is the next external event. */
export function plan(eng, srv, t, horizon) {
  const fp = eng.fp;
  const decode = [], parts = [];
  let kvRead = 0, attn = 0;
  for (const r of srv.running) {
    if (r.prefillLeft === 0) {
      decode.push(r);
      kvRead += kvBytes(fp, r.ctx);
      attn += attnFlops(fp, r.ctx);
    }
  }
  let budget = Math.max(eng.chunk - decode.length, Math.ceil(eng.chunk / 4));
  let pTok = 0, pAttn = 0;
  for (const r of srv.running) {
    if (r.prefillLeft === 0 || budget <= 0) continue;
    const n = Math.min(r.prefillLeft, budget);
    parts.push({ r, n });
    budget -= n; pTok += n;
    pAttn += n * attnFlops(fp, r.ctx + n / 2);
  }
  let st = stepTime(eng, decode.length, kvRead, attn, pTok, pAttn);
  let k = 1;
  // Nothing can change before the next completion or external event, so a
  // blocked queue does not stop fusion: admission only reopens on a completion.
  if (!parts.length && decode.length) {
    let left = Infinity;
    for (const r of decode) left = Math.min(left, r.output - r.generated);
    const gap = Math.floor((horizon - t) / st.t);
    k = Math.max(1, Math.min(left, gap, K_CAP, Math.floor(SPAN_CAP / st.t)));
    if (k > 1) {
      const grow = (k - 1) / 2;
      st = stepTime(eng, decode.length, kvRead + decode.length * fp.kvFull * grow, attn + decode.length * fp.attnFull * grow, 0, 0);
    }
  }
  srv.iter = { t0: t, k, dur: k * st.t, decode, parts, st };
  return srv.iter.dur;
}

/** Apply a finished iteration at `t1`. */
export function finish(eng, srv, t1, hooks) {
  const it = srv.iter;
  srv.iter = null;
  const s = srv.stats;
  s.busyS += it.dur; s.iters += it.k; s.steps++;
  s.memS += it.k * it.st.tMem; s.compS += it.k * it.st.tComp;
  s.bytes += it.k * it.st.bytes; s.flops += it.k * it.st.flops;
  s.batchTime += it.decode.length * it.dur;

  const done = [];
  for (const r of it.decode) {
    r.generated += it.k;
    r.ctx += it.k;
    s.tokOut += it.k;
    hooks.onTokens(r, it.k, it.t0, t1);
    if (r.generated >= r.output) done.push(r);
  }
  for (const { r, n } of it.parts) {
    r.prefillLeft -= n;
    r.ctx += n;
    s.tokPrefill += n;
    if (r.prefillLeft === 0) {
      r.generated = 1;
      s.tokOut += 1;
      hooks.onFirstToken(r, t1);
      if (r.generated >= r.output) done.push(r);
    }
  }
  for (const r of done) release(eng, srv, r, t1, hooks);
}

function release(eng, srv, r, t, hooks) {
  srv.running.splice(srv.running.indexOf(r), 1);
  srv.kvUsed -= r.kvNeed;
  if (r.slot) { r.slot.req = null; r.slot = null; }
  if (r.prefixEntry && --r.prefixEntry.refs === 0) srv.pinnedBytes -= r.prefixEntry.bytes;
  r.prefixEntry = null;
  if (!srv.slotted && eng.rt.prefixCache && r.keepsHistory) {
    const tokens = r.history + r.prompt + r.output;
    const key = `u${r.uid}`;
    const old = srv.cache.get(key);
    if (old) { srv.cache.delete(key); srv.cacheBytes -= old.bytes; }
    touch(srv, key, kvBytes(eng.fp, tokens), tokens);
    evict(eng, srv);
  }
  hooks.onDone(r, t);
}

/** Remove a request that gave up while queued. */
export function dropQueued(srv, r) {
  const i = srv.queue.indexOf(r);
  if (i >= 0) srv.queue.splice(i, 1);
  return i >= 0;
}

// ── Simulation ───────────────────────────────────────────────
// A discrete-event simulation of a crowd using one or more boxes.
// Every user is a closed loop: ask, wait for the answer to become visible
// on their device, read it, think, ask again. That is what makes the result
// honest: a slow box slows its users down, which lowers the load, which is
// exactly how an overloaded service behaves in a real household or office.
//
// Contract (frozen; the UI and the worker depend on it):
//   createSim(scenario, { warmup, sampleEvery }) -> sim
//   sim.advance(tEnd)   run all events up to simulated time tEnd (seconds)
//   sim.snapshot()      live view for the floor canvas
//   sim.eng / sim.groups / sim.servers / sim.series   read by report.js
//   runScenario(scenario, { duration, warmup }) -> report   (headless)

import { buildEngine } from './perf.js';
import { makeServer, admit, plan, finish, dropQueued } from './server.js';
import { makeLink, transmit, requestBytes, streamBurst, answerBytes } from './network.js';
import { makeHeap } from './heap.js';
import { makeRng, hashSeed } from './rng.js';
import { personaById, clientById } from '../data/crowd.js';
import { buildReport } from './report.js';

export const U = { THINK: 0, SEND: 1, QUEUE: 2, PREFILL: 3, DECODE: 4, RECV: 5, READ: 6, OFF: 7 };
const EV = { SEND: 1, ARRIVE: 2, ITER: 3, DELIVER: 4, ABANDON: 5 };
const BELL0 = 30;        // first synchronised send (s); personas set their own cadence and spread

function groupStats() {
  return { n: 0, pass: 0, miss: 0, sent: 0, truncated: 0, ttft: [], e2e: [], tps: [], fail: {},
    tokIn: 0, tokOut: 0, blame: { queue: 0, prefill: 0, decode: 0, net: 0, render: 0 },
    time: { queue: 0, prefill: 0, decode: 0, net: 0, render: 0 } };
}

export function createSim(sc, opts = {}) {
  const eng = buildEngine(sc);
  const warmup = opts.warmup ?? 60;
  const sampleEvery = opts.sampleEvery ?? 10;
  const rng = makeRng(sc.seed || 7);
  const heap = makeHeap();
  const servers = eng.fit.ok ? Array.from({ length: eng.servers }, (_, i) => makeServer(eng, i)) : [];
  const users = [];
  let reqSeq = 0, now = 0, events = 0;

  // A group may tweak its persona (a mission's own targets, shorter answers).
  const persona = (g) => {
    const P = personaById(g.persona), t = g.tweak;
    return t ? { ...P, ...t, slo: { ...P.slo, ...(t.slo || {}) } } : P;
  };
  const groups = sc.groups.map((g, gi) => ({
    gi, def: g, persona: persona(g), client: clientById(g.client),
    // Each link draws its own losses, so a lossy link does not reshuffle
    // every other group's token counts.
    link: makeLink(g, !!sc.unlimitedLinks, makeRng(hashSeed(`${sc.seed || 7}:link:${gi}`))),
    stats: groupStats(), users: [], unserved: 0, offReason: '',
  }));

  const nextBell = (t, P) => {
    const every = P.burstEvery || 300;
    return BELL0 + Math.max(0, Math.ceil((t - BELL0) / every)) * every;
  };
  const nextSend = (G, t) => {
    const P = G.persona;
    if (P.burst) return nextBell(t, P) + rng.range(0, P.burstSpread ?? 20);
    return t + (P.think > 0 ? rng.exp(P.think) : 0.05);
  };

  for (const G of groups) {
    const cap = G.link.inRange ? G.link.maxClients : 0;
    if (!G.link.inRange) G.offReason = 'range';
    for (let i = 0; i < (G.def.count | 0); i++) {
      const u = { id: users.length, gi: G.gi, state: U.THINK, history: 0, turn: 0, readUntil: 0, since: 0, req: null };
      users.push(u); G.users.push(u);
      if (i >= cap || !servers.length) {
        u.state = U.OFF;
        if (servers.length) { G.unserved++; if (!G.offReason) G.offReason = 'capacity'; }
        continue;
      }
      const P = G.persona;
      const first = P.burst ? BELL0 + rng.range(0, P.burstSpread ?? 20) : rng.range(0, Math.max(3, P.think));
      heap.push({ t: first, type: EV.SEND, u });
    }
  }

  // ── Recording ──
  const win = { pass: 0, miss: 0 };
  function record(r, t) {
    const G = groups[r.gi], S = G.stats, P = G.persona;
    if (r.tSend < warmup) return;
    S.n++;
    if (r.failed) { S.fail[r.failed] = (S.fail[r.failed] || 0) + 1; S.miss++; win.miss++; return; }
    const ttft = r.tFirstVisible - r.tSend;
    const e2e = t - r.tSend;
    const streamed = r.stream && G.client.mode === 'stream' && r.shown > 1 && r.tFirstDelivered !== undefined;
    const tps = streamed ? (r.shown - 1) / Math.max(1e-3, r.tLastDelivered - r.tFirstDelivered) : null;
    // A prompt the server cut to fit is answered on time and still wrong.
    const pass = !r.cut && (!P.slo.ttft || ttft <= P.slo.ttft) && (!P.slo.tps || tps === null || tps >= P.slo.tps) && (!P.slo.e2e || e2e <= P.slo.e2e);
    if (r.cut) S.fail.truncated = (S.fail.truncated || 0) + 1;
    S.ttft.push(ttft); S.e2e.push(e2e); if (tps !== null) S.tps.push(tps);
    S.tokIn += r.total; S.tokOut += r.output;
    if (r.truncated) S.truncated++;
    const parts = {
      queue: r.tAdmit - r.tArrive,
      prefill: r.tFirstServer - r.tAdmit,
      decode: r.tDoneServer - r.tFirstServer,
      net: (r.tArrive - r.tSend) + Math.max(0, r.tDelivered - r.tDoneServer),
      render: Math.max(0, t - r.tDelivered),
    };
    for (const k in parts) S.time[k] += parts[k];
    if (!pass) {
      // Blame only the phases that caused the miss: a late first word is the
      // wire up, the queue and the prompt; a slow stream is generation; a
      // late whole answer is everything.
      const missFirst = P.slo.ttft && ttft > P.slo.ttft;
      const missSpeed = P.slo.tps && tps !== null && tps < P.slo.tps;
      const missWhole = P.slo.e2e && e2e > P.slo.e2e;
      if (r.cut && !missFirst && !missSpeed && !missWhole) { /* wrong, not slow: nothing to blame on time */ }
      else if (missWhole || (!missFirst && !missSpeed)) for (const k in parts) S.blame[k] += parts[k];
      else {
        if (missFirst) {
          S.blame.net += r.tArrive - r.tSend; S.blame.queue += parts.queue; S.blame.prefill += parts.prefill;
          // Hidden tokens (reasoning, a tool call, the speech buffer) are
          // generated before the first word, so they count against it too.
          if (r.tFirstVisibleServer) S.blame.decode += Math.max(0, r.tFirstVisibleServer - r.tFirstServer);
        }
        if (missSpeed) S.blame.decode += parts.decode;
      }
    }
    if (pass) { S.pass++; win.pass++; } else { S.miss++; win.miss++; }
  }

  function fail(r, t, reason) {
    const u = users[r.uid], G = groups[r.gi];
    r.failed = reason;
    record(r, t);
    u.state = U.THINK; u.req = null; u.history = 0; u.turn = 0;
    heap.push({ t: nextSend(G, t + Math.max(5, G.persona.think)), type: EV.SEND, u });
  }

  /** The first token a person can see or hear left the server at `t`. */
  function markVisible(r, t) {
    const G = groups[r.gi];
    r.tFirstVisibleServer = t;
    if (!r.stream) return;
    const b = streamBurst(G.link, 1, 0);
    r.tFirstDelivered = r.tLastDelivered = Math.max(r.tLastDelivered || 0, transmit(G.link, t, b.bytes, b.events));
    if (G.client.mode === 'stream') r.tFirstVisible = r.tFirstDelivered + (G.client.renderMs + G.client.pipelineMs / 2) / 1000;
  }

  // ── Server hooks ──
  const hooks = {
    onAdmit(r) { users[r.uid].state = U.PREFILL; },
    onFirstToken(r, t) {
      const G = groups[r.gi];
      r.tFirstServer = t;
      users[r.uid].state = U.DECODE;
      if (r.firstIdx <= 1) markVisible(r, t);
      else if (r.stream) r.tLastDelivered = Math.max(r.tLastDelivered || 0, transmit(G.link, t, streamBurst(G.link, 1, 0).bytes, 1));
    },
    onTokens(r, k, t0, t1) {
      // Reasoning, a tool call or a speech buffer come before the first word:
      // find when inside this step the first visible token was generated.
      if (r.tFirstVisibleServer === undefined) {
        const before = r.generated - k;
        if (r.firstIdx > before && r.firstIdx <= r.generated) markVisible(r, t0 + ((r.firstIdx - before) / k) * (t1 - t0));
      }
      if (!r.stream) return;
      const L = groups[r.gi].link;
      const b = streamBurst(L, k, t1 - t0);
      // One connection delivers in order: a burst held up by a lost packet
      // holds up everything behind it.
      r.tLastDelivered = Math.max(r.tLastDelivered || 0, transmit(L, t1, b.bytes, b.events));
    },
    onDone(r, t) {
      const G = groups[r.gi], C = G.client;
      r.tDoneServer = t;
      users[r.uid].state = U.RECV;
      const delivered = r.stream ? r.tLastDelivered : transmit(G.link, t, answerBytes(G.link, r.output), 1);
      r.tDelivered = delivered;
      const visible = delivered + (C.finalMs + (C.mode === 'stream' && r.stream ? 0 : C.pipelineMs / 2)) / 1000;
      if (!r.tFirstVisible) r.tFirstVisible = visible;
      heap.push({ t: visible, type: EV.DELIVER, r });
    },
    onFail(r, t, reason) { fail(r, t, reason); },
  };

  function startIter(srv, t) {
    const block = admit(eng, srv, t, hooks);
    if (!srv.running.length) { srv.busy = false; return; }
    const dur = Math.max(1e-4, plan(eng, srv, t, heap.peekTime()));
    if (block === 'slots') srv.stats.blockedSlots += dur;
    else if (block === 'kv') srv.stats.blockedKv += dur;
    srv.busy = true;
    heap.push({ t: t + dur, type: EV.ITER, srv });
  }

  // ── Event handlers ──
  function onSend(u, t) {
    const G = groups[u.gi], P = G.persona;
    const prompt = Math.max(1, Math.round(rng.lognormal(P.prompt, 0.6)));
    const context = P.context ? Math.max(1, Math.round(rng.lognormal(P.context, 0.35))) : 0;
    // A translation or a summary is as long as what it is made from.
    const visible = P.outRatio
      ? Math.max(4, Math.round((prompt + context) * P.outRatio * rng.lognormal(1, 0.12)))
      : Math.max(4, Math.round(rng.lognormal(P.output, 0.5)));
    // A reasoning model writes its hidden thinking first; a device may also
    // need a tool call or a speech buffer before the first word exists.
    const hidden = Math.max(P.reason || 0, eng.model.reasons?.min || 0);
    const output = hidden + visible;
    let history = P.history ? u.history : 0;
    let truncated = false;
    const fixed = P.prefix + context + prompt + output;
    if (fixed + history > eng.slotCtx && history > 0) {
      history = Math.max(0, eng.slotCtx - fixed);
      truncated = true;
    }
    const r = {
      id: reqSeq++, uid: u.id, gi: u.gi, tSend: t, prompt, context, history, prefix: P.prefix,
      total: P.prefix + context + history + prompt, output, visible, hidden,
      // An app that streams the thinking block shows reasoning as it comes;
      // a speaker or an e-ink page waits for the answer itself.
      shown: G.client.thinking ? output : visible,
      firstIdx: Math.min(output, (G.client.thinking ? 0 : hidden) + (P.lead || 0) + 1),
      prefixKey: G.def.prefixId || `${P.id}:${P.prefix}`,
      keepsHistory: P.history, generated: 0, truncated, stream: G.link.proto.stream,
    };
    u.req = r; u.state = U.SEND; u.since = t;
    if (t >= warmup) G.stats.sent++;
    const ready = t + G.client.pipelineMs / 2000 + G.link.proto.handshakeRtt * G.link.rttS;
    heap.push({ t: transmit(G.link, ready, requestBytes(G.link, r), 1), type: EV.ARRIVE, r });
  }

  function onArrive(r, t) {
    if (r.total + r.output > eng.slotCtx) {
      // Ollama keeps about the last half of the window and answers anyway,
      // without the start of the prompt; other servers refuse the request.
      const kept = Math.floor(eng.slotCtx / 2);
      if (!eng.rt.truncates || kept + r.output > eng.slotCtx) { fail(r, t, 'context'); return; }
      r.cut = true; r.total = kept; r.prefix = 0; r.history = 0;
    }
    let srv = servers[0];
    for (const s of servers) if (s.queue.length + s.running.length < srv.queue.length + srv.running.length) srv = s;
    r.srv = srv; r.tArrive = t;
    srv.queue.push(r);
    users[r.uid].state = U.QUEUE;
    heap.push({ t: t + groups[r.gi].persona.patience, type: EV.ABANDON, r });
    if (!srv.busy) startIter(srv, t);
  }

  function onDeliver(r, t) {
    const u = users[r.uid], G = groups[r.gi], P = G.persona;
    record(r, t);
    if (P.history) u.history = r.history + r.prompt + r.visible;
    if (++u.turn >= P.turns) { u.turn = 0; u.history = 0; }
    const read = P.readTps ? r.visible / P.readTps : 0;
    u.state = U.READ; u.readUntil = t + read; u.req = null;
    heap.push({ t: nextSend(G, t + read), type: EV.SEND, u });
  }

  function onAbandon(r, t) {
    if (r.tAdmit === undefined && !r.failed && r.srv && dropQueued(r.srv, r)) fail(r, t, 'gave up');
  }

  // ── Series ──
  const series = [];
  let nextSample = sampleEvery;
  const last = { tok: 0, busy: 0, bytes: 0 };
  function sample(t) {
    let q = 0, run = 0, kv = 0, pool = 0, tok = 0, busy = 0;
    for (const s of servers) {
      q += s.queue.length; run += s.running.length;
      kv += s.kvUsed + s.pinnedBytes; pool += eng.kvPool;
      tok += s.stats.tokOut; busy += s.stats.busyS;
      // The in-flight iteration counts for the part already elapsed; the rest
      // lands in the next sample once finish() adds its full duration.
      if (s.iter) busy += Math.min(s.iter.dur, Math.max(0, t - s.iter.t0));
    }
    const n = Math.max(1, servers.length);
    const busyFrac = Math.min(1, Math.max(0, (busy - last.busy) / (sampleEvery * n)));
    series.push({
      t, queue: q, running: run, kv: pool ? kv / pool : 0,
      tps: (tok - last.tok) / sampleEvery,
      pass: win.pass, miss: win.miss,
      watts: eng.idleW + (eng.loadW - eng.idleW) * busyFrac,
      busy: busyFrac,
    });
    last.tok = tok; last.busy = busy;
    win.pass = 0; win.miss = 0;
  }

  function dispatch(ev) {
    events++;
    switch (ev.type) {
      case EV.SEND: onSend(ev.u, ev.t); break;
      case EV.ARRIVE: onArrive(ev.r, ev.t); break;
      case EV.ITER: finish(eng, ev.srv, ev.t, hooks); startIter(ev.srv, ev.t); break;
      case EV.DELIVER: onDeliver(ev.r, ev.t); break;
      case EV.ABANDON: onAbandon(ev.r, ev.t); break;
      default: break;
    }
  }

  return {
    sc, eng, groups, servers, users, series, warmup, sampleEvery,
    get t() { return now; },
    get events() { return events; },
    advance(tEnd) {
      while (heap.size && heap.peekTime() <= tEnd) {
        const tn = heap.peekTime();
        while (nextSample <= tn) { sample(nextSample); nextSample += sampleEvery; }
        const ev = heap.pop();
        now = ev.t;
        dispatch(ev);
      }
      while (nextSample <= tEnd) { sample(nextSample); nextSample += sampleEvery; }
      now = tEnd;
    },
    snapshot() {
      const st = new Uint8Array(users.length);
      const wait = new Float32Array(users.length);
      for (const u of users) {
        let s = u.state;
        if (s === U.READ && now >= u.readUntil) s = U.THINK;
        st[u.id] = s;
        wait[u.id] = u.req ? now - u.req.tSend : 0;
      }
      return {
        t: now, states: st, wait,
        servers: servers.map((s) => ({
          queue: s.queue.length, running: s.running.length,
          kv: eng.kvPool ? (s.kvUsed + s.pinnedBytes) / eng.kvPool : 0,
          cache: eng.kvPool ? s.cacheBytes / eng.kvPool : 0,
        })),
        links: groups.map((G) => ({ backlog: Math.max(0, G.link.freeAt - now) })),
      };
    },
    report(duration) { return buildReport(this, duration ?? now); },
  };
}

/** Run a scenario start to finish without a UI. */
export function runScenario(sc, { duration = 1200, warmup = 60, sampleEvery } = {}) {
  const sim = createSim(sc, { warmup, sampleEvery: sampleEvery ?? Math.max(5, duration / 120) });
  sim.advance(duration);
  return buildReport(sim, duration);
}

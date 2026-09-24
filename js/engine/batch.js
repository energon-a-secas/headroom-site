// ── Batch experiments ────────────────────────────────────────
// Headless runs that answer bigger questions than one simulation:
//   findRedline  how many users before answers stop meeting their targets
//   compareBoxes the same crowd on every box in the catalog
// Both are synchronous and pure, so they run inside the Web Worker.

import { runScenario } from './sim.js';
import { BOXES } from '../data/hardware.js';
import { runtimeById, runtimesFor } from '../data/runtimes.js';
import { buildEngine, kvBytes } from './perf.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Scale the crowd: one group to `n`, or every group proportionally to `n` total. */
export function scaleCrowd(sc, n, groupIndex = null) {
  const s = clone(sc);
  if (groupIndex !== null && s.groups[groupIndex]) {
    s.groups[groupIndex].count = n;
    return s;
  }
  const base = sc.groups.reduce((a, g) => a + g.count, 0) || 1;
  let left = n;
  s.groups.forEach((g, i) => {
    const share = i === s.groups.length - 1 ? left : Math.max(1, Math.round((g.count / base) * n));
    g.count = Math.max(1, Math.min(share, left - (s.groups.length - 1 - i)));
    left -= g.count;
  });
  return s;
}

const passes = (r, target) => r.ok && r.unserved === 0 && r.passRate !== null && r.passRate >= target;

/**
 * Bisect on crowd size for the largest count that still meets `target`.
 * A fixed seed keeps probes comparable, so the search does not flap on noise.
 */
export function findRedline(sc, { target = 0.95, groupIndex = null, duration = 900, max = 3000, onProbe } = {}) {
  const start = groupIndex !== null ? sc.groups[groupIndex].count : sc.groups.reduce((a, g) => a + g.count, 0);
  const minN = groupIndex !== null ? 1 : sc.groups.length;
  const probes = [];
  const probe = (n) => {
    const r = runScenario(scaleCrowd(sc, n, groupIndex), { duration });
    const ok = passes(r, target);
    probes.push({ n, ok, pass: r.passRate, busy: r.util?.busy ?? 0, bottleneck: r.bottleneck?.id });
    onProbe?.(probes[probes.length - 1]);
    return { ok, r };
  };

  const first = probe(Math.max(minN, start));
  if (!first.r.ok) return { users: 0, probes, fit: first.r.fit, limit: first.r };
  let lo = 0, hi, loR = null, hiR = null;
  if (first.ok) {
    lo = Math.max(minN, start); loR = first.r;
    let n = Math.max(lo + 1, lo * 2);
    for (;;) {
      if (n > max) return { users: lo, capped: true, probes, ok: loR, limit: null };
      const p = probe(n);
      if (!p.ok) { hi = n; hiR = p.r; break; }
      lo = n; loR = p.r; n *= 2;
    }
  } else {
    hi = Math.max(minN, start); hiR = first.r;
    if (hi <= minN) return { users: 0, probes, ok: null, limit: hiR };
  }
  while (hi - lo > Math.max(1, Math.floor(lo * 0.04))) {
    const mid = Math.floor((lo + hi) / 2);
    if (mid <= lo || mid < minN) break;
    const p = probe(mid);
    if (p.ok) { lo = mid; loR = p.r; } else { hi = mid; hiR = p.r; }
  }
  const res = { users: lo, probes, ok: loR, limit: hiR, why: hiR?.bottleneck?.id || null };
  // When the network hub runs out of connections first, also ask what the box
  // itself would hold with enough access points.
  if (res.why === 'connections' && !sc.unlimitedLinks) {
    res.boxUsers = findRedline({ ...sc, unlimitedLinks: true }, { target, groupIndex, duration, max }).users;
  }
  return res;
}

/** The runtime to use on another box: the chosen one if it runs there, else the best that does. */
export function runtimeOn(box, wanted) {
  const rt = runtimeById(wanted);
  if (rt.platforms.includes(box.platform)) return rt.id;
  const opts = runtimesFor(box.platform);
  const crowdy = opts.find((r) => r.batching === 'paged');
  return (crowdy || opts[0] || rt).id;
}

/**
 * A slot-based fallback runtime keeps its 4-slot default unless told
 * otherwise, which would make a comparison about defaults rather than boxes.
 * Give it as many 16K slots as the KV space allows, up to 16.
 */
function crowdSlots(s) {
  const rt = runtimeById(s.runtime.id);
  if (rt.batching !== 'slots') return undefined;
  const eng = buildEngine({ ...s, runtime: { id: rt.id, overrides: { slots: 1, ctxPerSlot: 16384 } } });
  if (eng.freeBytes <= 0) return undefined;
  const per = kvBytes(eng.fp, Math.min(16384, eng.ctxCap));
  const slots = Math.max(1, Math.min(16, Math.floor(eng.freeBytes / per)));
  return { slots, ctxPerSlot: 16384 };
}

/** Run the scenario on every catalog box (plus the current custom one). */
export function compareBoxes(sc, { duration = 900, redline = false, target = 0.95, onRow } = {}) {
  const boxes = BOXES.filter((b) => b.status !== 'announced' || sc.includeAnnounced);
  if (sc.box.id === 'custom') boxes.push({ id: 'custom', platform: sc.box.custom?.platform || 'cuda' });
  const rows = [];
  for (const b of boxes) {
    const s = clone(sc);
    s.box = { ...s.box, id: b.id };
    s.runtime = { ...s.runtime, id: runtimeOn(b, sc.runtime.id) };
    if (s.runtime.id !== sc.runtime.id) s.runtime.overrides = crowdSlots(s);
    const r = runScenario(s, { duration });
    const row = { boxId: b.id, runtime: s.runtime.id, report: slim(r) };
    if (redline && r.ok) {
      const rl = findRedline(s, { duration: Math.min(duration, 600), target });
      row.redline = rl.users; row.redlineWhy = rl.why; row.boxUsers = rl.boxUsers;
    }
    rows.push(row);
    onRow?.(row);
  }
  return rows;
}

/** Drop the heavy parts of a report before posting it across the worker boundary. */
export function slim(r) {
  if (!r.ok) return { ok: false, fit: r.fit, engine: r.engine, verdict: r.verdict, advice: r.advice };
  const { series, ...rest } = r;
  return rest;
}

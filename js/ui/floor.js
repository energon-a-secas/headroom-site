// ── The floor ────────────────────────────────────────────────
// A canvas picture of the experiment: the box in the middle, every user as
// a dot in their group's sector, coloured by what they are doing. Waiting
// users grow a ring as their patience runs out; answers travel out along
// the group's link as small particles.
//
// Colour carries state, never alone: the legend below the canvas names each
// state with its live count, and offline users are drawn as hollow rings.

import { U } from '../engine/sim.js';
import { escHtml } from '../utils.js';

const COLORS = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, f) => (cs.getPropertyValue(n).trim() || f);
  Object.assign(COLORS, {
    net: v('--c-1', '#3987e5'), wait: v('--c-2', '#d95926'), recv: v('--c-3', '#199e70'),
    idle: 'rgba(255,255,255,.22)', read: 'rgba(25,158,112,.45)', off: 'rgba(255,255,255,.45)',
    accent: v('--accent', '#22d3ee'), ink: 'rgba(249,249,249,.92)', mute: 'rgba(255,255,255,.55)',
    faint: 'rgba(255,255,255,.07)',
  });
}

// State -> [colour key, legend label]
const STATES = [
  ['idle', 'Thinking or reading', (s) => s === U.THINK || s === U.READ],
  ['net', 'Sending', (s) => s === U.SEND],
  ['wait', 'Waiting for text', (s) => s === U.QUEUE || s === U.PREFILL],
  ['recv', 'Answer arriving', (s) => s === U.DECODE || s === U.RECV],
  ['off', 'Cannot connect', (s) => s === U.OFF],
];

const DASH = { local: [], lan: [], wifi: [6, 5], wifiweak: [3, 6], ble: [2, 4], vpn: [12, 6], cell: [12, 6], starlink: [12, 6], geo: [16, 8], lora: [1, 7], loraeu: [1, 7] };

let layout = null;

/** Place every user once per scenario and canvas size. */
function computeLayout(sim, w, h) {
  const groups = sim.groups;
  const total = sim.users.length || 1;
  const cx = w / 2, cy = h / 2;
  const boxW = Math.min(150, w * 0.22), boxH = 86;
  const ry = h / 2 - 34;
  const ax = Math.min(2.1, Math.max(1, (w / 2 - 40) / ry));
  const r0 = Math.max(boxH / 2 + 26, 70);
  // Each group gets an angular share proportional to the square root of its
  // size, so a group of 2 stays visible beside a group of 200.
  const weights = groups.map((g) => Math.sqrt(Math.max(1, g.users.length)));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const gap = groups.length > 1 ? 0.12 : 0;
  const span = Math.PI * 2 - gap * groups.length;

  // Largest dot spacing that fits every user.
  const capacity = (s) => {
    let cap = 0;
    for (let i = 0; i < groups.length; i++) {
      const th = (weights[i] / wsum) * span;
      for (let r = r0; r <= ry; r += s) cap += Math.max(1, Math.floor((th * r) / s));
      if (cap >= total * 4) return cap;
    }
    return cap;
  };
  let s = 34;
  while (s > 3 && capacity(s) < total) s -= 0.5;

  const pos = new Float32Array(total * 2);
  const sectors = [];
  let a0 = -Math.PI / 2 - (weights[0] / wsum) * span / 2;
  groups.forEach((g, i) => {
    const th = (weights[i] / wsum) * span;
    const mid = a0 + th / 2;
    let k = 0;
    for (let r = r0; k < g.users.length && r <= ry + s * 20; r += s) {
      const n = Math.max(1, Math.floor((th * r) / s));
      for (let j = 0; j < n && k < g.users.length; j++, k++) {
        const a = n === 1 ? mid : a0 + (th * (j + 0.5)) / n;
        const u = g.users[k];
        pos[u.id * 2] = cx + Math.cos(a) * r * ax;
        pos[u.id * 2 + 1] = cy + Math.sin(a) * r;
      }
    }
    sectors.push({ gi: i, mid, a0, th, link: g.def.link });
    a0 += th + gap;
  });
  return { key: `${w}x${h}:${sim.users.length}:${groups.length}`, cx, cy, boxW, boxH, ax, r0, ry, dot: Math.max(1.6, Math.min(5.5, s * 0.22)), pos, sectors, sim };
}

export function drawFloor(canvas, sim, legendEl) {
  if (!canvas || !sim) return;
  if (!COLORS.net) readColors();
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(280, rect.width), h = Math.max(260, rect.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const key = `${w}x${h}:${sim.users.length}:${sim.groups.length}`;
  if (!layout || layout.key !== key || layout.sim !== sim) layout = computeLayout(sim, w, h);
  const L = layout;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const snap = sim.snapshot();
  const phase = (performance.now() / 900) % 1;

  // Links: one line per group from the box to the sector, styled by link type.
  ctx.lineWidth = 1;
  for (const sec of L.sectors) {
    const ex = L.cx + Math.cos(sec.mid) * L.ry * L.ax * 0.96, ey = L.cy + Math.sin(sec.mid) * L.ry * 0.96;
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.setLineDash(DASH[sec.link] || []);
    ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.lineTo(ex, ey); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Users.
  const counts = new Array(STATES.length).fill(0);
  const users = sim.users;
  for (let i = 0; i < users.length; i++) {
    const s = snap.states[i];
    const x = L.pos[i * 2], y = L.pos[i * 2 + 1];
    const si = STATES.findIndex((st) => st[2](s));
    counts[si]++;
    const key = STATES[si][0];
    if (key === 'off') {
      ctx.strokeStyle = COLORS.off; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, L.dot, 0, Math.PI * 2); ctx.stroke();
      continue;
    }
    ctx.fillStyle = s === U.READ ? COLORS.read : COLORS[key];
    ctx.beginPath(); ctx.arc(x, y, L.dot, 0, Math.PI * 2); ctx.fill();
    if (key === 'wait') {
      const patience = sim.groups[users[i].gi].persona.patience || 60;
      const f = Math.min(1, snap.wait[i] / patience);
      ctx.strokeStyle = `rgba(217,89,38,${0.25 + 0.6 * f})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, L.dot + 2 + f * 5, 0, Math.PI * 2); ctx.stroke();
    }
    // Particles: answers flow out, questions flow in.
    if (users.length <= 600 && (s === U.DECODE || s === U.SEND)) {
      const p = (phase + (i * 0.618) % 1) % 1;
      const t = s === U.DECODE ? p : 1 - p;
      const px = L.cx + (x - L.cx) * (0.18 + 0.78 * t), py = L.cy + (y - L.cy) * (0.18 + 0.78 * t);
      ctx.fillStyle = s === U.DECODE ? COLORS.recv : COLORS.net;
      ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
    }
  }

  drawBox(ctx, L, sim, snap);
  drawLabels(ctx, L, sim, w);
  if (legendEl) {
    legendEl.innerHTML = STATES.map((st, i) => (st[0] === 'off' && !counts[i] ? '' :
      `<span class="lg"><i class="${st[0] === 'off' ? 'ring' : ''}" style="background:${COLORS[st[0]]}"></i>${escHtml(st[1])} <b>${counts[i]}</b></span>`)).join('');
  }
}

function drawBox(ctx, L, sim, snap) {
  const { cx, cy, boxW, boxH } = L;
  const x = cx - boxW / 2, y = cy - boxH / 2;
  const eng = sim.eng;
  const busy = sim.servers.some((s) => s.busy);
  ctx.fillStyle = '#0c1224';
  ctx.strokeStyle = busy ? COLORS.accent : 'rgba(255,255,255,.25)';
  ctx.lineWidth = busy ? 1.5 : 1;
  roundRect(ctx, x, y, boxW, boxH, 10); ctx.fill(); ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const name = eng.count > 1 ? `${eng.box.short} x${eng.count}` : eng.box.short;
  ctx.fillText(name, cx, y + 20, boxW - 12);
  ctx.fillStyle = COLORS.mute;
  ctx.font = '11px system-ui, sans-serif';
  if (!eng.fit.ok) {
    ctx.fillStyle = '#f08a8a';
    ctx.fillText('does not fit', cx, y + 40);
    return;
  }
  const run = snap.servers.reduce((a, s) => a + s.running, 0);
  const q = snap.servers.reduce((a, s) => a + s.queue, 0);
  ctx.fillText(`batch ${run} of ${eng.maxBatch * eng.servers}`, cx, y + 38, boxW - 12);
  ctx.fillText(`${q} queued`, cx, y + 54, boxW - 12);

  // KV pool gauge: conversations in memory, then cached prefixes.
  const kv = snap.servers.reduce((a, s) => a + s.kv, 0) / Math.max(1, snap.servers.length);
  const cache = snap.servers.reduce((a, s) => a + s.cache, 0) / Math.max(1, snap.servers.length);
  const gx = x + 12, gy = y + boxH - 18, gw = boxW - 24;
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(gx, gy, gw, 6);
  ctx.fillStyle = COLORS.wait; ctx.fillRect(gx, gy, gw * Math.min(1, kv), 6);
  ctx.fillStyle = COLORS.recv; ctx.fillRect(gx + gw * Math.min(1, kv), gy, gw * Math.max(0, Math.min(1 - kv, cache)), 6);

  // The queue, as a column of squares left of the box.
  const shown = Math.min(q, 40);
  ctx.fillStyle = COLORS.wait;
  for (let i = 0; i < shown; i++) {
    const col = Math.floor(i / 10), row = i % 10;
    ctx.fillRect(x - 12 - col * 8, y + boxH - 8 - row * 8, 5, 5);
  }
  if (q > 40) { ctx.fillStyle = COLORS.mute; ctx.textAlign = 'right'; ctx.fillText(`+${q - 40}`, x - 44, y + 6); }
}

function drawLabels(ctx, L, sim, w) {
  ctx.font = '11px system-ui, sans-serif';
  for (const sec of L.sectors) {
    const g = sim.groups[sec.gi];
    const lx = L.cx + Math.cos(sec.mid) * (L.ry + 16) * L.ax, ly = L.cy + Math.sin(sec.mid) * (L.ry + 16);
    const label = `${g.users.length} x ${g.persona.name} . ${g.client.name} . ${g.link.def.name}`.replace(/ \. /g, ' · ');
    ctx.textAlign = lx < L.cx - 20 ? 'left' : lx > L.cx + 20 ? 'right' : 'center';
    const tx = ctx.textAlign === 'left' ? Math.max(8, lx - 60) : ctx.textAlign === 'right' ? Math.min(w - 8, lx + 60) : lx;
    const ty = Math.max(14, Math.min(L.cy * 2 - 6, ly));
    ctx.fillStyle = 'rgba(4,7,20,.7)';
    const tw = ctx.measureText(label).width;
    const bx = ctx.textAlign === 'left' ? tx - 3 : ctx.textAlign === 'right' ? tx - tw - 3 : tx - tw / 2 - 3;
    ctx.fillRect(bx, ty - 11, tw + 6, 15);
    ctx.fillStyle = g.unserved ? '#f08a8a' : COLORS.mute;
    ctx.fillText(label, tx, ty);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function resetFloorLayout() { layout = null; }

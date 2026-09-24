// ── Live charts ──────────────────────────────────────────────
// Four small multiples, one measure each (never two scales on one chart),
// drawn with the fleet Viz Kit. Each has a crosshair tooltip. Below them, a
// stacked bar of where an answer's time goes.

import { viz } from '../viz.js';
import { escHtml as e, fmtSec } from '../utils.js';

const W = 240, H = 100, PAD_L = 28, PAD_R = 6;

/** Round an axis maximum up to 1, 2, 2.5 or 5 times a power of ten, so the midline tick is readable. */
function niceCeil(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

const SPECS = [
  { id: 'tps', title: 'Tokens per second, all users', unit: 'tok/s', pick: (s) => s.tps, min: 0 },
  { id: 'queue', title: 'Requests waiting in the queue', unit: 'waiting', pick: (s) => s.queue, min: 0 },
  { id: 'slo', title: 'Answers on target', unit: '%', pick: (s) => (s.pass + s.miss ? (100 * s.pass) / (s.pass + s.miss) : null), min: 0, max: 100 },
  { id: 'watts', title: 'Power draw', unit: 'W', pick: (s) => s.watts, min: 0 },
];

export function renderCharts(el, series) {
  if (!el.dataset.ready) {
    el.innerHTML = SPECS.map((c) => `<div class="chart" data-chart="${c.id}"><div class="chart__svg"></div><div class="chart-cross" hidden></div><div class="chart-tip" hidden></div></div>`).join('');
    el.querySelectorAll('.chart').forEach(bindHover);
    el.dataset.ready = '1';
  }
  for (const c of SPECS) {
    const box = el.querySelector(`[data-chart="${c.id}"]`);
    const pts = [];
    for (const s of series) {
      const y = c.pick(s);
      if (y != null && isFinite(y)) pts.push({ x: s.t / 60, y });
    }
    box._pts = pts; box._spec = c;
    const last = pts.length ? pts[pts.length - 1].y : null;
    const scale = last == null ? '' : `${Math.round(last)}${c.unit === '%' ? '%' : ` ${c.unit}`} now`;
    const max = c.max ?? niceCeil(Math.max(1, ...pts.map((p) => p.y)) * 1.05);
    box.querySelector('.chart__svg').innerHTML = pts.length > 1
      ? viz.line([{ name: c.title, color: 'var(--accent)', values: pts }], { title: c.title, scale, width: W, height: H, padL: PAD_L, padR: PAD_R, min: c.min, max, area: true, uid: `hr-${c.id}` })
      : viz.line([], { title: c.title, width: W, height: H }).replace('No data', 'Press Run to start the clock');
    box._max = max;
  }
}

function bindHover(box) {
  const tip = box.querySelector('.chart-tip');
  const cross = box.querySelector('.chart-cross');
  const hide = () => { tip.hidden = true; cross.hidden = true; };
  box.addEventListener('pointerleave', hide);
  box.addEventListener('pointermove', (ev) => {
    const pts = box._pts;
    const svg = box.querySelector('svg');
    if (!pts || pts.length < 2 || !svg) return hide();
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * W;
    const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    const fx = (vx - PAD_L) / (W - PAD_L - PAD_R);
    if (fx < -0.02 || fx > 1.02) return hide();
    const target = x0 + Math.max(0, Math.min(1, fx)) * (x1 - x0);
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.x - target) < Math.abs(best.x - target)) best = p;
    const px = PAD_L + ((best.x - x0) / (x1 - x0 || 1)) * (W - PAD_L - PAD_R);
    const bRect = box.getBoundingClientRect();
    const left = r.left - bRect.left + (px / W) * r.width;
    const min = box._spec.min ?? 0;
    const py = 10 + (1 - (best.y - min) / ((box._max - min) || 1)) * (H - 30);
    const top = r.top - bRect.top + (py / H) * r.height;
    const val = box._spec.id === 'queue' ? Math.round(best.y) : best.y < 10 ? best.y.toFixed(1) : Math.round(best.y);
    tip.textContent = `${fmtSec(best.x * 60)} in: ${val} ${box._spec.unit}`;
    tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    cross.style.left = `${left}px`;
    tip.hidden = false; cross.hidden = false;
  });
}

const PARTS = [
  ['net', 'On the wire', 'var(--c-1)'],
  ['queue', 'Queued', 'var(--c-2)'],
  ['prefill', 'Reading the prompt', 'var(--c-3)'],
  ['decode', 'Generating', 'var(--c-4)'],
  ['render', 'On the device', 'var(--c-5)'],
];

function stackBar(title, parts, per) {
  const total = PARTS.reduce((a, [k]) => a + (parts[k] || 0), 0);
  if (!total) return '';
  const seg = PARTS.filter(([k]) => parts[k] > total * 0.002).map(([k, l, c]) =>
    `<span style="flex:${parts[k].toFixed(4)};background:${c}" title="${e(l)}: ${fmtSec(parts[k] / per)}"></span>`).join('');
  const legend = PARTS.map(([k, l, c]) => `<span class="lg"><i style="background:${c}"></i>${e(l)} ${fmtSec((parts[k] || 0) / per)}</span>`).join('');
  return `<div class="panel" style="margin-top:12px"><h3 class="panel__title">${e(title)}</h3>
    <div class="bar-stack" role="img" aria-label="${e(title)}: ${PARTS.map(([k, l]) => `${l} ${fmtSec((parts[k] || 0) / per)}`).join(', ')}">${seg}</div>
    <div class="stack-legend">${legend}</div></div>`;
}

export function renderBlame(el, r) {
  if (!r || !r.ok) { el.innerHTML = ''; return; }
  const time = { net: 0, queue: 0, prefill: 0, decode: 0, render: 0 };
  let answers = 0, misses = 0;
  for (const g of r.groups) {
    for (const k in time) time[k] += g.time[k];
    answers += g.pass + (g.miss - g.late - Object.values(g.fail).reduce((a, b) => a + b, 0));
    misses += g.miss;
  }
  const blameTotal = Object.values(r.blame).reduce((a, b) => a + b, 0);
  el.innerHTML = (answers ? stackBar('Where an average answer spends its time', time, answers) : '')
    + (misses && blameTotal ? stackBar('Where the slow answers lost it', r.blame, misses) : '');
}

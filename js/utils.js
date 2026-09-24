// ── Shared utilities ─────────────────────────────────────────

/** Cached element lookup by ID. */
const _els = {};
export function $(id) {
  return _els[id] || (_els[id] = document.getElementById(id));
}

/** Escape HTML special characters. */
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Show a temporary toast notification. */
let _toastTimer = null;
export function showToast(msg) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2400);
}

/** Simple debounce. */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Number formatting ──
export const fmtInt = (n) => (n == null || !isFinite(n) ? 'none' : Math.round(n).toLocaleString('en-US'));
export const fmtPct = (x) => (x == null || !isFinite(x) ? 'none' : `${Math.round(x * 100)}%`);
export const fmtUsd = (n, dp = 0) => (n == null || !isFinite(n) ? 'none' : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const fmtGB = (gb) => (gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`);

/** Seconds to a compact human duration: 0.42 s, 7.1 s, 2 min 5 s, 1 h 4 min. */
export function fmtSec(s) {
  if (s == null || !isFinite(s)) return 'none';
  if (s < 10) return `${s.toFixed(s < 1 ? 2 : 1)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

/** Simulated clock: 00:12:34. */
export function fmtClock(s) {
  const t = Math.floor(s);
  const h = String(Math.floor(t / 3600)).padStart(2, '0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const sec = String(t % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export function fmtTps(x) {
  if (x == null || !isFinite(x)) return 'none';
  return x >= 100 ? `${Math.round(x)} tok/s` : `${x.toFixed(1)} tok/s`;
}

/** Distance in the unit a link thinks in. */
export function fmtDist(km, unit) {
  if (unit === 'none') return 'same machine';
  if (unit === 'm') return `${Math.round(km * 1000)} m`;
  return km >= 100 ? `${fmtInt(km)} km` : `${+km.toFixed(1)} km`;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Status tone for a verdict id, shared by the scoreboard, compare and missions. */
export const TONE = { right: 'good', overkill: 'warn', tight: 'warn', overloaded: 'bad', nofit: 'bad', idle: 'warn' };

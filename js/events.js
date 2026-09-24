// ── Events ───────────────────────────────────────────────────
// Every listener lives here. Controls describe themselves with data
// attributes (data-k, data-g/data-f, data-custom, data-econ, data-act), so
// one delegated handler per event type covers the whole page.

import { state, save, defaultScenario, newGroupId, CROWDS, shareUrl, cloneScenario } from './state.js';
import { $, showToast, debounce, clamp } from './utils.js';
import { rebuild, play, pause, skip, runJob, redraw } from './runner.js';
import { render, renderTransport, renderRedline, renderCompareView, renderTabs } from './render.js';
import { renderMissionResult } from './ui/missions.js';
import { boxById, CUSTOM_BOX } from './data/hardware.js';
import { modelById, quantsFor } from './data/models.js';
import { linkById } from './data/crowd.js';
import { missionById, scoreMission } from './data/missions.js';
import { runtimeOn, scaleCrowd } from './engine/batch.js';
import { resetFloorLayout } from './ui/floor.js';

/** Apply a scenario change: persist, restart the run, redraw. */
function commit({ keepRedline = false } = {}) {
  save(state);
  if (!keepRedline) state.redline = { busy: false, result: null, probes: [] };
  resetFloorLayout();
  rebuild();
  render();
}

// ── Scenario edits ──
function setKey(k, v, input) {
  const sc = state.sc;
  switch (k) {
    case 'box.id': {
      sc.box.id = v;
      if (v === 'custom' && !sc.box.custom) sc.box.custom = cloneScenario(CUSTOM_BOX);
      const box = boxById(v, sc.box.custom);
      const rt = runtimeOn(box, sc.runtime.id);
      if (rt !== sc.runtime.id) sc.runtime = { id: rt, overrides: {} };
      if (sc.box.mode === 'split' && !box.pairable) sc.box.mode = 'replica';
      break;
    }
    case 'box.count': sc.box.count = clamp(parseInt(v, 10) || 1, 1, 8); break;
    case 'box.mode': sc.box.mode = v; break;
    case 'model.id': {
      sc.model.id = v;
      const allowed = quantsFor(modelById(v)).map((q) => q.id);
      if (!allowed.includes(sc.model.quant)) sc.model.quant = allowed.includes('q4') ? 'q4' : allowed[0];
      sc.model.ctxCap = 0;
      break;
    }
    case 'model.quant': sc.model.quant = v; break;
    case 'model.kv': sc.model.kv = v; break;
    case 'model.ctxCap': sc.model.ctxCap = parseInt(v, 10) || 0; break;
    case 'runtime.id': sc.runtime = { id: v, overrides: {} }; break;
    case 'rt.slots': case 'rt.ctxPerSlot': case 'rt.maxBatch':
      sc.runtime.overrides = { ...sc.runtime.overrides, [k.slice(3)]: parseInt(v, 10) };
      break;
    case 'rt.prefixCache':
      sc.runtime.overrides = { ...sc.runtime.overrides, prefixCache: input.checked };
      break;
    default: return false;
  }
  return true;
}

function setGroupField(i, f, v) {
  const g = state.sc.groups[i];
  if (!g) return false;
  if (f === 'count') g.count = clamp(parseInt(v, 10) || 1, 1, 5000);
  else if (f === 'distance') {
    const L = linkById(g.link);
    g.distanceKm = Math.max(0, parseFloat(v) || 0) / (L.unit === 'm' ? 1000 : 1);
  } else if (f === 'link') {
    g.link = v;
    const L = linkById(v);
    if (L.unit === 'm' && (g.distanceKm > L.rangeKm || !g.distanceKm)) g.distanceKm = Math.min(0.015, L.rangeKm * 0.5);
    else if (L.unit === 'km' && g.distanceKm < 1) g.distanceKm = L.id.startsWith('lora') ? 3 : 500;
  } else if (f === 'client') { g.client = v; g.protocol = ''; }
  else if (f === 'persona') { g.persona = v; delete g.tweak; }
  else g[f] = v;
  return true;
}

function setCustom(path, v) {
  const c = state.sc.box.custom || (state.sc.box.custom = cloneScenario(CUSTOM_BOX));
  if (path === 'platform') {
    c.platform = v;
    const rt = runtimeOn({ platform: v }, state.sc.runtime.id);
    if (rt !== state.sc.runtime.id) state.sc.runtime = { id: rt, overrides: {} };
    return;
  }
  const num = Math.max(0, parseFloat(v) || 0);
  if (path.startsWith('tflops.')) c.tflops = { ...c.tflops, [path.slice(7)]: num };
  else c[path] = num;
  if (path === 'memGB' && c.usableGB > num) c.usableGB = Math.round(num * 0.9);
}

function onLoadoutChange(ev) {
  const t = ev.target;
  let changed = false;
  if (t.dataset.k) changed = setKey(t.dataset.k, t.value, t);
  else if (t.dataset.g !== undefined && t.dataset.f) changed = setGroupField(+t.dataset.g, t.dataset.f, t.value);
  else if (t.dataset.custom) { setCustom(t.dataset.custom, t.value); changed = true; }
  else if (t.dataset.econ) { state.sc.econ[t.dataset.econ] = Math.max(0, parseFloat(t.value) || 0); changed = true; }
  if (changed) commit();
}

// ── Actions ──
function loadCrowd(groups) {
  state.sc.groups = cloneScenario(groups).map((g) => ({ id: newGroupId(), protocol: '', ...g }));
}

function startMission(id) {
  const m = missionById(id);
  state.mission = id;
  loadCrowd(m.groups);
  state.tab = 'sandbox';
  commit();
  window.scrollTo({ top: 0 });
}

async function scoreCurrentMission() {
  const m = missionById(state.mission);
  const btn = $('scoreMissionBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Scoring...'; }
  try {
    const report = await runJob('run', state.sc, { duration: m.duration });
    const score = scoreMission(m, report);
    state.progress[m.id] = Math.max(state.progress[m.id] || 0, score.stars);
    save(state);
    renderMissionResult($('missionModalBody'), m, report, score);
    openModal('missionModal');
  } catch (err) {
    showToast('Scoring failed. Check the console.');
    console.error(err);
  }
  render();
}

async function findRedline() {
  if (state.redline.busy) return;
  state.redline = { busy: true, result: null, probes: [] };
  renderTransport(); renderRedline();
  try {
    const result = await runJob('redline', state.sc, { duration: 900 }, (p) => { state.redline.probes.push(p); renderRedline(); });
    state.redline = { busy: false, result, probes: state.redline.probes };
  } catch (err) {
    state.redline = { busy: false, result: null, probes: [] };
    showToast('Redline search failed.');
    console.error(err);
  }
  renderTransport(); renderRedline();
}

async function runCompare() {
  if (state.compare.busy) return;
  state.compare.busy = true;
  state.compare.rows = [];
  state.compare.redline = $('compareRedline').checked;
  const sc = { ...cloneScenario(state.sc), includeAnnounced: $('compareAnnounced').checked };
  renderCompareView();
  try {
    const rows = await runJob('compare', sc, { duration: 900, redline: state.compare.redline }, (row) => {
      state.compare.rows.push(row);
      renderCompareView();
    });
    state.compare.rows = rows;
  } catch (err) {
    showToast('Comparison failed.');
    console.error(err);
  }
  state.compare.busy = false;
  renderCompareView();
}

function onClick(ev) {
  const t = ev.target.closest('button, [data-box], [data-sort]');
  if (!t) return;
  const act = t.dataset.act;
  if (t.dataset.crowd) { state.mission = null; loadCrowd(CROWDS[t.dataset.crowd].groups); commit(); return; }
  if (act === 'add-group') {
    const last = state.sc.groups[state.sc.groups.length - 1];
    state.sc.groups.push({ id: newGroupId(), persona: 'chat', count: 5, client: 'phone', link: last?.link || 'wifi', protocol: '', distanceKm: last?.distanceKm ?? 0.01 });
    commit(); return;
  }
  if (act === 'remove-group') { state.sc.groups.splice(+t.dataset.g, 1); commit(); return; }
  if (act === 'close-redline') { state.redline = { busy: false, result: null, probes: [] }; renderRedline(); return; }
  if (act === 'load-redline') {
    state.sc = scaleCrowd(state.sc, +t.dataset.n);
    state.mission = null;
    commit(); return;
  }
  if (t.dataset.mission) { startMission(t.dataset.mission); return; }
  if (t.dataset.sort) { state.compare.sort = t.dataset.sort; renderCompareView(); return; }
  if (t.dataset.box && t.closest('#compare')) {
    state.sc.box.id = t.dataset.box;
    if (t.dataset.runtime && t.dataset.runtime !== state.sc.runtime.id) state.sc.runtime = { id: t.dataset.runtime, overrides: {} };
    state.tab = 'sandbox';
    commit(); window.scrollTo({ top: 0 }); return;
  }
  switch (t.id) {
    case 'playBtn': state.running ? pause() : play(); renderTransport(); break;
    case 'skipBtn': skip(1200); break;
    case 'restartBtn': rebuild(); break;
    case 'redlineBtn': findRedline(); break;
    case 'compareBtn': runCompare(); break;
    case 'scoreMissionBtn': scoreCurrentMission(); break;
    case 'leaveMissionBtn': state.mission = null; commit(); break;
    case 'missionNextBtn': closeModal('missionModal'); state.tab = 'missions'; render(); break;
    case 'shareBtn': copyLink(); break;
    case 'resetAllBtn':
      pause(); state.sc = defaultScenario(); state.mission = null; commit(); renderTransport(); showToast('Back to the default scenario.');
      break;
    default:
      if (t.dataset.speed) { state.speed = +t.dataset.speed; save(state); renderTransport(); }
      else if (t.dataset.tab) switchTab(t.dataset.tab);
  }
}

function switchTab(tab) {
  state.tab = tab;
  render();
  if (tab === 'sandbox') requestAnimationFrame(redraw);
}

async function copyLink() {
  const url = shareUrl(state.sc);
  try { await navigator.clipboard.writeText(url); showToast('Link to this exact scenario copied.'); }
  catch { window.prompt('Copy this link:', url); }
}

function onTabKeys(ev) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
  const tabs = [...document.querySelectorAll('.tab')];
  let i = tabs.findIndex((x) => x.dataset.tab === state.tab);
  if (ev.key === 'ArrowRight') i = (i + 1) % tabs.length;
  else if (ev.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
  else if (ev.key === 'Home') i = 0;
  else i = tabs.length - 1;
  ev.preventDefault();
  switchTab(tabs[i].dataset.tab);
  tabs[i].focus();
}

// ── Modal (template pattern: focus trap, Escape, backdrop) ──
let _lastFocus = null;
function focusables(root) {
  return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.getClientRects().length > 0);
}
export function openModal(id) {
  const m = $(id);
  _lastFocus = document.activeElement;
  m.hidden = false;
  document.body.classList.add('modal-open');
  (m.querySelector('.modal__header [data-modal-close]') || focusables(m)[0])?.focus();
}
export function closeModal(id) {
  $(id).hidden = true;
  document.body.classList.remove('modal-open');
  _lastFocus?.focus?.();
}
function onKeydown(ev) {
  const m = document.querySelector('.modal:not([hidden])');
  if (!m) return;
  if (ev.key === 'Escape') { ev.preventDefault(); closeModal(m.id); return; }
  if (ev.key !== 'Tab') return;
  const list = focusables(m.querySelector('.modal__dialog'));
  if (!list.length) return;
  if (ev.shiftKey && document.activeElement === list[0]) { ev.preventDefault(); list[list.length - 1].focus(); }
  else if (!ev.shiftKey && document.activeElement === list[list.length - 1]) { ev.preventDefault(); list[0].focus(); }
}

export function bindEvents() {
  $('loadout').addEventListener('change', onLoadoutChange);
  document.addEventListener('click', onClick);
  document.addEventListener('click', (ev) => {
    const m = ev.target.closest('.modal');
    if (m && ev.target.closest('[data-modal-close]')) closeModal(m.id);
  });
  document.addEventListener('keydown', onKeydown);
  document.querySelector('.tabs').addEventListener('keydown', onTabKeys);
  window.addEventListener('resize', debounce(() => { resetFloorLayout(); redraw(); }, 120));
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.running) { pause(); renderTransport(); } });
  renderTabs();
}


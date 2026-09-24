// ── Events ───────────────────────────────────────────────────
// Every listener lives here. Controls describe themselves with data
// attributes (data-k, data-g/data-f, data-custom, data-econ, data-act), so
// one delegated handler per event type covers the whole page.

import { state, save, loadShared, defaultScenario, newGroupId, CROWDS, shareUrl, cloneScenario } from './state.js';
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
import { renderLoadout } from './ui/loadout.js';
import { setSceneView, moveCamera } from './ui/scene.js';
import { openWelcome, closeWelcome, restoreWelcomeFocus } from './ui/welcome.js';
import { createSetupScenario, createCustomBuild } from './data/setups.js';
import { resolveEnclosure, enclosureFor } from './data/enclosures.js';

/** A selector that finds the same control after the loadout re-renders. */
function controlKey(el) {
  if (!el || !el.closest || !el.closest('#loadout')) return null;
  if (el.dataset.g !== undefined && el.dataset.f) return `[data-g="${el.dataset.g}"][data-f="${el.dataset.f}"]`;
  if (el.dataset.act === 'remove-group') return `[data-act="remove-group"][data-g="${el.dataset.g}"]`;
  if (el.dataset.setup) return `.setup-nav [data-setup="${el.dataset.setup}"]`;
  for (const a of ['k', 'custom', 'econ', 'crowd', 'act']) if (el.dataset[a]) return `[data-${a}="${el.dataset[a]}"]`;
  return null;
}

/** Apply a scenario change: persist, rebuild the run, redraw, keep focus where it was. */
function commit({ keepRedline = false } = {}) {
  const focusSel = controlKey(document.activeElement);
  save(state);
  if (!keepRedline) state.redline = { busy: false, result: null, probes: [] };
  resetFloorLayout();
  rebuild();
  render();
  if (focusSel) document.querySelector(`#loadout ${focusSel}`)?.focus({ preventScroll: true });
}

// ── Scenario edits ──
function setKey(k, v, input) {
  const sc = state.sc;
  switch (k) {
    case 'box.id': {
      sc.box.id = v;
      sc.box.enclosure = '';
      if (v === 'custom' && !sc.box.custom) sc.box.custom = cloneScenario(CUSTOM_BOX);
      const box = boxById(v, sc.box.custom);
      const rt = runtimeOn(box, sc.runtime.id);
      if (rt !== sc.runtime.id) sc.runtime = { id: rt, overrides: {} };
      if (sc.box.mode === 'split' && !box.pairable) sc.box.mode = 'replica';
      break;
    }
    case 'box.count': sc.box.count = clamp(parseInt(v, 10) || 1, 1, 8); break;
    case 'box.enclosure': {
      sc.box.enclosure = resolveEnclosure(sc.box.id, v);
      if (sc.box.id === 'custom' && sc.box.custom) {
        const name = `Custom ${enclosureFor(sc.box.enclosure)?.name.toLowerCase() || 'build'}`;
        sc.box.custom.name = name; sc.box.custom.short = name;
      }
      break;
    }
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
    case 'rt.slots': case 'rt.ctxPerSlot': case 'rt.maxBatch': case 'rt.hostCacheGB':
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
  else if (t.dataset.g !== undefined && t.dataset.f) { changed = setGroupField(+t.dataset.g, t.dataset.f, t.value); state.preset = null; }
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
  if (act === 'welcome-open') { openWelcome(); return; }
  if (act === 'welcome-close') { closeWelcome(); return; }
  if (t.dataset.localSetup || t.dataset.build) {
    const sc = t.dataset.build ? createCustomBuild(t.dataset.build, state.sc.econ) : createSetupScenario(t.dataset.localSetup, state.sc.econ);
    if (!sc) return;
    pause();
    sc.groups = sc.groups.map(g => ({ ...g, id: newGroupId() }));
    state.sc = sc; state.mission = null; state.tab = 'sandbox'; state.setup = 'hardware'; state.setupExpanded = !!t.dataset.build;
    commit();
    window.scrollTo({ top: 0 });
    $('tab-sandbox').focus({ preventScroll: true });
    showToast(t.dataset.build ? 'Custom build loaded. Enter your actual hardware specifications.' : 'Example loaded. Make it yours in the sandbox.');
    return;
  }
  if (t.dataset.setupFilter) {
    if (!['all', 'macos', 'linux'].includes(t.dataset.setupFilter)) return;
    state.setupFilter = t.dataset.setupFilter; render();
    document.querySelector(`[data-setup-filter="${state.setupFilter}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (act === 'browse-builds') { $('buildTitle').focus(); return; }
  if (act === 'toggle-setup' || act === 'open-setup') {
    state.setupExpanded = act === 'open-setup' || !state.setupExpanded;
    renderLoadout($('loadout'), state);
    document.querySelector('[data-act="toggle-setup"]')?.focus({ preventScroll: true });
    if (act === 'open-setup') $('loadout').scrollIntoView({ block: 'start' });
    return;
  }
  if (t.dataset.setup) {
    state.setup = t.dataset.setup; renderLoadout($('loadout'), state);
    document.querySelector(`.setup-nav [data-setup="${state.setup}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (t.dataset.sceneView) { setSceneView(t.dataset.sceneView); return; }
  if (t.dataset.camera) { moveCamera(t.dataset.camera); return; }
  if (t.dataset.inspectGroup !== undefined) {
    state.setup = 'people'; state.setupExpanded = true; renderLoadout($('loadout'), state);
    const input = document.querySelector(`[data-g="${t.dataset.inspectGroup}"][data-f="count"]`);
    input?.focus({ preventScroll: true }); input?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (t.dataset.crowd) {
    const preset = t.dataset.crowd;
    state.mission = null; state.preset = preset; state.setup = 'people'; loadCrowd(CROWDS[preset].groups); commit();
    document.querySelector(`#scenarioBar [data-crowd="${preset}"]`)?.focus({ preventScroll: true }); return;
  }
  if (act === 'add-group') {
    const last = state.sc.groups[state.sc.groups.length - 1];
    state.preset = null;
    state.sc.groups.push({ id: newGroupId(), persona: 'chat', count: 5, client: 'phone', link: last?.link || 'wifi', protocol: '', distanceKm: last?.distanceKm ?? 0.01 });
    commit(); return;
  }
  if (act === 'remove-group') { state.sc.groups.splice(+t.dataset.g, 1); state.preset = null; commit(); return; }
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
    state.sc.box.enclosure = '';
    if (t.dataset.runtime && t.dataset.runtime !== state.sc.runtime.id) state.sc.runtime = { id: t.dataset.runtime, overrides: {} };
    state.tab = 'sandbox';
    commit(); window.scrollTo({ top: 0 }); return;
  }
  switch (t.id) {
    case 'playBtn': state.running ? pause() : play(); renderTransport(); break;
    case 'skipBtn': skip(1200); break;
    case 'restartBtn': rebuild({ settle: false }); renderTransport(); break;
    case 'redlineBtn': findRedline(); break;
    case 'compareBtn': runCompare(); break;
    case 'scoreMissionBtn': scoreCurrentMission(); break;
    case 'leaveMissionBtn': state.mission = null; commit(); break;
    case 'missionNextBtn': closeModal('missionModal'); state.tab = 'missions'; render(); break;
    case 'shareBtn': copyLink(); break;
    case 'resetAllBtn':
      pause(); state.sc = defaultScenario(); state.setup = 'hardware'; state.setupExpanded = false; state.mission = null; commit(); renderTransport(); showToast('Back to the default scenario.');
      break;
    default:
      if (t.dataset.speed) { state.speed = +t.dataset.speed; save(state); renderTransport(); }
      else if (t.dataset.tab) {
        switchTab(t.dataset.tab);
        if (!t.classList.contains('tab')) $(`tab-${t.dataset.tab}`)?.focus({ preventScroll: true });
      }
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
  // The control that opened the modal may have been re-rendered meanwhile.
  const back = _lastFocus && document.contains(_lastFocus) ? _lastFocus : $('scoreMissionBtn');
  back?.focus?.();
}
function onKeydown(ev) {
  const welcome = $('welcomeDialog');
  if (welcome.open && ev.key === 'Tab') {
    const list = focusables(welcome);
    if (ev.shiftKey && document.activeElement === list[0]) { ev.preventDefault(); list.at(-1)?.focus(); }
    else if (!ev.shiftKey && document.activeElement === list.at(-1)) { ev.preventDefault(); list[0]?.focus(); }
    return;
  }
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
  const welcome = $('welcomeDialog');
  welcome.addEventListener('close', restoreWelcomeFocus);
  let welcomeBackdrop = false;
  const outsideWelcome = ev => {
    const rect = welcome.getBoundingClientRect();
    return ev.target === welcome && (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom);
  };
  welcome.addEventListener('pointerdown', ev => { welcomeBackdrop = outsideWelcome(ev); });
  welcome.addEventListener('click', ev => { if (welcomeBackdrop && outsideWelcome(ev)) closeWelcome(); welcomeBackdrop = false; });
  $('loadout').addEventListener('change', onLoadoutChange);
  document.addEventListener('click', onClick);
  document.addEventListener('click', (ev) => {
    const m = ev.target.closest('.modal');
    if (m && ev.target.closest('[data-modal-close]')) closeModal(m.id);
  });
  document.addEventListener('keydown', onKeydown);
  document.querySelector('.tabs').addEventListener('keydown', onTabKeys);
  window.addEventListener('hashchange', () => {
    if (!loadShared(state)) return;
    pause(); state.tab = 'sandbox'; state.setup = 'hardware'; state.setupExpanded = false;
    history.replaceState(null, '', location.pathname + location.search);
    commit();
    $('tab-sandbox').focus({ preventScroll: true });
  });
  window.addEventListener('resize', debounce(() => { resetFloorLayout(); redraw(); }, 120));
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.running) { pause(); renderTransport(); } });
  renderTabs();
}

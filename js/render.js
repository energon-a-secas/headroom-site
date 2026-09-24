// ── Rendering ────────────────────────────────────────────────
// Top-level dispatch. Each view module owns its own markup.

import { state } from './state.js';
import { $, escHtml as e, fmtClock, fmtPct, fmtInt } from './utils.js';
import { renderLoadout, renderScenarios } from './ui/loadout.js';
import { renderScore } from './ui/score.js';
import { renderCharts, renderBlame } from './ui/charts.js';
import { drawScene } from './ui/scene.js';
import { renderMissions, renderMissionBar } from './ui/missions.js';
import { renderCompare, renderCompareLead } from './ui/compare.js';
import { renderMethod } from './ui/method.js';
import { renderLocalSetups } from './ui/setups.js';
import { LABELS, lowerLabel } from './engine/report.js';

const TABS = ['sandbox', 'setups', 'missions', 'compare', 'method'];

export function renderTabs() {
  for (const t of TABS) {
    const on = state.tab === t;
    const tab = $(`tab-${t}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`view-${t}`).hidden = !on;
  }
}

export function renderTransport() {
  const play = $('playBtn');
  play.innerHTML = state.running ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> Run';
  play.setAttribute('aria-pressed', String(state.running));
  $('speedSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed === state.speed)));
  const rl = $('redlineBtn');
  rl.disabled = state.redline.busy;
  rl.textContent = state.redline.busy ? 'Searching...' : 'Find the redline';
  drawScene(state, true);
}

export function renderFrame() {
  if (state.tab !== 'sandbox' || !state.sim) return;
  drawScene(state);
  $('clock').textContent = fmtClock(state.sim.t);
}

let lastSpoken = '';
export function renderReport() {
  if (state.tab !== 'sandbox' || !state.report) return;
  renderScore($('score'), state.report, state.sim);
  // Screen readers hear the verdict when it changes, not every refresh.
  const label = $('score').querySelector('.verdict__label')?.textContent || '';
  const spoken = label ? `${label}. ${$('score').querySelector('.verdict__text')?.textContent || ''}` : '';
  if (spoken && spoken !== lastSpoken) { lastSpoken = spoken; $('liveStatus').textContent = spoken; }
  renderCharts($('charts'), state.report.series || []);
  renderBlame($('blame'), state.report);
}

export function renderRedline() {
  const el = $('redlineCard');
  const R = state.redline;
  if (!R.busy && !R.result) { el.hidden = true; return; }
  el.hidden = false;
  const probes = `<div class="probes">${R.probes.map((p) => `<span class="probe ${p.ok ? 'ok' : 'no'}" title="${p.ok ? 'passes' : 'fails'}${p.bottleneck ? `: ${e(LABELS[p.bottleneck] || p.bottleneck)}` : ''}">${fmtInt(p.n)} users ${p.ok ? '✓' : `✗ ${e(lowerLabel(p.bottleneck) || fmtPct(p.pass))}`}</span>`).join('')}</div>`;
  if (R.busy) {
    el.innerHTML = `<div class="panel"><h3 class="panel__title">Finding the redline</h3><p class="note">Doubling the crowd until answers fail, then narrowing in. Each probe is a full simulated run.</p>${probes}</div>`;
    return;
  }
  const res = R.result;
  const total = state.sc.groups.reduce((a, g) => a + g.count, 0);
  const limit = res.limit;
  const why = limit && limit.ok ? `${LABELS[limit.bottleneck?.id] || 'Something'} runs out first: ${limit.bottleneck?.text || ''}` : (res.fit ? res.fit.reason : '');
  el.innerHTML = `<div class="panel">
    <h3 class="panel__title">Redline <button type="button" class="btn btn--ghost btn--sm" data-act="close-redline">Close</button></h3>
    ${res.users > 0
      ? `<p><span class="big">${fmtInt(res.users)}${res.capped ? '+' : ''}</span> <span class="muted">users of this mix keep 95% of answers on target.</span></p>
         <p class="note">You are simulating ${fmtInt(total)} now${res.users >= total ? `, so there is room for ${fmtInt(res.users - total)} more` : `, ${fmtInt(total - res.users)} over the line`}. ${e(why)}</p>
         ${res.boxUsers ? `<p class="note"><b>The network is the limit, not the box.</b> With enough access points or hubs, the box alone holds about ${fmtInt(res.boxUsers)} users of this mix.</p>` : ''}
         <div class="toolbar" style="margin-top:8px"><button type="button" class="btn btn--secondary btn--sm" data-act="load-redline" data-n="${res.users}">Load ${fmtInt(res.users)} users</button></div>`
      : `<p class="note">Not even the smallest crowd passes. ${e(why)}</p>`}
    ${probes}
  </div>`;
}

export function renderCompareView() {
  renderCompareLead($('compareLead'), state.sc);
  renderCompare($('compare'), state);
  $('compareBtn').disabled = state.compare.busy;
  $('compareBtn').textContent = state.compare.busy ? 'Running...' : 'Run the comparison';
}

export function render() {
  renderTabs();
  if (state.tab === 'sandbox') {
    renderLoadout($('loadout'), state);
    renderScenarios($('scenarioBar'), state);
    renderMissionBar($('missionBar'), state);
    renderTransport();
    renderRedline();
    renderReport();
    renderFrame();
  } else if (state.tab === 'setups') {
    renderLocalSetups($('localSetups'), state);
  } else if (state.tab === 'missions') {
    renderMissions($('missions'), state);
  } else if (state.tab === 'compare') {
    renderCompareView();
  } else {
    renderMethod($('calibration'), $('catalog'));
  }
}

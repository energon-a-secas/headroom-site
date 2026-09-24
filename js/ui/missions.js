// ── Missions ─────────────────────────────────────────────────

import { MISSIONS, missionById } from '../data/missions.js';
import { personaById, clientById, linkById } from '../data/crowd.js';
import { escHtml as e, fmtUsd, fmtDist } from '../utils.js';
import { verdictBlock } from './score.js';

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--st-good)" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--st-bad)" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export function stars(n, big = false) {
  return `<span class="stars${big ? ' stars--big' : ''}" role="img" aria-label="${n} of 3 stars">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : 'off'}">${STAR}</span>`).join('')}</span>`;
}

const crowdLine = (g) => {
  const L = linkById(g.link);
  return `${g.count} x ${personaById(g.persona).name}, ${clientById(g.client).name} over ${L.name}${L.unit === 'none' || !g.distanceKm ? '' : ` at ${fmtDist(g.distanceKm, L.unit)}`}`;
};

export function renderMissions(el, state) {
  const earned = Object.values(state.progress).reduce((a, b) => a + b, 0);
  el.innerHTML = `<p class="note" style="margin:-8px 0 16px">${earned} of ${MISSIONS.length * 3} stars earned.</p>
  <div class="missions">${MISSIONS.map((m) => `<article class="mission">
    <div class="mission__top"><h3 class="mission__title">${e(m.title)}</h3>${stars(state.progress[m.id] || 0)}</div>
    <p class="mission__story">${e(m.story)}</p>
    <ul class="list" style="font-size:var(--text-xs)">${m.groups.map((g) => `<li>${e(crowdLine(g))}</li>`).join('')}</ul>
    <div class="mission__meta"><span>Goal ${Math.round(m.goal * 100)}% on target</span><span>Budget ${fmtUsd(m.budget)}</span><span>Par ${fmtUsd(m.par)}</span><span>Tier ${m.minTier}+</span>${m.maxWatts ? `<span>${m.maxWatts} W solar</span>` : ''}${m.perHour ? `<span>${m.perHour.toLocaleString('en-US')} jobs/h</span>` : ''}</div>
    <button type="button" class="btn btn--secondary btn--sm" data-mission="${e(m.id)}">${state.mission === m.id ? 'Continue' : 'Take it on'}</button>
  </article>`).join('')}</div>`;
}

export function renderMissionBar(el, state) {
  if (!state.mission) { el.hidden = true; el.innerHTML = ''; return; }
  const m = missionById(state.mission);
  el.hidden = false;
  el.innerHTML = `<span class="mission-bar__title">${e(m.title)}</span>
    <span class="mission-bar__goal">${Math.round(m.goal * 100)}% of answers on target, everyone connected, tier ${m.minTier}+, within ${fmtUsd(m.budget)} (par ${fmtUsd(m.par)})${m.maxWatts ? `, under ${m.maxWatts} W` : ''}${m.perHour ? `, ${m.perHour.toLocaleString('en-US')} jobs an hour` : ''}. ${e(m.hint)}</span>
    ${stars(state.progress[m.id] || 0)}
    <button type="button" class="btn btn--primary btn--sm" id="scoreMissionBtn">Score this setup</button>
    <button type="button" class="btn btn--ghost btn--sm" id="leaveMissionBtn">Leave mission</button>`;
}

export function renderMissionResult(el, m, report, score) {
  el.innerHTML = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">${stars(score.stars, true)}
    <div><b>${e(m.title)}</b><br><span class="muted">${score.stars === 3 ? 'Served well, on budget, and nothing wasted.' : score.stars === 2 ? 'Served well and on budget. A cheaper setup exists: can you find par?' : score.stars === 1 ? 'Served well, but over budget.' : 'Not yet. See what failed below.'}</span></div></div>
    ${verdictBlock(report.verdict)}
    <ul class="checks">${score.checks.map((c) => `<li>${c.ok ? CHECK : CROSS}<span>${e(c.text)}</span></li>`).join('')}</ul>
    ${report.ok && report.advice?.length ? `<p class="note" style="margin-top:12px">${e(report.advice[0])}</p>` : ''}`;
}

// ── Scoreboard ───────────────────────────────────────────────
// The answer to "is this box enough": a verdict first, then the numbers
// behind it, then what ran out and what to change.

import { escHtml as e, fmtPct, fmtSec, fmtTps, fmtUsd, fmtGB, fmtInt, TONE } from '../utils.js';
import { LABELS } from '../engine/report.js';

export const ICONS = {
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  idle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></svg>',
};

const tile = (label, value, sub = '') =>
  `<div class="tile"><span class="tile__label">${e(label)}</span><span class="tile__value">${e(value)}</span>${sub ? `<span class="tile__sub">${e(sub)}</span>` : ''}</div>`;

const meter = (label, frac, text, hotAt = 0.85) => {
  const w = Math.max(0, Math.min(1, frac || 0));
  return `<div class="meter"><div class="meter__top"><span>${e(label)}</span><span>${e(text ?? fmtPct(w))}</span></div>
    <div class="meter__bar" role="meter" aria-label="${e(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w * 100)}"><span class="${w >= hotAt ? 'hot' : ''}" style="width:${(w * 100).toFixed(1)}%"></span></div></div>`;
};

export function verdictBlock(v) {
  const tone = TONE[v.id] || 'idle';
  return `<div class="verdict tone-${tone}"><span class="verdict__icon">${ICONS[tone]}</span>
    <span class="verdict__label">${e(v.label)}</span><span class="verdict__text">${e(v.text)}</span></div>`;
}

/** Memory: weights, runtime overhead, KV in use, cached prefixes, free. */
function memoryBlock(r, sim) {
  const s = r.engine;
  const total = s.usableGB;
  if (!total) return '';
  const kvUsed = r.ok ? (r.util.kvPeak || 0) * s.kvPoolGB : 0;
  const snap = sim?.snapshot?.();
  const cacheNow = snap && snap.servers.length ? snap.servers.reduce((a, x) => a + x.cache, 0) / snap.servers.length * s.kvPoolGB : 0;
  const parts = [
    ['Weights', s.weightsGB, 'var(--c-1)'],
    ['Runtime', s.overheadGB, 'rgba(255,255,255,.28)'],
    ['KV peak', kvUsed, 'var(--c-2)'],
    ['Cached', Math.min(cacheNow, Math.max(0, total - s.weightsGB - s.overheadGB - kvUsed)), 'var(--c-3)'],
  ];
  const used = parts.reduce((a, p) => a + p[1], 0);
  const free = Math.max(0, total - used);
  const seg = parts.filter((p) => p[1] > 0.05).map(([l, v, c]) => `<span style="flex:${v.toFixed(2)};background:${c}" title="${e(l)}: ${fmtGB(v)}"></span>`).join('');
  return `<section class="panel memory" aria-label="Memory">
    <h3 class="panel__title">Memory <span class="muted">${fmtGB(total)} usable</span></h3>
    <div class="bar-stack" role="img" aria-label="Memory use: ${parts.map((p) => `${p[0]} ${fmtGB(p[1])}`).join(', ')}, free ${fmtGB(free)}">${seg}<span style="flex:${free.toFixed(2)};background:rgba(255,255,255,.06)"></span></div>
    <div class="stack-legend">${parts.filter((p) => p[1] > 0.05).map(([l, v, c]) => `<span class="lg"><i style="background:${c}"></i>${e(l)} ${fmtGB(v)}</span>`).join('')}<span class="lg"><i style="background:rgba(255,255,255,.12)"></i>Free ${fmtGB(free)}</span></div>
  </section>`;
}

export function renderScore(el, r, sim) {
  if (!r) { el.innerHTML = ''; return; }
  if (!r.ok) {
    el.innerHTML = `${verdictBlock(r.verdict)}
      <section class="panel" style="margin-top:12px"><h3 class="panel__title">Ways to make it fit</h3><ul class="list">${r.advice.map((a) => `<li>${e(a)}</li>`).join('')}</ul></section>
      ${memoryBlock(r)}`;
    return;
  }
  const warming = sim && sim.t < sim.warmup;
  const g0 = r.groups;
  const worstTtft = Math.max(...g0.map((g) => g.ttft.p95 ?? 0));
  const worstE2e = Math.max(...g0.map((g) => g.e2e.p95 ?? 0));
  const speeds = g0.map((g) => g.tps.p50).filter((x) => x != null);
  const served = r.users - r.unserved;
  const u = r.util;
  const verdict = sim && sim.t === 0
    ? { id: 'idle', label: 'Not started', text: 'Skip 20 min for an answer now, or Run to watch the crowd arrive.' }
    : warming
      ? { id: 'idle', label: 'Warming up', text: 'Statistics start after the first simulated minute, once the crowd has settled into its rhythm.' }
      : r.verdict;

  el.innerHTML = `${verdictBlock(verdict)}
  <section class="panel" style="margin-top:12px" aria-label="Key numbers">
    <div class="tiles">
      ${tile('Answers on target', r.passRate == null ? 'none yet' : fmtPct(r.passRate), `${fmtInt(r.requests)} answers measured`)}
      ${tile('Users served', `${served} of ${r.users}`, r.unserved ? `${r.unserved} cannot connect` : 'everyone connected')}
      ${tile('First text, p95', worstTtft ? fmtSec(worstTtft) : 'none yet', 'slowest group')}
      ${tile('Whole answer, p95', worstE2e ? fmtSec(worstE2e) : 'none yet', 'slowest group')}
      ${tile('Stream speed, median', speeds.length ? fmtTps(Math.min(...speeds)) : 'not streamed', 'per user')}
      ${tile('Box output', fmtTps(u.tokPerS), `average batch ${u.avgBatch.toFixed(1)}`)}
    </div>
  </section>
  ${memoryBlock(r, sim)}
  <section class="panel" aria-label="Utilization">
    <h3 class="panel__title">What the box is doing</h3>
    ${meter('Busy', u.busy)}
    ${meter('Memory bandwidth used', u.bwUtil, null, 0.7)}
    ${meter('Tensor compute used', u.computeUtil, null, 0.7)}
    ${meter('KV cache, peak', u.kvPeak)}
    ${u.cacheHit > 0 ? meter('Prompt tokens from cache', u.cacheHit, null, 2) : ''}
  </section>
  <section class="panel" aria-label="Bottleneck">
    <h3 class="panel__title">Limit <span class="muted">${e(LABELS[r.bottleneck.id] || r.bottleneck.label)}</span></h3>
    <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.5">${e(r.bottleneck.text)}</p>
    ${r.advice.length ? `<ul class="list" style="margin-top:10px">${r.advice.map((a) => `<li>${e(a)}</li>`).join('')}</ul>` : ''}
  </section>
  ${econBlock(r)}
  ${groupsBlock(r)}`;
}

function econBlock(r) {
  const E = r.econ;
  const payback = !isFinite(E.paybackMonths) ? 'never, at this usage'
    : E.paybackMonths > 120 ? 'over 10 years' : `${E.paybackMonths.toFixed(E.paybackMonths < 10 ? 1 : 0)} months`;
  return `<section class="panel" aria-label="Costs">
    <h3 class="panel__title">Costs <span class="muted">${E.hours} busy h/day</span></h3>
    <dl class="kv">
      <dt>Average draw in busy hours</dt><dd>${Math.round(r.util.avgW)} W</dd>
      <dt>Electricity</dt><dd>${fmtUsd(E.elecMonth, 2)} / month</dd>
      <dt>Hardware over ${E.years} years</dt><dd>${fmtUsd(E.amortMonth)} / month</dd>
      <dt>Per served user</dt><dd>${E.perUserMonth == null ? 'none' : fmtUsd(E.perUserMonth, 2)} / month</dd>
      <dt>Same tokens from a cloud API</dt><dd>${fmtUsd(E.cloudMonth)} / month</dd>
      <dt>Box pays for itself in</dt><dd class="big">${e(payback)}</dd>
    </dl>
  </section>`;
}

function groupsBlock(r) {
  const rows = r.groups.map((g) => {
    const fails = Object.entries(g.fail).map(([k, v]) => `${v} ${k}`).join(', ');
    return `<tr>
      <td>${e(g.count)} x ${e(g.persona)}<br><span class="muted">${e(g.client)} · ${e(g.link)}</span></td>
      <td class="r">${g.passPct == null ? 'none' : fmtPct(g.passPct)}</td>
      <td class="r">${g.ttft.p95 == null ? 'none' : fmtSec(g.ttft.p95)}</td>
      <td class="r">${g.e2e.p95 == null ? 'none' : fmtSec(g.e2e.p95)}</td>
    </tr>${fails || g.late || g.truncated ? `<tr><td colspan="4" class="muted" style="border-bottom-color:var(--border)">${e([fails, g.late ? `${g.late} still waiting past the target` : '', g.truncated ? `${g.truncated} conversations trimmed` : ''].filter(Boolean).join('; '))}</td></tr>` : ''}`;
  }).join('');
  return `<section class="panel" aria-label="Groups">
    <h3 class="panel__title">By group</h3>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Group</th><th class="r">On target</th><th class="r">First text p95</th><th class="r">Whole p95</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

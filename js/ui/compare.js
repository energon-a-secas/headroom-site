// ── Compare boxes ────────────────────────────────────────────
// The Sandbox crowd on every box, as one table with inline bars. The
// redline column is the headline: how many users of this crowd's mix each
// box holds before answers stop meeting their targets.

import { boxById } from '../data/hardware.js';
import { runtimeById } from '../data/runtimes.js';
import { modelById, quantById } from '../data/models.js';
import { escHtml as e, fmtPct, fmtSec, fmtUsd, fmtInt, TONE } from '../utils.js';
import { ICONS } from './score.js';
import { LABELS } from '../engine/report.js';
import { deviceImage } from './device-art.js';

const SORTS = {
  redline: (a, b) => (b.redline ?? -1) - (a.redline ?? -1) || (b.report.passRate ?? -1) - (a.report.passRate ?? -1),
  price: (a, b) => boxById(a.boxId).priceUsd - boxById(b.boxId).priceUsd,
  pass: (a, b) => (b.report.passRate ?? -1) - (a.report.passRate ?? -1),
  perUser: (a, b) => (a.report.econ?.perUserMonth ?? 1e9) - (b.report.econ?.perUserMonth ?? 1e9),
};

export function renderCompareLead(el, sc) {
  const users = sc.groups.reduce((a, g) => a + g.count, 0);
  el.textContent = `${users} users in ${sc.groups.length} group${sc.groups.length > 1 ? 's' : ''}, ${modelById(sc.model.id).name} at ${quantById(sc.model.quant).label}, preferring ${runtimeById(sc.runtime.id).name}: the Sandbox setup, run on every box. Boxes that cannot run ${runtimeById(sc.runtime.id).name} fall back to the best server they support.`;
}

export function renderCompare(el, state) {
  const { rows, busy, sort, redline } = state.compare;
  if (!rows.length) {
    el.innerHTML = `<p class="note">${busy ? 'Running the first box...' : 'Nothing compared yet. The comparison takes a few seconds; with redlines, a little longer.'}</p>`;
    return;
  }
  const sorted = [...rows].sort(SORTS[sort] || SORTS.redline);
  const maxRed = Math.max(1, ...rows.map((r) => r.redline || 0));
  const th = (key, label, cls = '') => `<th class="${cls}"><button type="button" class="chip" data-sort="${key}" aria-pressed="${sort === key}" style="${sort === key ? 'border-color:var(--accent);color:var(--text-primary)' : ''}">${e(label)}</button></th>`;
  const body = sorted.map((row) => {
    const b = boxById(row.boxId, state.sc.box.custom);
    const r = row.report;
    const current = row.boxId === state.sc.box.id;
    const tone = TONE[r.verdict?.id] || 'idle';
    const pill = `<span class="pill pill--${tone === 'idle' ? 'warn' : tone}">${ICONS[tone === 'idle' ? 'warn' : tone]}${e(r.verdict?.label || '')}</span>`;
    if (!r.ok) {
      return `<tr data-box="${e(row.boxId)}" class="${current ? 'is-current' : ''}"><td><div class="compare-device"><img src="${deviceImage(b.id)}" alt="" width="72" height="56"><span><b>${e(b.short)}</b><br><span class="muted">${fmtUsd(b.priceUsd * state.sc.box.count)}</span></span></div></td>
        <td colspan="${redline ? 6 : 5}" style="white-space:normal"><span class="pill pill--bad">${ICONS.bad}Does not fit</span> <span class="muted">${e(r.fit?.reason || '')}</span></td></tr>`;
    }
    const worstE2e = Math.max(...r.groups.map((g) => g.e2e.p95 ?? 0));
    return `<tr data-box="${e(row.boxId)}" data-runtime="${e(row.runtime)}" class="${current ? 'is-current' : ''}" title="Load ${e(b.short)} into the Sandbox">
      <td><div class="compare-device"><img src="${deviceImage(b.id)}" alt="" width="72" height="56"><span><button type="button" class="row-load" data-box="${e(row.boxId)}" data-runtime="${e(row.runtime)}" aria-label="Load ${e(b.short)} into the Sandbox">${e(b.short)}</button>${b.status !== 'shipping' ? ` <span class="muted">(${e(b.status)})</span>` : ''}<br><span class="muted">${fmtUsd(b.priceUsd * state.sc.box.count)} · ${e(runtimeById(row.runtime).name)}</span></span></div></td>
      <td>${pill}</td>
      <td><div class="inbar"><span><i style="width:${((r.passRate || 0) * 100).toFixed(1)}%"></i></span><b>${fmtPct(r.passRate)}</b></div></td>
      <td class="r hide-sm">${worstE2e ? fmtSec(worstE2e) : 'none'}</td>
      <td class="hide-sm"><div class="inbar"><span><i style="width:${(r.util.busy * 100).toFixed(1)}%;background:var(--c-3)"></i></span><b>${fmtPct(r.util.busy)}</b></div></td>
      ${redline ? `<td><div class="inbar"><span><i style="width:${(((row.redline || 0) / maxRed) * 100).toFixed(1)}%;background:var(--accent)"></i></span><b>${row.redline == null ? '...' : fmtInt(row.redline)}</b></div>${row.boxUsers ? `<span class="muted">box alone ${fmtInt(row.boxUsers)}, the network caps it</span>` : row.redlineWhy ? `<span class="muted">${e(LABELS[row.redlineWhy] || row.redlineWhy)}</span>` : ''}</td>` : ''}
      <td class="r">${r.econ?.perUserMonth == null ? 'none' : fmtUsd(r.econ.perUserMonth, 2)}<br><span class="muted">${Math.round(r.util.avgW)} W</span></td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="table-wrap"><table class="tbl">
    <thead><tr>${th('price', 'Box, by price')}<th>Verdict</th>${th('pass', 'On target')}<th class="r hide-sm">Slowest p95</th><th class="hide-sm">Busy</th>${redline ? th('redline', 'Redline users') : ''}${th('perUser', '$ per user / month', 'r')}</tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="note">${busy ? 'Still running: rows appear as each box finishes. ' : ''}Click a row to load that box into the Sandbox. Redline is the most users of this crowd's mix that still get 95% of answers on target.</p>`;
}

// ── How it works: calibration and catalog tables ─────────────

import { BOXES } from '../data/hardware.js';
import { CALIBRATION, BATCH_CALIBRATION } from '../data/calibration.js';
import { modelById, quantById } from '../data/models.js';
import { runtimeById } from '../data/runtimes.js';
import { buildEngine, singleUserSpeeds, batchDecodeTps } from '../engine/perf.js';
import { escHtml as e, fmtUsd } from '../utils.js';

const ratio = (model, measured) => {
  if (!measured) return '';
  const r = model / measured;
  const txt = `${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)}%`;
  return `<span class="${Math.abs(r - 1) <= 0.25 ? '' : 'flag'}">${txt}</span>`;
};

export function renderMethod(calEl, catEl) {
  if (calEl && !calEl.dataset.ready) {
    const rows = CALIBRATION.map((c) => {
      const eng = buildEngine({ box: { id: c.box, count: 1, mode: 'replica' }, model: { id: c.model, quant: c.quant, kv: 'f16' }, runtime: { id: c.runtime }, groups: [] });
      const s = eng.fit.ok ? singleUserSpeeds(eng, c.ctx || 512, c.chunk) : null;
      return `<tr>
        <td>${e(BOXES.find((b) => b.id === c.box)?.short || c.box)}</td>
        <td>${e(modelById(c.model).name)} <span class="muted">${e(quantById(c.quant).label)}</span></td>
        <td>${e(runtimeById(c.runtime).name)}</td>
        <td class="r">${c.tg ?? 'none'}</td><td class="r">${s ? s.decodeTps.toFixed(1) : 'no fit'}</td><td class="r">${s ? ratio(s.decodeTps, c.tg) : ''}</td>
        <td class="r">${c.pp ?? 'none'}</td><td class="r">${s ? Math.round(s.prefillTps) : ''}</td><td class="r">${s && c.pp ? ratio(s.prefillTps, c.pp) : ''}</td>
        <td>${c.url ? `<a href="${e(c.url)}" target="_blank" rel="noopener noreferrer">${e(c.source)}</a>` : e(c.source)}</td>
      </tr>`;
    }).join('');
    calEl.innerHTML = CALIBRATION.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Box</th><th>Model</th><th>Runtime</th><th class="r">Measured tok/s</th><th class="r">Model</th><th class="r">Diff</th><th class="r">Measured prompt tok/s</th><th class="r">Model</th><th class="r">Diff</th><th>Source</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="note">One user, short context. Generation is the number that matters most for chat; prompt speed matters for agents and documents. Where the benchmark is old (mid-2025 Strix Halo), today's software is faster than the measurement.</p>
      <h3>Many users at once</h3>
      <p>Total generation speed with several streams decoding together, the number that decides how many people a box holds.</p>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Box</th><th>Model</th><th>Runtime</th><th>Streams: measured, model</th><th>Source</th></tr></thead><tbody>
      ${BATCH_CALIBRATION.map((b) => {
        const eng = buildEngine({ box: { id: b.box, count: 1, mode: 'replica' }, model: { id: b.model, quant: b.quant, kv: 'f16' }, runtime: { id: b.runtime }, groups: [] });
        const pts = b.points.map(([n, agg]) => `${n}: ${agg} / ${Math.round(batchDecodeTps(eng, n, b.ctx))} tok/s`).join(' \u00b7 ');
        return `<tr><td>${e(BOXES.find((x) => x.id === b.box)?.short || b.box)}</td><td>${e(modelById(b.model).name)} <span class="muted">${e(quantById(b.quant).label)}</span></td><td>${e(runtimeById(b.runtime).name)}</td><td>${pts}</td><td><a href="${e(b.url)}" target="_blank" rel="noopener noreferrer">${e(b.source)}</a></td></tr>`;
      }).join('')}</tbody></table></div>` : '';
    calEl.dataset.ready = '1';
  }
  if (catEl && !catEl.dataset.ready) {
    catEl.innerHTML = `<h3>The boxes</h3><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Box</th><th class="r">Memory</th><th class="r">Bandwidth</th><th class="r">FP16 / FP4 TFLOPS</th><th class="r">Power</th><th class="r">Price</th><th>Numbers are</th></tr></thead>
      <tbody>${BOXES.map((b) => `<tr><td><b>${e(b.short)}</b><br><span class="muted">${e(b.chip)}</span></td>
        <td class="r">${b.memGB} GB</td><td class="r">${b.bwGBs} GB/s</td><td class="r">${b.tflops.fp16} / ${b.tflops.fp4}</td>
        <td class="r">${b.idleW} to ${b.loadW} W</td><td class="r">${fmtUsd(b.priceUsd)}</td>
        <td>${e(b.status === 'shipping' ? b.confidence : `${b.status}, ${b.confidence}`)}</td></tr>
        <tr><td colspan="7" class="muted" style="border-bottom-color:var(--border)">${e(b.priceNote || '')}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Prices as of ${e(BOXES[0].priceAsOf)}. The 2026 memory shortage moves them monthly; set your own in a custom box.</p>`;
    catEl.dataset.ready = '1';
  }
}

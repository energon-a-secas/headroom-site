// ── Loadout panel ────────────────────────────────────────────
// Box, model, runtime and crowd. Every control carries data attributes
// that events.js reads, so this module only produces markup.

import { BOXES, STATUS_LABEL } from '../data/hardware.js';
import { MODELS, KV_DTYPES, quantsFor, modelById } from '../data/models.js';
import { RUNTIMES, runtimeById } from '../data/runtimes.js';
import { PERSONAS, CLIENTS, LINKS, PROTOCOLS, personaById, clientById, linkById, protocolById } from '../data/crowd.js';
import { buildEngine, fmtK } from '../engine/perf.js';
import { engineSummary } from '../engine/report.js';
import { CROWDS } from '../state.js';
import { escHtml as e, fmtUsd, fmtGB, fmtTps, fmtInt } from '../utils.js';
import { deviceImage } from './device-art.js';
import { enclosuresFor, enclosureFor } from '../data/enclosures.js';

const opt = (value, label, selected, disabled = false) =>
  `<option value="${e(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${e(label)}</option>`;

const TRASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
const disclosures = new Map();

export function renderLoadout(el, state) {
  const sc = state.sc;
  const eng = buildEngine(sc);
  const scroll = el.scrollTop;
  el.querySelectorAll('details[data-disclosure]').forEach(d => disclosures.set(d.dataset.disclosure, d.open));
  const sections = [['hardware', 'Hardware'], ['model', 'Model & server'], ['people', 'People']];
  const content = state.setup === 'people' ? crowdPanel(sc, state)
    : state.setup === 'model' ? modelPanel(sc, eng) + runtimePanel(sc, eng)
    : boxPanel(sc, eng) + costPanel(sc);
  el.classList.toggle('is-expanded', state.setupExpanded);
  el.innerHTML = `<div class="loadout-heading"><h3>Your setup</h3><span>Changes update the result</span><button type="button" class="btn btn--ghost btn--sm setup-toggle" data-act="toggle-setup" aria-expanded="${state.setupExpanded}" aria-controls="setupContent">${state.setupExpanded ? 'Done' : 'Edit setup'}</button></div>
    <p class="loadout-summary">${e(eng.box.short)} · ${e(eng.model.name)}<span>${fmtInt(sc.groups.reduce((n, g) => n + g.count, 0))} users · ${e(eng.rt.name)}</span></p>
    <nav class="setup-nav" aria-label="Setup sections">${sections.map(([id, label], i) => `<button type="button" data-setup="${id}" aria-pressed="${state.setup === id}" aria-controls="setupContent"><span>${String(i + 1).padStart(2, '0')}</span>${label}</button>`).join('')}</nav>
    <div class="setup-content" id="setupContent">${content}</div>
    <div class="setup-recap"><p class="eyebrow">In this simulation</p>
      <button type="button" data-setup="hardware"><span>Hardware</span><strong>${e(eng.box.short)}${eng.count > 1 ? ` × ${eng.count}` : ''}</strong></button>
      <button type="button" data-setup="model"><span>Model</span><strong>${e(eng.model.name)}</strong></button>
      <button type="button" data-setup="model"><span>Server</span><strong>${e(eng.rt.name)}</strong></button>
      <button type="button" data-setup="people"><span>People</span><strong>${fmtInt(sc.groups.reduce((n, g) => n + g.count, 0))} in ${sc.groups.length} group${sc.groups.length > 1 ? 's' : ''}</strong></button>
    </div>`;
  el.querySelectorAll('details[data-disclosure]').forEach(d => { if (disclosures.has(d.dataset.disclosure)) d.open = disclosures.get(d.dataset.disclosure); });
  el.scrollTop = scroll;
}

export function renderScenarios(el, state) {
  const scroll = el.querySelector('.scenario-picks')?.scrollLeft || 0;
  const same = (a, b) => ['persona', 'count', 'client', 'link', 'distanceKm'].every(k => a[k] === b[k])
    && (a.protocol || '') === (b.protocol || '') && JSON.stringify(a.tweak || {}) === JSON.stringify(b.tweak || {});
  el.innerHTML = `<span class="scenario-label">Try a crowd</span><div class="scenario-picks">${Object.entries(CROWDS).map(([k, c]) => {
    const active = state.sc.groups.length === c.groups.length && state.sc.groups.every((g, i) => same(g, c.groups[i]));
    return `<button type="button" class="chip" data-crowd="${k}" aria-pressed="${active}">${e(c.label)}</button>`;
  }).join('')}</div><button type="button" class="btn btn--ghost btn--sm browse-setups" data-tab="setups">Browse setups <span aria-hidden="true">→</span></button>`;
  el.querySelector('.scenario-picks').scrollLeft = scroll;
}

// ── Box ──
function boxPanel(sc, eng) {
  const b = eng.box;
  const groups = ['shipping', 'discontinued', 'announced'].map((st) => [STATUS_LABEL[st], BOXES.filter((x) => x.status === st)]);
  const select = `<select class="select" data-k="box.id" aria-label="Box">${groups.map(([label, list]) =>
    `<optgroup label="${e(label)}">${list.map((x) => opt(x.id, `${x.short} . ${x.memGB} GB . ${fmtUsd(x.priceUsd)}`.replace(/ \. /g, ' · '), x.id === sc.box.id)).join('')}</optgroup>`).join('')}
    <optgroup label="Your own">${opt('custom', 'Custom box: type your specs', sc.box.id === 'custom')}</optgroup></select>`;
  const count = `<select class="select" data-k="box.count" aria-label="How many boxes">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => opt(n, n === 1 ? '1 box' : `${n} boxes`, sc.box.count === n)).join('')}</select>`;
  const mode = sc.box.count > 1
    ? `<select class="select" data-k="box.mode" aria-label="How boxes share work">${opt('replica', 'Each runs a copy', sc.box.mode !== 'split')}${opt('split', 'Split one model', sc.box.mode === 'split')}</select>`
    : '<span></span>';
  const custom = sc.box.id === 'custom' ? customEditor(b) : '';
  const shapes = enclosuresFor(sc.box.id);
  const shape = enclosureFor(sc.box.enclosure);
  const tf = b.tflops;
  return `<section class="panel" aria-label="Box">
    <div class="hardware-preview"><span class="hardware-maker">${e(b.maker)}</span><img src="${deviceImage(sc.box.id, false, sc.box.enclosure)}" width="360" height="240" alt="${e(shape?.name || b.name)}: illustrative 3D model"><span class="hardware-render-note">Illustrative render</span></div>
    <div class="hardware-title"><h3>${e(b.short)}</h3><span>${fmtUsd(b.priceUsd * sc.box.count)}</span></div>
    <p class="hardware-chip">${e(b.chip)}</p>
    <div class="hardware-facts"><span><strong>${b.memGB} GB</strong>memory / box</span><span><strong>${b.bwGBs} GB/s</strong>bandwidth</span><span><strong>${b.loadW} W</strong>under load</span></div>
    <label class="field"><span>Hardware</span>${select}</label>
    ${shapes.length ? `<label class="field"><span>Enclosure appearance</span><select class="select" data-k="box.enclosure" aria-describedby="enclosureNote">${opt('', 'Default enclosure', !sc.box.enclosure)}${shapes.map(s => opt(s.id, s.name, s.id === sc.box.enclosure)).join('')}</select></label><p class="note enclosure-note" id="enclosureNote">Appearance only. Use the specifications below to change performance.</p>` : ''}
    <div class="row"><label class="field"><span>Quantity</span>${count}</label>${sc.box.count > 1 ? `<label class="field"><span>Distribution</span>${mode}</label>` : ''}</div>
    ${sc.box.count > 1 && sc.box.mode === 'split' && !b.pairable ? `<p class="warnline">These boxes split a model over ${e(b.link.name)}: every layer waits on the network.</p>` : ''}
    ${custom}
    <details class="disclosure" data-disclosure="hardware-specs"><summary>Specifications & pricing <span>${e(b.status === 'shipping' ? 'View details' : b.status)}</span></summary>
    <dl class="specs">
      <dt>Memory</dt><dd>${b.memGB} GB (${b.usableGB} usable)</dd>
      <dt>Bandwidth</dt><dd>${b.bwGBs} GB/s</dd>
      <dt>Tensor, dense</dt><dd>${tf.fp16} FP16${tf.fp4 !== tf.fp16 ? ` · ${tf.fp4} FP4` : ''} TFLOPS</dd>
      <dt>Power</dt><dd>${b.idleW} W idle · ${b.loadW} W busy</dd>
      <dt>Network</dt><dd>${e(b.net)}</dd>
      <dt>Price</dt><dd>${fmtUsd(b.priceUsd)}${sc.box.count > 1 ? ` x${sc.box.count}` : ''}</dd>
    </dl>
    ${b.priceNote ? `<p class="note">${e(b.priceNote)}${b.priceAsOf ? ` Prices as of ${e(b.priceAsOf)}.` : ''}</p>` : ''}
    </details>
  </section>`;
}

function customEditor(b) {
  const f = (k, label, v, step = 1) => `<label class="field"><span>${e(label)}</span><input class="input" type="number" min="0" step="${step}" data-custom="${k}" value="${v}"></label>`;
  return `<p class="note custom-build-note">Enter your actual hardware specifications. Starter figures do not describe the pictured enclosure.</p><div class="row">${f('memGB', 'Memory GB', b.memGB)}${f('usableGB', 'Usable GB', b.usableGB)}</div>
    <div class="row">${f('bwGBs', 'Bandwidth GB/s', b.bwGBs)}${f('priceUsd', 'Price $', b.priceUsd, 50)}</div>
    <div class="row--3 row">${f('tflops.fp16', 'FP16 TF', b.tflops.fp16, 0.1)}${f('tflops.fp8', 'FP8 TF', b.tflops.fp8, 0.1)}${f('tflops.fp4', 'FP4 TF', b.tflops.fp4, 0.1)}</div>
    <div class="row">${f('idleW', 'Idle W', b.idleW)}${f('loadW', 'Busy W', b.loadW)}</div>
    <label class="field"><span>Software platform</span><select class="select" data-custom="platform">
      ${[['cuda', 'NVIDIA CUDA'], ['rocm', 'AMD ROCm / Vulkan'], ['metal', 'Apple Metal'], ['cpu', 'CPU only']].map(([v, l]) => opt(v, l, b.platform === v)).join('')}</select></label>`;
}

// ── Model ──
function sizeBand(m) {
  if (m.totalB < 10) return 'Small, under 10B';
  if (m.totalB < 40) return 'Medium, 10 to 40B';
  if (m.totalB < 150) return 'Large, 40 to 150B';
  return 'Huge, over 150B';
}

function modelPanel(sc, eng) {
  const bands = {};
  for (const m of MODELS) if (!m.hidden) (bands[sizeBand(m)] ||= []).push(m);
  const select = `<select class="select" data-k="model.id" aria-label="Model">${Object.entries(bands).map(([band, list]) =>
    `<optgroup label="${e(band)}">${list.map((m) => opt(m.id, `${m.name} . ${m.totalB}B${m.moe ? ` (${m.activeB}B active)` : ''}`.replace(' . ', ' · '), m.id === sc.model.id)).join('')}</optgroup>`).join('')}</select>`;
  const m = modelById(sc.model.id);
  const quants = quantsFor(m);
  const quant = `<select class="select" data-k="model.quant" aria-label="Weight precision">${quants.map((q) => opt(q.id, q.label, q.id === eng.quant.id)).join('')}</select>`;
  const kv = `<select class="select" data-k="model.kv" aria-label="KV cache precision">${KV_DTYPES.map((k) => opt(k.id, k.label, k.id === sc.model.kv)).join('')}</select>`;
  const caps = [0, 8192, 16384, 32768, 65536, 131072].filter((c) => c <= m.maxCtx);
  const ctx = `<select class="select" data-k="model.ctxCap" aria-label="Context cap">${caps.map((c) => opt(c, c ? `${fmtK(c)} context cap` : `Full ${fmtK(m.maxCtx)} context`, (sc.model.ctxCap | 0) === c)).join('')}</select>`;
  const s = engineSummary(eng);
  const stars = '★'.repeat(Math.round(s.tier)) + '☆'.repeat(Math.max(0, 5 - Math.round(s.tier)));
  let status;
  if (!eng.fit.ok) status = `<p class="badline">${e(eng.fit.reason)}</p>`;
  else status = `<dl class="specs">
      <dt>Weights</dt><dd>${fmtGB(s.weightsGB)} of ${fmtGB(s.usableGB)}</dd>
      <dt>KV cache</dt><dd>${fmtGB(s.kvPoolGB)} · ${Math.round(s.kvPerTokKB)} KB/token</dd>
      <dt>One user</dt><dd>${fmtTps(s.decodeTps)} · prompt ${fmtInt(s.prefillTps)} tok/s</dd>
      <dt>Capability</dt><dd title="Coarse editorial tier, 1 to 5">${stars} ${s.tier.toFixed(1)}</dd>
    </dl>`;
  return `<section class="panel" aria-label="Model">
    <h3 class="panel__title">Choose a model</h3>
    <label class="field"><span>Language model</span>${select}</label>
    <div class="row"><label class="field"><span>Weight precision</span>${quant}</label><label class="field"><span>KV cache precision</span>${kv}</label></div>
    <div class="field" style="margin-top:8px">${ctx}</div>
    ${status}
    <p class="note">${e(m.note)}</p>
  </section>`;
}

// ── Runtime ──
function runtimePanel(sc, eng) {
  const rt = eng.rt;
  const select = `<select class="select" data-k="runtime.id" aria-label="Inference server">${RUNTIMES.map((r) => {
    const ok = r.platforms.includes(eng.box.platform);
    return opt(r.id, ok ? r.name : `${r.name} (not on this box)`, r.id === sc.runtime.id, !ok);
  }).join('')}</select>`;
  const o = sc.runtime.overrides || {};
  let knobs;
  if (rt.batching === 'slots') {
    knobs = `<div class="row">
      <label class="field"><span>Parallel slots</span><select class="select" data-k="rt.slots">${[1, 2, 4, 8, 16, 32, 64].map((n) => opt(n, `${n}`, (o.slots ?? runtimeById(rt.id).slots) === n)).join('')}</select></label>
      <label class="field"><span>Context per slot</span><select class="select" data-k="rt.ctxPerSlot">${[4096, 8192, 16384, 32768, 65536, 131072].map((n) => opt(n, fmtK(n), (o.ctxPerSlot ?? runtimeById(rt.id).ctxPerSlot) === n)).join('')}</select></label>
    </div>`;
  } else {
    knobs = `<label class="field"><span>Max sequences per batch</span><select class="select" data-k="rt.maxBatch">${[8, 16, 32, 64, 128, 256].map((n) => opt(n, `${n}`, (o.maxBatch ?? runtimeById(rt.id).maxBatch) === n)).join('')}</select></label>`;
  }
  const cache = `<label class="check"><input type="checkbox" data-k="rt.prefixCache"${(o.prefixCache ?? rt.prefixCache) ? ' checked' : ''}> Prefix caching</label>`;
  return `<section class="panel" aria-label="Inference server">
    <h3 class="panel__title">Server software</h3>
    ${eng.box.platform === 'metal' ? '<p class="note host-platform">macOS · Apple Metal</p>' : ''}
    <div class="field">${select}</div>
    ${knobs}
    ${cache}
    <p class="note">${e(runtimeById(rt.id).blurb)}</p>
  </section>`;
}

// ── Crowd ──
export function sloText(P) {
  const parts = [];
  if (P.slo.ttft) parts.push(`first text in ${P.slo.ttft} s`);
  if (P.slo.tps) parts.push(`at ${P.slo.tps} tok/s or faster`);
  if (P.slo.e2e) parts.push(`whole answer in ${P.slo.e2e} s`);
  return parts.length ? `Good answer: ${parts.join(', ')}.` : '';
}

function crowdPanel(sc, state) {
  const locked = !!state.mission;
  const total = sc.groups.reduce((a, g) => a + g.count, 0);
  return `<section class="panel" aria-label="Crowd">
    <h3 class="panel__title">Crowd <span class="muted">${fmtInt(total)} users</span></h3>
    ${locked ? '<p class="note" style="margin:0 0 10px">The mission sets the crowd. Tune the box, model and server.</p>' : ''}
    <div class="${locked ? 'locked' : ''}"${locked ? ' inert' : ''}>
      ${sc.groups.map((g, i) => groupEditor(g, i, sc.groups.length)).join('')}
      <button type="button" class="btn btn--ghost btn--sm btn--block" data-act="add-group"${sc.groups.length >= 8 ? ' disabled' : ''}>+ Add another group</button>
    </div>
  </section>`;
}

function groupEditor(g, i, n) {
  const P = personaById(g.persona), C = clientById(g.client), L = linkById(g.link);
  const proto = g.protocol ? protocolById(g.protocol) : protocolById(C.protocol);
  const tweaked = g.tweak ? { ...P, ...g.tweak, slo: { ...P.slo, ...(g.tweak.slo || {}) } } : P;
  const dist = L.unit === 'none' ? '' : `<label class="field"><span>Distance (${L.unit})</span><input class="input" type="number" min="0" step="${L.unit === 'm' ? 1 : 10}" data-g="${i}" data-f="distance" value="${L.unit === 'm' ? Math.round((g.distanceKm || 0) * 1000) : +(g.distanceKm || 0)}"></label>`;
  const outOfRange = L.rangeKm > 0 && (g.distanceKm || 0) > L.rangeKm;
  const overCap = g.count > L.maxClients;
  return `<div class="group">
    <div class="group-device"><img src="${deviceImage(C.id, true)}" width="84" height="64" alt=""><div><span class="eyebrow">Group ${i + 1}</span><strong>${e(C.name)}</strong></div></div>
    <div class="group__head">
      <label class="field"><span>Workload</span><select class="select" data-g="${i}" data-f="persona" aria-label="Who">${PERSONAS.map((p) => opt(p.id, p.name, p.id === g.persona)).join('')}</select></label>
      <label class="field group__count"><span>People</span><input class="input" type="number" min="1" max="5000" data-g="${i}" data-f="count" value="${g.count}" aria-label="How many"></label>
      ${n > 1 ? `<button type="button" class="icon-btn" data-act="remove-group" data-g="${i}" aria-label="Remove this group">${TRASH}</button>` : ''}
    </div>
    <div class="row">
      <label class="field"><span>Device</span><select class="select" data-g="${i}" data-f="client">${CLIENTS.map((c) => opt(c.id, c.name, c.id === g.client)).join('')}</select></label>
      <label class="field"><span>Link</span><select class="select" data-g="${i}" data-f="link">${LINKS.map((l) => opt(l.id, l.name, l.id === g.link)).join('')}</select></label>
    </div>
    <details class="disclosure" data-disclosure="group-${e(g.id)}"><summary>Connection details<span>${e(L.unit === 'm' ? `${Math.round((g.distanceKm || 0) * 1000)} m` : L.unit === 'km' ? `${g.distanceKm || 0} km` : 'Local')}</span></summary><div class="row">
      <label class="field"><span>Protocol</span><select class="select" data-g="${i}" data-f="protocol">${opt('', `Device default: ${protocolById(C.protocol).name}`, !g.protocol)}${PROTOCOLS.map((p) => opt(p.id, p.name, p.id === g.protocol)).join('')}</select></label>
      ${dist}
    </div></details>
    <p class="group__meta">${e(sloText(tweaked))} ${proto.stream && C.mode === 'final' ? 'This device waits for the whole answer, so streaming only costs airtime.' : ''}</p>
    ${outOfRange ? `<p class="badline">${e(L.name)} reaches about ${L.unit === 'm' ? `${Math.round(L.rangeKm * 1000)} m` : `${L.rangeKm} km`}. These users are out of range.</p>` : ''}
    ${overCap ? `<p class="warnline">${e(L.name)} holds about ${L.maxClients} clients; ${g.count - L.maxClients} will not connect.</p>` : ''}
  </div>`;
}

// ── Costs ──
function costPanel(sc) {
  const E = sc.econ;
  const f = (k, label, v, step) => `<label class="field"><span>${e(label)}</span><input class="input" type="number" min="0" step="${step}" data-econ="${k}" value="${v}"></label>`;
  return `<details class="panel disclosure" data-disclosure="costs">
    <summary class="panel__title" style="cursor:pointer;margin:0">Costs and cloud comparison</summary>
    <div style="margin-top:12px">
      <div class="row">${f('kwh', 'Electricity $/kWh', E.kwh, 0.01)}${f('hours', 'Busy hours a day', E.hours, 1)}</div>
      <div class="row">${f('cloudIn', 'Cloud $ per M input', E.cloudIn, 0.05)}${f('cloudOut', 'Cloud $ per M output', E.cloudOut, 0.05)}</div>
      ${f('years', 'Years to pay off the box', E.years, 1)}
      <p class="note">Cloud prices default to $0.40 per million input and $1.60 per million output tokens. Set them to your own API bill to see payback against it.</p>
    </div>
  </details>`;
}

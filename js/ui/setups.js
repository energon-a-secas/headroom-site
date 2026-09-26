import { LOCAL_SETUPS, buildBaseline } from '../data/setups.js';
import { ENCLOSURES } from '../data/enclosures.js';
import { boxById } from '../data/hardware.js';
import { modelById, quantById } from '../data/models.js';
import { runtimeById } from '../data/runtimes.js';
import { deviceImage } from './device-art.js';
import { escHtml as e, fmtInt } from '../utils.js';

const OS = { macos: 'macOS', linux: 'Linux' };
const BACKEND = { metal: 'Metal', cuda: 'CUDA', rocm: 'ROCm / Vulkan', cpu: 'CPU' };

function setupCard(s) {
  const box = boxById(s.box), model = modelById(s.model), runtime = runtimeById(s.runtime);
  const precision = s.runtime === 'mlx' ? '4-bit estimate' : quantById(s.quant || 'q4').label;
  const users = s.groups.reduce((n, g) => n + g.count, 0), local = s.groups.every(g => g.link === 'local');
  return `<article class="local-setup">
    <div class="setup-art"><span>${e(s.category)}</span><img src="${deviceImage(s.box, false, s.enclosure)}" width="600" height="400" alt="${e(box.short)} in an illustrative enclosure" loading="lazy"></div>
    <div class="local-setup-body"><p class="setup-platform">${OS[s.os]} <span>· ${BACKEND[box.platform]}</span></p>
      <h3>${e(s.title)}</h3><p class="setup-description">${e(s.description)}</p>
      <dl class="setup-pairing"><dt>Hardware</dt><dd>${e(box.short)} <span>· ${box.memGB} GB</span></dd>
        <dt>AI model</dt><dd>${e(model.name)} <span>· ${e(precision)}</span></dd>
        <dt>Server</dt><dd>${e(runtime.name)}</dd></dl>
      <div class="setup-card-end"><span>${fmtInt(users)} ${users === 1 ? 'user' : 'users'} · ${local ? 'On-device' : 'Networked'}</span><button type="button" class="btn btn--secondary btn--sm" data-local-setup="${s.id}" aria-label="Load ${e(s.title)}">Try this setup <span aria-hidden="true">→</span></button></div>
    </div></article>`;
}

export function renderLocalSetups(el, state) {
  const filter = state.setupFilter || 'all';
  const setups = LOCAL_SETUPS.filter(s => filter === 'all' || s.os === filter);
  el.innerHTML = `<div class="setups-heading"><div><p class="eyebrow">Local setups</p><h2>Find your starting point.</h2>
      <p>From an assistant on your Mac to a server for your team. Choose an example, then make it yours.</p></div>
      <button type="button" class="btn btn--ghost btn--sm" data-act="browse-builds">Build your own <span aria-hidden="true">↘</span></button></div>
    <div class="setup-filters" role="group" aria-label="Filter setups by operating system">${[['all', 'All setups'], ['macos', 'macOS'], ['linux', 'Linux']].map(([id, label]) => `<button type="button" class="chip" data-setup-filter="${id}" aria-pressed="${filter === id}">${label}<span>${id === 'all' ? LOCAL_SETUPS.length : LOCAL_SETUPS.filter(s => s.os === id).length}</span></button>`).join('')}</div>
    <p class="setups-note">Examples use catalog estimates. Loading one replaces your setup; electricity and cost preferences stay yours.</p>
    <div class="local-setups-grid" aria-label="Example setups">${setups.map(setupCard).join('')}</div>
    <section class="build-section" aria-labelledby="buildTitle"><div class="build-heading"><h2 id="buildTitle" tabindex="-1">A shape for your own machine.</h2><p>Pick an enclosure, then enter your hardware specs. Starter figures are placeholders for your build. Case size, cooling, and component clearance are not simulated.</p></div>
      <div class="enclosure-grid">${ENCLOSURES.map(shape => `<article class="enclosure-choice"><img src="${deviceImage(shape.id)}" width="600" height="400" alt="Illustrative ${e(shape.name.toLowerCase())}" loading="lazy"><h3>${e(shape.name)}</h3><p>${e(shape.detail)}</p><small>Starts with ${e(buildBaseline(shape.id).short)} figures</small><button type="button" class="btn btn--ghost btn--sm" data-build="${shape.id}" aria-label="Customize ${e(shape.name.toLowerCase())}">Customize <span aria-hidden="true">→</span></button></article>`).join('')}</div>
    </section>`;
}

// ── Entry point ──────────────────────────────────────────────
// Load the saved (or linked) scenario, start a paused run, wire the page.

import { state, loadSaved } from './state.js';
import { rebuild, on } from './runner.js';
import { render, renderFrame, renderReport } from './render.js';
import { bindEvents } from './events.js';

function init() {
  loadSaved(state);
  // A shared link has been applied; drop it so later edits are not shadowed by it.
  if (location.hash.includes('s=')) history.replaceState(null, '', location.pathname + location.search);
  on('frame', renderFrame);
  on('report', renderReport);
  rebuild();
  render();
  bindEvents();
}

init();

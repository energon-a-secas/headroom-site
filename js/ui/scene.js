// The simulation works immediately; WebGL is an optional, lazy-loaded view.
import { drawFloor, renderFloorSummary } from './floor.js';
import { $, fmtInt } from '../utils.js';

let mode = 'devices', renderer, pending = false, failed = false, latest;

function syncView() {
  const use3D = mode === 'devices' && !!renderer && !failed;
  $('floor').hidden = use3D;
  $('deviceFloor').hidden = !use3D;
  $('sceneCamera').hidden = !use3D;
  document.querySelectorAll('[data-scene-view]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.sceneView === mode));
    b.disabled = b.dataset.sceneView === 'devices' && failed;
  });
}

function fallback() {
  failed = true; mode = 'activity';
  syncView();
  if (latest) drawScene(latest, true);
}

export function setSceneView(view) {
  if (!['devices', 'activity'].includes(view) || (view === 'devices' && failed)) return;
  mode = view; syncView();
  if (latest) drawScene(latest, true);
}

export const moveCamera = action => renderer?.control(action);

export function drawScene(state, force = false) {
  latest = state;
  if (!state.sim || state.tab !== 'sandbox') return;
  if (mode === 'devices' && !renderer && !pending && !failed) {
    pending = true;
    import('./floor3d.js').then(({ createFloor3D }) => {
      renderer = createFloor3D($('deviceFloor'), fallback);
      pending = false; syncView(); drawScene(latest, true);
    }).catch(() => { pending = false; fallback(); });
  }
  const sim = state.sim;
  const snap = sim.snapshot();
  const active = mode === 'devices' && !!renderer && !failed;
  const count = active ? renderer.draw(sim, snap, force) : sim.users.length;
  if (active) renderFloorSummary(sim, $('floorLegend'), $('floorGroups'), snap);
  else drawFloor($('floor'), sim, $('floorLegend'), $('floorGroups'));
  const eng = sim.eng;
  $('sceneSummary').textContent = `${eng.box.short}${eng.count > 1 ? ` × ${eng.count}` : ''} · ${eng.model.name} · ${fmtInt(sim.users.length)} ${sim.users.length === 1 ? 'user' : 'users'}`;
  const status = $('sceneStatus');
  status.textContent = state.running ? 'Simulation running' : sim.t === 0 ? 'Ready to run' : 'Simulation paused';
  status.classList.toggle('is-running', state.running);
  $('sceneLoad').textContent = eng.fit.ok ? `${snap.servers.reduce((n, s) => n + s.running, 0)} in progress · ${snap.servers.reduce((n, s) => n + s.queue, 0)} queued` : 'Model does not fit';
  const caption = active
    ? `${count < sim.users.length ? `${fmtInt(count)} of ${fmtInt(sim.users.length)} devices shown · ` : ''}Illustrative models · drag to explore`
    : failed ? '3D unavailable in this browser. All users are shown in Activity.' : pending && mode === 'devices' ? 'Preparing your 3D setup…' : 'One dot per user · every request simulated';
  $('sceneCaption').textContent = caption;
}

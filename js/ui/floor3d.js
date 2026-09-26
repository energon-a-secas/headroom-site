import * as T from '../vendor/three/three.module.js';
import { createHardware, createClient } from './device-models.js';
import { U } from '../engine/sim.js';

const MAX_DEVICES = 72;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const stateColor = (s) => s === U.OFF ? '#a5acb8' : s === U.SEND ? '#60a5fa'
  : s === U.QUEUE || s === U.PREFILL ? '#ed9868' : s === U.DECODE || s === U.RECV ? '#5cd6af' : '#6c7c8e';

export function createFloor3D(canvas, onLost) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight('#e2effb', '#404b61', 3));
  const key = new T.DirectionalLight('#fff0d9', 4.2); key.position.set(-5, 9, 5); scene.add(key);
  const rim = new T.DirectionalLight('#b8d6ff', 2.5); rim.position.set(5, 5, -4); scene.add(rim);
  const camera = new T.OrthographicCamera(-8, 8, 6, -6, 0.1, 80);
  const root = new T.Group(); scene.add(root);
  const clients = [], dynamic = [];
  let lastSim = null, lastDraw = -Infinity, width = 0, height = 0, shown = 0;
  let angle = 0.25, elevation = 0.86, zoom = 1, lastSnap;
  const point = new T.Vector3();
  const particleGeo = new T.BufferGeometry();
  const positions = new Float32Array(MAX_DEVICES * 3);
  const particleColors = new Float32Array(MAX_DEVICES * 3);
  particleGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new T.Float32BufferAttribute(particleColors, 3));
  const particles = new T.Points(particleGeo, new T.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }));
  scene.add(particles);

  const gridPoints = [];
  for (let n = -9; n <= 9; n++) gridPoints.push(-9, -0.035, n, 9, -0.035, n, n, -0.035, -9, n, -0.035, 9);
  // Separate segments avoid diagonals between successive grid lines.
  const gridMat = new T.LineBasicMaterial({ color: '#344456', transparent: true, opacity: 0.23 });
  for (let i = 0; i < gridPoints.length; i += 6) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(gridPoints.slice(i, i + 6), 3));
    scene.add(new T.Line(geometry, gridMat));
  }

  const base = new T.Mesh(new T.CylinderGeometry(1.95, 2.02, 0.08, 64), new T.MeshStandardMaterial({ color: '#293647', roughness: 0.92 }));
  base.position.y = 0.01; scene.add(base);
  const baseRing = new T.Mesh(new T.RingGeometry(2.02, 2.035, 80), new T.MeshBasicMaterial({ color: '#6b8399', transparent: true, opacity: 0.55 }));
  baseRing.rotation.x = -Math.PI / 2; baseRing.position.y = 0.011; scene.add(baseRing);
  const lampGeo = new T.RingGeometry(0.072, 0.11, 12);
  const offlineGeo = new T.RingGeometry(0.07, 0.1, 4);

  function rebuild(sim) {
    root.clear();
    for (const item of dynamic) item.dispose();
    dynamic.length = 0; clients.length = 0;
    const count = sim.eng.count;
    const columns = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const box = createHardware(sim.eng.box.id, sim.sc.box.enclosure);
      const scale = count === 1 ? 1 : count <= 4 ? 0.56 : 0.4;
      box.scale.setScalar(scale);
      const spacing = count <= 4 ? 1.5 : 1.08;
      box.position.set((i % columns - (columns - 1) / 2) * spacing, 0.07, (Math.floor(i / columns) - (Math.ceil(count / columns) - 1) / 2) * spacing);
      box.rotation.y = -0.25; root.add(box);
    }
    const total = sim.users.length;
    const allocation = sim.groups.map(g => Math.min(g.users.length, Math.max(1, Math.floor(MAX_DEVICES * g.users.length / Math.max(1, total)))));
    let spare = Math.min(total, MAX_DEVICES) - allocation.reduce((a, n) => a + n, 0);
    while (spare > 0) {
      for (let i = 0; i < allocation.length && spare; i++) if (allocation[i] < sim.groups[i].users.length) { allocation[i]++; spare--; }
    }
    shown = allocation.reduce((a, n) => a + n, 0);
    const rings = shown <= 12 ? [shown] : shown <= 36 ? [Math.min(14, shown), shown - 14] : [14, 22, shown - 36];
    let index = 0;
    sim.groups.forEach((g, gi) => {
      for (let j = 0; j < allocation[gi]; j++, index++) {
        let ring = 0, at = index;
        while (ring < rings.length - 1 && at >= rings[ring]) at -= rings[ring++];
        const a = at / rings[ring] * Math.PI * 2 + (ring % 2 ? 0.13 : 0);
        const r = 3 + ring * 1.3;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const model = createClient(g.client.id);
        model.position.set(x, 0.015, z); model.rotation.y = -0.2;
        model.scale.setScalar(g.def.client === 'speaker' ? 0.83 : 0.95);
        root.add(model);
        const lineGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(x * 0.34, 0.025, z * 0.34), new T.Vector3(x, 0.025, z)]);
        const lineMat = new T.LineDashedMaterial({ color: '#54728d', transparent: true, opacity: 0.19, dashSize: 0.1, gapSize: g.def.link === 'lan' ? 0 : 0.12 });
        const line = new T.Line(lineGeo, lineMat); line.computeLineDistances(); root.add(line);
        const lampMat = new T.MeshBasicMaterial({ color: '#6c7c8e', transparent: true, opacity: 0.9, side: T.DoubleSide });
        const lamp = new T.Mesh(lampGeo, lampMat); lamp.rotation.x = -Math.PI / 2; lamp.position.set(x, 0.02, z + 0.51); root.add(lamp);
        dynamic.push(lineGeo, lineMat, lampMat);
        clients.push({ user: g.users[Math.floor(j * g.users.length / allocation[gi])].id, x, z, lamp, line });
      }
    });
    lastSim = sim;
  }

  function positionCamera() {
    const aspect = width / Math.max(1, height);
    const extent = (shown > 36 ? 7 : shown > 12 ? 5.9 : 4.8) / zoom;
    camera.left = -extent * Math.max(1, aspect);
    camera.right = -camera.left;
    camera.top = extent / Math.min(1, aspect);
    camera.bottom = -camera.top;
    camera.position.set(Math.sin(angle) * Math.cos(elevation) * 20, Math.sin(elevation) * 20, Math.cos(angle) * Math.cos(elevation) * 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  function draw(sim, snap, force = false) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return shown;
    const changed = lastSim !== sim || width !== rect.width || height !== rect.height;
    const now = performance.now();
    if (!force && !changed && now - lastDraw < (reducedMotion.matches ? 200 : 33)) return shown;
    if (lastSim !== sim) rebuild(sim);
    if (width !== rect.width || height !== rect.height) { width = rect.width; height = rect.height; renderer.setSize(width, height, false); }
    positionCamera();
    lastSnap = snap; lastDraw = now;
    baseRing.material.color.set(sim.servers.some(s => s.busy) ? '#67d8e7' : '#6b8399');
    let particleCount = 0;
    const p = particleGeo.attributes.position.array, colors = particleGeo.attributes.color.array;
    clients.forEach((c, i) => {
      const s = snap.states[c.user];
      const color = stateColor(s);
      c.lamp.material.color.set(color);
      c.lamp.geometry = s === U.OFF ? offlineGeo : lampGeo;
      c.line.material.opacity = s === U.THINK || s === U.READ || s === U.OFF ? 0.12 : 0.5;
      c.line.material.color.set(color);
      if (s !== U.SEND && s !== U.DECODE && s !== U.RECV) return;
      const phase = reducedMotion.matches ? 0.6 : ((sim.t * 0.07 + i * 0.618) % 1);
      const t = s === U.SEND ? 1 - phase : phase;
      point.set(c.x * (0.34 + t * 0.66), 0.06, c.z * (0.34 + t * 0.66));
      point.toArray(p, particleCount * 3);
      c.lamp.material.color.toArray(colors, particleCount * 3);
      particleCount++;
    });
    particleGeo.setDrawRange(0, particleCount);
    particleGeo.attributes.position.needsUpdate = true; particleGeo.attributes.color.needsUpdate = true;
    renderer.render(scene, camera);
    return shown;
  }

  function control(action) {
    if (action === 'left') angle -= 0.25;
    else if (action === 'right') angle += 0.25;
    else if (action === 'in') zoom = Math.min(1.8, zoom + 0.15);
    else if (action === 'out') zoom = Math.max(0.7, zoom - 0.15);
    else if (action === 'up') elevation = Math.min(1.35, elevation + 0.1);
    else if (action === 'down') elevation = Math.max(0.4, elevation - 0.1);
    else { angle = 0.25; elevation = 0.86; zoom = 1; }
    if (lastSim) draw(lastSim, lastSnap, true);
  }
  let drag = null;
  canvas.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    drag = { x: ev.clientX, y: ev.clientY, angle, elevation };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', ev => {
    if (!drag) return;
    angle = drag.angle - (ev.clientX - drag.x) * 0.006;
    elevation = Math.max(0.4, Math.min(1.35, drag.elevation + (ev.clientY - drag.y) * 0.004));
    if (lastSim) draw(lastSim, lastSnap, true);
  });
  const release = () => { drag = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', ev => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const action = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', Home: 'reset' }[ev.key];
    if (action) { ev.preventDefault(); control(action); }
  });
  canvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); onLost(); });
  return { draw, control };
}

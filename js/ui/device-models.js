// Original, deliberately illustrative enclosure models. No product dimensions
// or simulation inputs come from this module. Shared geometry keeps crowds light.
import * as T from '../vendor/three/three.module.js';
import { hardwareArt } from './device-art.js';

const cache = new Map();
const materials = new Map();
function material(color, metalness = 0, roughness = 0.65) {
  const key = `${color}:${metalness}:${roughness}`;
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, metalness, roughness }));
  return materials.get(key);
}

function mesh(group, geo, mat, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

function block(group, w, h, d, color, x = 0, y = h / 2, z = 0, metal = 0.25) {
  return mesh(group, new T.BoxGeometry(w, h, d), material(color, metal), x, y, z);
}

function rounded(group, w, h, d, color, y = h / 2, radius = 0.12, metal = 0.35) {
  const r = Math.min(radius, w / 3, d / 3);
  const x = -w / 2, z = -d / 2;
  const s = new T.Shape();
  s.moveTo(x + r, z);
  s.lineTo(x + w - r, z); s.quadraticCurveTo(x + w, z, x + w, z + r);
  s.lineTo(x + w, z + d - r); s.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  s.lineTo(x + r, z + d); s.quadraticCurveTo(x, z + d, x, z + d - r);
  s.lineTo(x, z + r); s.quadraticCurveTo(x, z, x + r, z);
  const geo = new T.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 5 });
  geo.rotateX(-Math.PI / 2);
  return mesh(group, geo, material(color, metal, 0.44), 0, y - h / 2, 0);
}

function ports(g, front, y, count = 3, start = -0.65) {
  for (let i = 0; i < count; i++) {
    block(g, 0.2, 0.09, 0.025, '#171e25', start + i * 0.29, y, front, 0);
    block(g, 0.13, 0.025, 0.03, '#7b8a91', start + i * 0.29, y, front + 0.016);
  }
}

function led(g, x, y, z, color = '#87e6bf') {
  return mesh(g, new T.SphereGeometry(0.026, 8, 6), new T.MeshBasicMaterial({ color }), x, y, z);
}

function label(g, text, width, y, color = '#263136') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = color; c.font = '600 55px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 256, 64);
  const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace;
  const m = mesh(g, new T.PlaneGeometry(width, width / 4), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), 0, y, 0);
  m.rotation.x = -Math.PI / 2;
}

function vent(g, w, y, z, color = '#242a2d', count = 19) {
  for (let i = 0; i < count; i++) block(g, w / (count * 2.5), 0.3, 0.025, color, -w / 2 + w * (i + 0.5) / count, y, z, 0.1);
}

function fan(g, radius, x, y, z, color = '#a0b9bc') {
  mesh(g, new T.CircleGeometry(radius, 24), material('#17232d'), x, y, z);
  mesh(g, new T.RingGeometry(radius * 0.82, radius, 28), material(color, 0.4), x, y, z + 0.012);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    const blade = block(g, radius * 0.33, radius * 0.68, 0.018, '#647782', x + Math.sin(a) * radius * 0.4, y + Math.cos(a) * radius * 0.4, z + 0.02);
    blade.rotation.z = -a - 0.4;
  }
  mesh(g, new T.CircleGeometry(radius * 0.22, 12), material('#253743'), x, y, z + 0.035);
}

function laptop(pro) {
  const g = new T.Group(), w = pro ? 3.05 : 2.7, d = pro ? 1.95 : 1.75;
  const shell = pro ? '#8d979e' : '#4b6071', h = pro ? 0.18 : 0.1;
  rounded(g, w, h, d, shell, h / 2 + 0.06, 0.09, 0.65);
  block(g, w - 0.22, 0.025, d * 0.51, '#1e2934', 0, h + 0.075, -0.24, 0.05);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 12; col++) {
    block(g, (w - 0.65) / 12, 0.009, 0.095, '#53616b', -w / 2 + 0.29 + col * (w - 0.58) / 11, h + 0.093, -0.58 + row * 0.145, 0.15);
  }
  block(g, 0.64, 0.012, 0.06, '#71828d', 0, h + 0.1, 0.11);
  block(g, w * 0.34, 0.012, d * 0.23, pro ? '#a6b1b7' : '#738793', 0, h + 0.08, d * 0.31, 0.45);
  if (pro) for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
    for (let i = 0; i < 13; i++) block(g, 0.06, 0.012, 0.021, '#3a4853', x, h + 0.085, -0.6 + i * 0.055);
  }
  const lid = new T.Group(), screenH = pro ? 1.88 : 1.62;
  lid.position.set(0, h + 0.04, -d / 2 + 0.1); lid.rotation.x = -0.19; g.add(lid);
  const shellMesh = rounded(lid, w, 0.065, screenH, shell, 0, 0.09, 0.6);
  shellMesh.rotation.x = Math.PI / 2; shellMesh.position.y = screenH / 2; shellMesh.position.z = -0.03;
  block(lid, w - 0.12, screenH - 0.13, 0.015, '#142b40', 0, screenH / 2, 0.049, 0.05);
  block(lid, w - 0.15, 0.11, 0.007, '#31516a', 0, screenH - 0.11, 0.061, 0);
  block(lid, 0.28, 0.065, 0.012, '#18222c', 0, screenH - 0.04, 0.067);
  // An abstract local chat window, readable as an interface at thumbnail size.
  block(lid, w * 0.68, screenH * 0.66, 0.008, '#223d51', 0, screenH * 0.48, 0.064, 0);
  for (let i = 0; i < 5; i++) block(lid, w * (i % 2 ? 0.39 : 0.5), 0.025, 0.008, i === 0 ? '#82bca8' : '#688da4', -0.09, screenH * 0.67 - i * 0.14, 0.072, 0);
  block(lid, w * 0.54, 0.12, 0.008, '#385970', 0, screenH * 0.24, 0.072, 0);
  for (const z of [-0.48, -0.18]) block(g, 0.02, 0.045, 0.16, '#19232c', -w / 2 - 0.016, h / 2 + 0.06, z);
  return g;
}

function enclosure(id) {
  if (id.startsWith('laptop-')) return laptop(id === 'laptop-pro');
  const g = new T.Group();
  if (id === 'rack') {
    rounded(g, 3.25, 0.68, 2.25, '#76828b', 0.43, 0.045, 0.6);
    block(g, 3.42, 0.7, 0.06, '#34434e', 0, 0.43, 1.16);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      block(g, 0.57, 0.24, 0.05, '#192730', -1.12 + col * 0.65, 0.29 + row * 0.29, 1.21);
      block(g, 0.4, 0.025, 0.02, '#73858e', -1.12 + col * 0.65, 0.29 + row * 0.29, 1.245);
      led(g, -0.92 + col * 0.65, 0.35 + row * 0.29, 1.25);
    }
    for (const x of [-1.64, 1.64]) {
      block(g, 0.07, 0.43, 0.12, '#bec8cd', x, 0.43, 1.27, 0.6);
      block(g, 0.22, 0.78, 0.07, '#74858d', x * 1.11, 0.43, 1.13);
    }
    ports(g, 1.21, 0.34, 1, 1.42); label(g, 'LOCAL SERVER', 1.5, 0.8, '#293f4b');
    return g;
  }
  const sff = id === 'pc-sff', small = id === 'pc-small', full = id === 'pc-full';
  const w = sff ? 1.3 : small ? 1.25 : 1.45, h = sff ? 1.2 : small ? 1.9 : full ? 3.15 : 2.55, d = sff ? 2.05 : small ? 1.75 : 2.2;
  const color = sff ? '#b3bcb7' : small ? '#d0d4cf' : '#3f4c59';
  rounded(g, w, h, d, color, h / 2 + 0.12, 0.06, 0.4);
  for (const x of [-w / 2 + 0.14, w / 2 - 0.14]) for (const z of [-d / 2 + 0.18, d / 2 - 0.18]) {
    block(g, 0.15, 0.12, 0.21, '#1c2932', x, 0.075, z);
  }
  const front = d / 2 + 0.04;
  block(g, w - 0.12, h - 0.16, 0.03, '#1e2d36', 0, h / 2 + 0.1, front);
  if (sff) {
    for (let i = 0; i < 13; i++) block(g, w - 0.27, 0.022, 0.03, '#7f918e', 0, 0.25 + i * 0.065, front + 0.02);
    for (let i = 0; i < 12; i++) block(g, 0.03, 0.02, d - 0.3, '#4c605f', -w / 2 + 0.16 + i * 0.09, h + 0.15, 0);
  } else {
    const n = full ? 3 : 2, radius = small ? 0.39 : 0.48;
    for (let i = 0; i < n; i++) fan(g, radius, 0, 0.58 + i * (full ? 0.93 : small ? 0.77 : 1.05), front + 0.025, full ? '#c7ad7f' : '#97bdbd');
    if (small) for (let i = 0; i < 11; i++) block(g, 0.02, h - 0.4, 0.014, '#adbbb6', -0.48 + i * 0.096, h / 2 + 0.06, front + 0.07);
    // A recessed side window with a GPU and a cooler, rather than a flat decal.
    block(g, 0.035, h - 0.35, d - 0.27, '#172935', w / 2 + 0.012, h / 2 + 0.14, 0);
    block(g, 0.04, 0.22, d * 0.65, '#809591', w / 2 + 0.035, h * 0.38, -0.06);
    block(g, 0.05, 0.49, 0.48, '#667d87', w / 2 + 0.04, h * 0.68, -0.1);
    for (let i = 0; i < 6; i++) block(g, 0.058, 0.4, 0.027, '#abc0c7', w / 2 + 0.07, h * 0.68, -0.29 + i * 0.075);
    if (full) for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) block(g, 0.065, h - 0.2, 0.04, '#b49b76', x, h / 2 + 0.12, front + 0.06);
  }
  ports(g, front + 0.04, h - 0.02, 2, -0.3); led(g, 0.37, h - 0.02, front + 0.05);
  return g;
}

function hardware(id) {
  if (id.startsWith('laptop-') || id.startsWith('pc-') || id === 'rack') return enclosure(id);
  const g = new T.Group();
  if (id === 'pi5') {
    rounded(g, 2.2, 0.12, 1.55, '#2c7958', 0.13, 0.08, 0.05);
    block(g, 0.62, 0.15, 0.62, '#9ba6a9', -0.2, 0.27, -0.05, 0.6);
    for (let i = 0; i < 7; i++) block(g, 0.5, 0.16, 0.025, '#bec7ca', -0.2, 0.37, -0.28 + i * 0.075, 0.7);
    for (let i = 0; i < 3; i++) block(g, 0.42, 0.32, 0.42, '#bec5c7', -0.67 + i * 0.66, 0.27, 0.64, 0.6);
    block(g, 0.16, 0.16, 1.1, '#28302f', 0.95, 0.25, -0.12);
    for (let i = 0; i < 12; i++) block(g, 0.07, 0.07, 0.03, '#c9ad58', 0.95, 0.37, -0.59 + i * 0.09);
    led(g, -0.91, 0.2, 0.57);
    return g;
  }
  if (id === 'rtx-5090' || id === 'rtx-pro-6000' || id === 'custom') {
    const custom = id === 'custom';
    rounded(g, 1.25, 2.1, 1.65, '#343e4a', 1.12, 0.1);
    block(g, 0.045, 1.84, 1.4, '#18242e', 0.65, 1.12, 0, 0.1);
    block(g, 1.1, 1.9, 0.035, '#1b242d', 0, 1.13, 0.85);
    for (let j = 0; j < 2; j++) {
      const fan = mesh(g, new T.RingGeometry(0.29, 0.32, 28), material(custom ? '#869aa5' : '#a4ac78', 0.4), 0, 0.72 + j * 0.78, 0.873);
      mesh(g, new T.CircleGeometry(0.25, 24), material('#3e4a52'), 0, fan.position.y, 0.875);
      for (let i = 0; i < 5; i++) {
        const blade = block(g, 0.06, 0.4, 0.018, '#202a33', 0, fan.position.y, 0.892);
        blade.rotation.z = i * Math.PI / 5;
      }
    }
    ports(g, 0.88, 1.94, 2, -0.32); led(g, 0.37, 1.94, 0.883);
    label(g, custom ? 'CUSTOM' : 'RTX', 0.66, 2.2, '#c8d1d9');
    return g;
  }
  const silver = id === 'mac-studio' || id === 'mac-mini' || id === 'asus-gx10';
  const gold = id === 'dgx-spark';
  const thor = id === 'jetson-thor';
  const height = id === 'mac-studio' ? 1.05 : id === 'evo-x2' ? 1.12 : thor ? 0.9 : 0.64;
  const width = id === 'mac-mini' ? 1.95 : 2.5;
  rounded(g, width * 0.83, 0.1, width * 0.82, '#1a232b', 0.08, 0.18);
  rounded(g, width, height, width, gold ? '#b8a27b' : silver ? '#b8c0c6' : '#47525a', height / 2 + 0.15, 0.2, 0.55);
  if (gold || thor || id === 'evo-x2') {
    block(g, width - 0.22, height * 0.59, 0.03, '#24292c', 0, height * 0.47 + 0.1, width / 2 + 0.01);
    vent(g, width - 0.3, height * 0.47 + 0.1, width / 2 + 0.035, gold ? '#9c8e73' : '#727b7e', 31);
  } else ports(g, width / 2 + 0.03, height * 0.49 + 0.15, 2);
  led(g, width / 2 - 0.26, height * 0.49 + 0.15, width / 2 + 0.035);
  if (thor) {
    for (let i = 0; i < 15; i++) block(g, 0.05, 0.32, 1.85, '#252c31', -0.95 + i * 0.135, height + 0.28, 0);
  } else {
    label(g, gold ? 'NVIDIA' : id.startsWith('mac') ? 'studio' : id === 'asus-gx10' ? 'ASUS' : id === 'evo-x2' ? 'GMKtec' : 'AMD', width * 0.44, height + 0.18, silver ? '#627078' : gold ? '#3c3b30' : '#c2c8cb');
    if (id === 'ryzen-ai-halo') {
      block(g, width - 0.28, 0.025, 0.04, '#a579bc', 0, height + 0.18, -width / 2 + 0.17);
    }
  }
  return g;
}

function client(id) {
  const g = new T.Group();
  if (id === 'speaker') {
    mesh(g, new T.CylinderGeometry(0.28, 0.3, 0.64, 20), material('#77828f', 0.05, 0.95), 0, 0.35, 0);
    const ring = mesh(g, new T.RingGeometry(0.2, 0.26, 24), new T.MeshBasicMaterial({ color: '#7ce0dc' }), 0, 0.676, 0);
    ring.rotation.x = -Math.PI / 2;
    for (let j = 0; j < 5; j++) {
      const band = mesh(g, new T.CylinderGeometry(0.301, 0.301, 0.013, 20), material('#525e69'), 0, 0.1 + j * 0.105, 0);
      band.scale.z = 1;
    }
    return g;
  }
  if (id === 'browser' || id === 'ide') {
    rounded(g, 0.88, 0.045, 0.58, '#98a9b5', 0.055, 0.035);
    block(g, 0.65, 0.008, 0.26, '#3b4a5d', 0, 0.089, -0.075, 0.05);
    block(g, 0.2, 0.009, 0.1, '#6c8191', 0, 0.089, 0.16);
    const lid = new T.Group(); lid.position.set(0, 0.06, -0.25); lid.rotation.x = -0.19; g.add(lid);
    block(lid, 0.87, 0.57, 0.04, '#8ea1af', 0, 0.29, 0);
    block(lid, 0.78, 0.48, 0.008, '#192b3b', 0, 0.3, 0.025, 0);
    for (let i = 0; i < 5; i++) block(lid, 0.25 + (i % 3) * 0.12, 0.018, 0.008, id === 'ide' ? '#86bca1' : '#8facbd', -0.09, 0.43 - i * 0.067, 0.031, 0);
    return g;
  }
  const phone = id === 'phone', badge = id === 'badge';
  const w = phone ? 0.37 : badge ? 0.53 : 0.56;
  const d = phone ? 0.73 : badge ? 0.47 : 0.77;
  rounded(g, w, 0.055, d, badge ? '#d3d7ce' : '#3b4654', 0.07, 0.045, 0.05);
  block(g, w - 0.065, 0.006, d - 0.14, phone ? '#557991' : '#c9cec0', 0, 0.126, -0.015, 0);
  for (let i = 0; i < 5; i++) block(g, (w - 0.13) * (i % 3 === 2 ? 0.65 : 1), 0.004, 0.018, phone ? '#bddbe5' : '#6d7975', -0.01, 0.132, -d / 2 + 0.16 + i * 0.057, 0);
  if (badge) block(g, 0.12, 0.025, 0.055, '#74858a', 0, 0.135, -d / 2 + 0.01);
  else led(g, 0, 0.129, d / 2 - 0.055, '#a9b4ba');
  return g;
}

export function createHardware(id, enclosure = '') {
  const family = hardwareArt(id, enclosure), key = `box:${family}`;
  if (!cache.has(key)) cache.set(key, hardware(family));
  return cache.get(key).clone(true);
}

export function createClient(id) {
  const key = `client:${id}`;
  if (!cache.has(key)) cache.set(key, client(id));
  return cache.get(key).clone(true);
}

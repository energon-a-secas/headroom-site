// ── Runner ───────────────────────────────────────────────────
// Drives the live simulation (a requestAnimationFrame loop advancing
// simulated time at the chosen speed) and hands heavy batch jobs, the
// redline search and the box comparison, to a Web Worker.

import { state } from './state.js';
import { createSim } from './engine/sim.js';

const REPORT_EVERY_MS = 350;
const listeners = { frame: new Set(), report: new Set() };
let raf = 0, lastFrame = 0, lastReport = 0;

export const on = (ev, fn) => listeners[ev].add(fn);
const emit = (ev) => listeners[ev].forEach((fn) => fn());

/** Throw away the current run and start a fresh one from the scenario. */
export function rebuild() {
  state.sim = createSim(state.sc, { warmup: 60, sampleEvery: 10 });
  state.report = state.sim.report(Math.max(1, state.sim.t));
  emit('report');
  emit('frame');
}

function tick(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  state.sim.advance(state.sim.t + dt * state.speed);
  emit('frame');
  if (now - lastReport > REPORT_EVERY_MS) refreshReport(now);
  if (state.running) raf = requestAnimationFrame(tick);
}

function refreshReport(now = performance.now()) {
  lastReport = now;
  state.report = state.sim.report(Math.max(1, state.sim.t));
  emit('report');
}

export function play() {
  if (state.running) return;
  state.running = true;
  lastFrame = performance.now();
  raf = requestAnimationFrame(tick);
}

export function pause() {
  state.running = false;
  cancelAnimationFrame(raf);
  refreshReport();
}

/** Jump ahead without animating: the fastest way to an answer. */
export function skip(seconds = 1200) {
  state.sim.advance(state.sim.t + seconds);
  refreshReport();
  emit('frame');
}

/** Redraw the floor between frames (resize, tab switch) without advancing. */
export const redraw = () => emit('frame');

// ── Worker jobs ──
let worker = null;
let seq = 0;
const jobs = new Map();

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, type, data } = e.data;
      const job = jobs.get(id);
      if (!job) return;
      if (type === 'progress') job.onProgress?.(data);
      else if (type === 'done') { jobs.delete(id); job.resolve(data); }
      else if (type === 'error') { jobs.delete(id); job.reject(new Error(data)); }
    };
    worker.onerror = () => { worker = null; };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Run a batch job ('run' | 'redline' | 'compare') off the main thread.
 * Browsers without module workers fall back to running it here.
 */
export function runJob(kind, sc, opts = {}, onProgress) {
  const w = getWorker();
  const payload = JSON.parse(JSON.stringify(sc));
  if (!w) return fallback(kind, payload, opts, onProgress);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, kind, sc: payload, opts });
  });
}

async function fallback(kind, sc, opts, onProgress) {
  const { findRedline, compareBoxes, slim } = await import('./engine/batch.js');
  const { runScenario } = await import('./engine/sim.js');
  if (kind === 'run') return slim(runScenario(sc, opts));
  if (kind === 'redline') {
    const r = findRedline(sc, { ...opts, onProbe: onProgress });
    return { ...r, ok: r.ok ? slim(r.ok) : null, limit: r.limit ? slim(r.limit) : null };
  }
  return compareBoxes(sc, { ...opts, onRow: onProgress });
}

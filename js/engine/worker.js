// ── Worker ───────────────────────────────────────────────────
// Redline searches and box comparisons run dozens of simulations. They run
// here so the page stays responsive; progress streams back as it happens.

import { runScenario } from './sim.js';
import { findRedline, compareBoxes, slim } from './batch.js';

self.onmessage = (e) => {
  const { id, kind, sc, opts = {} } = e.data;
  const post = (type, data) => self.postMessage({ id, type, data });
  try {
    if (kind === 'run') {
      post('done', slim(runScenario(sc, opts)));
    } else if (kind === 'redline') {
      const res = findRedline(sc, { ...opts, onProbe: (p) => post('progress', p) });
      post('done', { ...res, ok: res.ok ? slim(res.ok) : null, limit: res.limit ? slim(res.limit) : null });
    } else if (kind === 'compare') {
      post('done', compareBoxes(sc, { ...opts, onRow: (row) => post('progress', row) }));
    }
  } catch (err) {
    post('error', String(err && err.stack || err));
  }
};

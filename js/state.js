// ── State ────────────────────────────────────────────────────
// One mutable object shared by every module. The scenario (`sc`) is the
// only thing persisted and shared: it round-trips through localStorage and
// through the URL hash, so a link reproduces the exact experiment.

import { DEFAULT_ECON } from './engine/report.js';
import { BOXES } from './data/hardware.js';
import { MODELS } from './data/models.js';
import { RUNTIMES } from './data/runtimes.js';
import { resolveEnclosure } from './data/enclosures.js';

const STORAGE_KEY = 'headroom:v1';
const PROGRESS_KEY = 'headroom:missions';

let _gid = 1;
export const newGroupId = () => `g${Date.now().toString(36)}${_gid++}`;

export function defaultScenario() {
  return {
    box: { id: 'dgx-spark', count: 1, mode: 'replica', custom: null },
    model: { id: 'gpt-oss-120b', quant: 'mxfp4', kv: 'f16', ctxCap: 0 },
    runtime: { id: 'vllm', overrides: {} },
    groups: [{ id: newGroupId(), persona: 'reader', count: 50, client: 'kindle', link: 'wifi', protocol: '', distanceKm: 0.015 }],
    econ: { ...DEFAULT_ECON },
    seed: 7,
  };
}

/** Crowd presets for the loadout's quick picks. */
export const CROWDS = {
  kindle: { label: '50 Kindle readers',
    note: 'Fifty readers ask about the page they are on. E-ink shows nothing until the answer is complete, so every token, hidden thinking included, counts against 20 seconds.', groups: [{ persona: 'reader', count: 50, client: 'kindle', link: 'wifi', distanceKm: 0.015 }] },
  family: { label: 'Family of five',
    note: 'Two parents, a student and two kitchen speakers. The speakers need their first word within 1.2 seconds while everyone else is using the box.', groups: [
    { persona: 'chat', count: 2, client: 'phone', link: 'wifi', distanceKm: 0.01 },
    { persona: 'student', count: 1, client: 'browser', link: 'wifi', distanceKm: 0.01, tweak: { burst: false, think: 60 } },
    { persona: 'voice', count: 2, client: 'speaker', link: 'wifiweak', distanceKm: 0.02 },
  ] },
  crew: { label: '6 coding agents',
    note: 'Six coding agents with a 7,000-token system prompt and contexts that grow all day. Check the context window and the KV cache before the speed.', groups: [{ persona: 'coder', count: 6, client: 'ide', link: 'lan', distanceKm: 0 }] },
  office: { label: 'Office of 50',
    note: 'Thirty-five people chatting and fifteen attaching documents to every question, all on office Wi-Fi.', groups: [
    { persona: 'chat', count: 35, client: 'browser', link: 'wifi', distanceKm: 0.02 },
    { persona: 'rag', count: 15, client: 'browser', link: 'wifi', distanceKm: 0.02 },
  ] },
  class: { label: 'Classroom of 30',
    note: 'Thirty students submit within twenty seconds of each other every five minutes. The burst decides, not the average.', groups: [{ persona: 'student', count: 30, client: 'browser', link: 'wifi', distanceKm: 0.02 }] },
  mesh: { label: 'LoRa hikers',
    note: 'Twelve hikers on a LoRa mesh up to 5 km out. The radio costs seconds per answer, so compact packets keep the channel free.', groups: [{ persona: 'chat', count: 12, client: 'badge', link: 'lora', protocol: 'mesh', distanceKm: 5,
    tweak: { output: 60, prefix: 200, history: false, think: 240, slo: { ttft: 0, tps: 0, e2e: 180 }, patience: 600 } }] },
  monorepo: { label: '3 agents, up to 100K tokens',
    note: 'Three agents whose conversations grow toward 100,000 tokens. At that depth every generated token rereads the whole KV cache, so KV bytes per token set the speed.', groups: [
    { persona: 'coder',  count: 3,  client: 'ide',  link: 'lan',  distanceKm: 0,  tweak: { prompt: 6000,  prefix: 12000,  output: 600,  turns: 14,  think: 6 } },
  ] },
  swarm: { label: '24 agents, 8 s steps',
    note: 'Twenty-four agents that never rest, each step writing 240 tokens (half of them hidden reasoning) within 8 seconds. Step speed at a full batch decides; memory size does not.', groups: [
    { persona: 'coder',  count: 24,  client: 'ide',  link: 'lan',  distanceKm: 0,  tweak: { prompt: 400,  prefix: 6000,  output: 120,  reason: 120,  turns: 30,  think: 3,  slo: { ttft: 0,  tps: 0,  e2e: 8 },  patience: 60 } },
  ] },
  dairy: { label: '120 barn controllers on one clock',
    note: 'One hundred and twenty barn controllers wake on the same minute, within 2 seconds of each other, and want an answer within 20. Spreading the timers helps more than a faster box.', groups: [
    { persona: 'home',  count: 120,  client: 'ide',  link: 'lan',  protocol: 'http',  distanceKm: 0.05,  tweak: { name: 'Barn controller',  burst: true,  burstEvery: 300,  burstSpread: 2,  slo: { ttft: 0,  tps: 0,  e2e: 20 },  patience: 20 } },
  ] },
  robots: { label: '40 warehouse robots',
    note: 'Forty robots each wait for a 250-token plan within 10 seconds. One stream\'s speed decides, and a second box adds streams, not speed.', groups: [
    { persona: 'home',  count: 40,  client: 'ide',  link: 'wifi',  protocol: 'http',  distanceKm: 0.02,  tweak: { prompt: 700,  prefix: 4000,  output: 250,  think: 240,  slo: { ttft: 0,  tps: 0,  e2e: 10 },  patience: 30 } },
  ] },
};

export const state = {
  tab: 'sandbox',
  setup: 'hardware',   // UI only; shared links carry the scenario, not open panels.
  setupExpanded: false,
  setupFilter: 'all',
  sc: defaultScenario(),
  speed: 20,            // simulated seconds per real second
  running: false,
  sim: null,
  report: null,
  mission: null,        // mission id while a mission's crowd is loaded
  progress: {},         // mission id -> best stars
  preset: null,         // crowd preset last loaded, for its note
  redline: { busy: false, result: null, probes: [] },
  compare: { busy: false, rows: [], redline: true, sort: 'redline' },
};

/** Merge a partial scenario over the defaults, dropping anything malformed. */
function sanitize(raw) {
  const d = defaultScenario();
  if (!raw || typeof raw !== 'object') return d;
  const sc = {
    box: { ...d.box, ...(raw.box || {}) },
    model: { ...d.model, ...(raw.model || {}) },
    runtime: { ...d.runtime, ...(raw.runtime || {}), overrides: { ...(raw.runtime?.overrides || {}) } },
    groups: Array.isArray(raw.groups) && raw.groups.length ? raw.groups.slice(0, 12).map((g) => ({
      id: newGroupId(), persona: 'chat', count: 1, client: 'browser', link: 'wifi', protocol: '', distanceKm: 0.01, ...g,
      count: Math.max(1, Math.min(5000, g.count | 0 || 1)),
    })) : d.groups,
    econ: { ...d.econ, ...(raw.econ || {}) },
    seed: raw.seed | 0 || 7,
  };
  sc.box.count = Math.max(1, Math.min(8, sc.box.count | 0 || 1));
  // A saved scenario can name a box, model or server that has since left the catalog.
  if (sc.box.id !== 'custom' && !BOXES.some((b) => b.id === sc.box.id)) sc.box = { ...d.box };
  sc.box.enclosure = resolveEnclosure(sc.box.id, sc.box.enclosure);
  if (!MODELS.some((m) => m.id === sc.model.id && !m.hidden)) sc.model = { ...d.model };
  if (!RUNTIMES.some((r) => r.id === sc.runtime.id)) sc.runtime = { ...d.runtime };
  return sc;
}

export function loadSaved(s) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      s.sc = sanitize(saved.sc);
      s.speed = saved.speed || s.speed;
    }
    s.progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {};
  } catch { /* private mode or corrupted: defaults stand */ }
  loadShared(s);
}

export function loadShared(s) {
  const fromHash = readHash();
  if (!fromHash) return false;
  s.sc = sanitize(fromHash); s.mission = null;
  return true;
}

export function save(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sc: s.sc, speed: s.speed }));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(s.progress));
  } catch { /* quota or private mode */ }
}

// ── Shareable links ──
const b64 = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));

export function shareUrl(sc) {
  const slim = { ...sc, groups: sc.groups.map(({ id, ...g }) => g) };
  return `${location.origin}${location.pathname}#s=${b64(JSON.stringify(slim))}`;
}

function readHash() {
  const m = location.hash.match(/[#&]s=([\w-]+)/);
  if (!m) return null;
  try { return JSON.parse(unb64(m[1])); } catch { return null; }
}

export const cloneScenario = (sc) => JSON.parse(JSON.stringify(sc));

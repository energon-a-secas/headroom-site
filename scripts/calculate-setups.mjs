// Run the same examples as the UI in Node; no browser, model downloads or API.
// node scripts/calculate-setups.mjs --help
import { readFile } from 'node:fs/promises';
import { LOCAL_SETUPS, createSetupScenario } from '../js/data/setups.js';
import { BOXES } from '../js/data/hardware.js';
import { MODELS, quantsFor, KV_DTYPES } from '../js/data/models.js';
import { RUNTIMES } from '../js/data/runtimes.js';
import { PERSONAS, CLIENTS, LINKS } from '../js/data/crowd.js';
import { runScenario } from '../js/engine/sim.js';
import { findRedline, scaleCrowd, slim } from '../js/engine/batch.js';

const HELP = `Calculate Headroom's local setup examples using the existing simulation.

  node scripts/calculate-setups.mjs [options]

  --list                List available setup IDs
  --setup ID            Select one setup (default: all)
  --scenario FILE       Read your own scenario JSON instead of a preset
  --duration SECONDS    Simulated time, 120–86400 (default: 1200)
  --users 1,2,4,8        Run each selected setup at these total user counts
  --redline MAX         Also search capacity, up to MAX users (1–5000)
  --help                Show this help

Output is JSON on stdout. Redirect it to a file to share with another model.
These are predictions from the catalog, not measurements of real hardware.
Enclosure shape and host OS labels do not add performance multipliers.
`;

function integer(raw, label, min, max) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return n;
}

function options(args) {
  const out = { setup: 'all', duration: 1200 };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help' || key === '--list') { out[key.slice(2)] = true; continue; }
    if (!['--setup', '--scenario', '--duration', '--users', '--redline'].includes(key)) throw new Error(`Unknown option: ${key}. Use --help.`);
    if (seen.has(key)) throw new Error(`Duplicate option: ${key}.`);
    seen.add(key);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}.`);
    out[key.slice(2)] = value;
  }
  if (seen.has('--setup') && out.scenario) throw new Error('Choose --setup or --scenario, not both.');
  out.duration = integer(out.duration, 'Duration', 120, 86400);
  if (out.users) out.users = [...new Set(out.users.split(',').map(v => integer(v, 'Users', 1, 5000)))];
  if (out.redline) out.redline = integer(out.redline, 'Redline maximum', 1, 5000);
  return out;
}

function validateScenario(sc) {
  if (!sc?.box || !sc.model || !sc.runtime || !Array.isArray(sc.groups) || !sc.groups.length || sc.groups.length > 12) {
    throw new Error('A scenario needs box, model, runtime and 1–12 groups. See js/data/setups.js.');
  }
  if (sc.box.id !== 'custom' && !BOXES.some(x => x.id === sc.box.id)) throw new Error(`Unknown box: ${sc.box.id}.`);
  if (!MODELS.some(x => x.id === sc.model.id)) throw new Error(`Unknown model: ${sc.model.id}.`);
  if (!quantsFor(MODELS.find(x => x.id === sc.model.id)).some(x => x.id === sc.model.quant)) throw new Error(`Unsupported weight precision: ${sc.model.quant}.`);
  if (!KV_DTYPES.some(x => x.id === sc.model.kv)) throw new Error(`Unknown KV precision: ${sc.model.kv}.`);
  if (!RUNTIMES.some(x => x.id === sc.runtime.id)) throw new Error(`Unknown runtime: ${sc.runtime.id}.`);
  integer(sc.box.count ?? 1, 'Box count', 1, 8);
  sc.groups.forEach(g => {
    integer(g.count, 'Group count', 1, 5000);
    for (const [field, catalog] of [['persona', PERSONAS], ['client', CLIENTS], ['link', LINKS]]) {
      if (!catalog.some(x => x.id === g[field])) throw new Error(`Unknown ${field}: ${g[field]}.`);
    }
  });
}

async function main() {
  const opt = options(process.argv.slice(2));
  if (opt.help) { console.log(HELP); return; }
  if (opt.list) { console.log(LOCAL_SETUPS.map(s => `${s.id}\t${s.os}\t${s.title}`).join('\n')); return; }
  const presets = opt.setup === 'all' ? LOCAL_SETUPS : LOCAL_SETUPS.filter(s => s.id === opt.setup);
  if (!opt.scenario && !presets.length) throw new Error(`Unknown setup: ${opt.setup}. Use --list.`);
  const scenarios = opt.scenario
    ? [{ id: 'custom-scenario', os: null, scenario: JSON.parse(await readFile(opt.scenario, 'utf8')) }]
    : presets.map(s => ({ id: s.id, os: s.os, scenario: createSetupScenario(s.id) }));
  const results = scenarios.map(({ id, os, scenario }) => {
    validateScenario(scenario);
    const counts = opt.users || [scenario.groups.reduce((n, g) => n + g.count, 0)];
    if (counts.some(n => n < scenario.groups.length)) throw new Error('Total users must be at least the number of groups.');
    const runs = counts.map(users => {
      const sc = scaleCrowd(scenario, users);
      return { users, report: slim(runScenario(sc, { duration: opt.duration })) };
    });
    let redline;
    if (opt.redline) {
      if (opt.redline < scenario.groups.length) throw new Error('Redline maximum must be at least the number of groups.');
      // The engine starts its search at the scenario's own count. Start at the
      // minimum valid crowd so this CLI's requested maximum is never exceeded.
      const result = findRedline(scaleCrowd(scenario, scenario.groups.length), { duration: opt.duration, max: opt.redline });
      redline = { users: result.users, capped: !!result.capped, reason: result.why || null, boxUsers: result.boxUsers ?? null, probes: result.probes };
    }
    return { id, hostOS: os, scenario, runs, ...(redline ? { redline } : {}) };
  });
  console.log(JSON.stringify({
    schemaVersion: 1, basis: 'Headroom catalog simulation; not measured hardware benchmarks',
    durationSeconds: opt.duration, warmupSeconds: 60, results,
  }, null, 2));
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });

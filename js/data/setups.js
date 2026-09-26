// Complete, editable simulation examples. OS labels describe the intended host;
// they are not a deployment compatibility test or an extra performance factor.
import { DEFAULT_ECON } from '../engine/report.js';
import { boxById } from './hardware.js';
import { enclosureFor } from './enclosures.js';

const group = (persona, count = 1, client = 'browser', link = 'local') => ({ persona, count, client, link, protocol: '', distanceKm: 0 });

export const LOCAL_SETUPS = [
  {
    id: 'mac-mini-chat', title: 'An assistant on your Mac', os: 'macos', category: 'Personal',
    description: 'Everyday questions, with the model and your browser on the same machine.',
    box: 'mac-mini-m5pro', model: 'qwen3-8b', runtime: 'ollama',
    overrides: { slots: 1, ctxPerSlot: 8192 }, groups: [group('chat')],
  },
  {
    id: 'mac-studio-code', title: 'A local coding companion', os: 'macos', category: 'Development',
    description: 'An IDE agent on a Mac Studio, with room for a longer coding conversation.',
    box: 'mac-m5max-128', model: 'qwen3-30b-a3b', runtime: 'llamacpp',
    overrides: { slots: 2, ctxPerSlot: 65536 }, groups: [group('coder', 1, 'ide')],
  },
  {
    id: 'mac-studio-docs', title: 'A shared document desk', os: 'macos', category: 'Documents',
    description: 'Four people asking questions about documents through a Mac Studio on the LAN.',
    box: 'mac-m5max-128', model: 'qwen3-30b-a3b', runtime: 'mlx',
    overrides: { slots: 4, ctxPerSlot: 16384 }, groups: [group('rag', 4, 'browser', 'lan')],
  },
  {
    id: 'mini-home', title: 'A mini PC for the household', os: 'linux', category: 'Home',
    description: 'A compact AMD box serving two chat clients over the home network.',
    box: 'evo-x2', model: 'qwen3-8b', runtime: 'llamacpp',
    overrides: { slots: 2, ctxPerSlot: 16384 }, groups: [{ ...group('chat', 2, 'phone', 'wifi'), distanceKm: 0.01 }],
  },
  {
    id: 'pc-code', title: 'A desktop for your agent', os: 'linux', category: 'Development',
    description: 'A GPU workstation running one coding agent, with a mid-tower enclosure.',
    box: 'rtx-5090', enclosure: 'pc-mid', model: 'qwen3-30b-a3b', runtime: 'llamacpp',
    overrides: { slots: 1, ctxPerSlot: 65536 }, groups: [group('coder', 1, 'ide')],
  },
  {
    id: 'workstation-docs', title: 'A team knowledge server', os: 'linux', category: 'Documents',
    description: 'A larger workstation answering document questions for six people on a wired network.',
    box: 'rtx-pro-6000', enclosure: 'pc-full', model: 'llama-3.3-70b', runtime: 'vllm',
    overrides: { maxBatch: 16 }, groups: [group('rag', 6, 'browser', 'lan')],
  },
  {
    id: 'spark-agents', title: 'A small team of agents', os: 'linux', category: 'Development',
    description: 'Four coding agents share a DGX Spark. Explore the queue as their contexts grow.',
    box: 'dgx-spark', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'vllm',
    overrides: { maxBatch: 16 }, groups: [group('coder', 4, 'ide', 'lan')],
  },
  {
    id: 'pi-batch', title: 'An overnight reading queue', os: 'linux', category: 'Batch work',
    description: 'A small CPU board summarizing documents one at a time, with no one waiting for live text.',
    box: 'pi5', model: 'llama-3.2-3b', runtime: 'llamacpp',
    overrides: { slots: 1, ctxPerSlot: 8192 }, groups: [group('batch')],
  },
];

export const setupById = id => LOCAL_SETUPS.find(s => s.id === id);

export function createSetupScenario(id, econ = DEFAULT_ECON) {
  const s = setupById(id);
  if (!s) return null;
  return {
    box: { id: s.box, count: 1, mode: 'replica', custom: null, enclosure: s.enclosure || '' },
    model: { id: s.model, quant: s.quant || 'q4', kv: 'f16', ctxCap: 0 },
    runtime: { id: s.runtime, overrides: { ...s.overrides } },
    groups: s.groups.map((g, i) => ({ ...g, id: `setup-${i}` })),
    econ: { ...econ }, seed: 7,
  };
}

// A chassis has no measured performance. Builders start with an explicitly
// identified catalog baseline and expose the existing custom-spec editor.
export function buildBaseline(id) {
  return boxById(id.startsWith('laptop-') ? 'mac-mini-m5pro'
    : id === 'pc-sff' ? 'evo-x2' : ['pc-full', 'rack'].includes(id) ? 'rtx-pro-6000' : 'rtx-5090');
}

export function createCustomBuild(id, econ = DEFAULT_ECON) {
  const shape = enclosureFor(id);
  if (!shape) return null;
  const base = buildBaseline(id);
  const sc = createSetupScenario('mac-mini-chat', econ);
  sc.box = { id: 'custom', count: 1, mode: 'replica', enclosure: id, custom: {
    ...JSON.parse(JSON.stringify(base)), id: 'custom', maker: 'Your build',
    name: `Custom ${shape.name.toLowerCase()}`, short: `Custom ${shape.name.toLowerCase()}`,
    chip: `Starter figures from ${base.short}`, status: 'custom', confidence: 'estimate', priceAsOf: '',
    priceNote: `Starter figures copied from ${base.name}. Update them for your own hardware; the enclosure does not define its specifications.`,
  } };
  sc.runtime = { id: 'llamacpp', overrides: { slots: 1, ctxPerSlot: 8192 } };
  return sc;
}

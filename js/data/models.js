// ── Model catalog ────────────────────────────────────────────
// Architecture facts come from each model's published config.json. They
// decide three things the simulator cares about:
//   1. weight bytes   (does it fit, and how much is read per token)
//   2. KV bytes/token (how many conversations fit beside the weights)
//   3. FLOPs/token    (how fast a long prompt is read in)
//
// Fields:
//   totalB / activeB  parameters in billions; equal for dense models
//   embedB            input-embedding params that are looked up, not read, per token
//   layers, qHeads, kvHeads, headDim   attention shape
//   attn.full         layers attending to the whole context
//   attn.sliding      layers attending to a fixed window (attn.window tokens)
//   stateMB           fixed per-sequence state (linear-attention layers)
//   kvBytesOverride   per-token KV bytes at 16-bit, for compressed schemes (MLA)
//   moe               { experts, topK }; the always-read shared part is derived in perf.js
//   bits              { shared, expert } for checkpoints shipped pre-quantized
//   tier              coarse capability guide, 1 (toy) to 5 (frontier-class open model)
//   reasons           { min }: the model always reasons before it answers, and even
//                     its lowest effort writes about `min` hidden tokens first.
//                     Hybrid models (Qwen3, GLM) are modelled with thinking off,
//                     as their instruct builds run; a persona tweak `reason` adds
//                     thinking tokens back.

export const MODELS = [
  {
    id: 'llama-3.2-3b', name: 'Llama 3.2 3B', maker: 'Meta',
    totalB: 3.21, activeB: 3.21, embedB: 0, layers: 28, qHeads: 24, kvHeads: 8, headDim: 128,
    attn: { full: 28, sliding: 0, window: 0 }, maxCtx: 131072, tier: 1.5,
    note: 'Tied embeddings. Small enough for a Raspberry Pi, not smart enough for much.',
  },
  {
    id: 'llama-3.1-8b', name: 'Llama 3.1 8B', maker: 'Meta',
    totalB: 8.03, activeB: 8.03, embedB: 0.53, layers: 32, qHeads: 32, kvHeads: 8, headDim: 128,
    attn: { full: 32, sliding: 0, window: 0 }, maxCtx: 131072, tier: 2,
    note: 'The reference small model. 128 KB of KV cache per token at 16-bit.',
  },
  {
    id: 'qwen3-8b', name: 'Qwen3 8B', maker: 'Alibaba',
    totalB: 8.19, activeB: 8.19, embedB: 0.62, layers: 36, qHeads: 32, kvHeads: 8, headDim: 128,
    attn: { full: 36, sliding: 0, window: 0 }, maxCtx: 131072, tier: 2.5,
    note: '32K native context, 128K with YaRN scaling.',
  },
  {
    id: 'gpt-oss-20b', name: 'gpt-oss-20b', maker: 'OpenAI',
    totalB: 20.9, activeB: 3.6, embedB: 0.58, layers: 24, qHeads: 64, kvHeads: 8, headDim: 64,
    attn: { full: 12, sliding: 12, window: 128 }, maxCtx: 131072, tier: 3,
    moe: { experts: 32, topK: 4 }, bits: { shared: 16, expert: 4.25 },
    quants: ['mxfp4'], reasons: { min: 60 },
    note: 'Ships in MXFP4 and always reasons before answering, about 60 tokens even at low effort. Half its layers use a 128-token sliding window, so KV stays small.',
  },
  {
    id: 'qwen3-30b-a3b', name: 'Qwen3 30B-A3B', maker: 'Alibaba',
    totalB: 30.5, activeB: 3.3, embedB: 0.31, layers: 48, qHeads: 32, kvHeads: 4, headDim: 128,
    attn: { full: 48, sliding: 0, window: 0 }, maxCtx: 262144, tier: 3,
    moe: { experts: 128, topK: 8 },
    note: 'Mixture of experts: 3.3B active per token, so it decodes like a small model.',
  },
  {
    id: 'mistral-small-24b', name: 'Mistral Small 3.2 24B', maker: 'Mistral',
    totalB: 24.0, activeB: 24.0, embedB: 0.67, layers: 40, qHeads: 32, kvHeads: 8, headDim: 128,
    attn: { full: 40, sliding: 0, window: 0 }, maxCtx: 131072, tier: 2.5,
    note: 'Dense 24B. Every token reads every weight.',
  },
  {
    id: 'gemma-3-27b', name: 'Gemma 3 27B', maker: 'Google',
    totalB: 27.4, activeB: 27.4, embedB: 0, layers: 62, qHeads: 32, kvHeads: 16, headDim: 128,
    attn: { full: 10, sliding: 52, window: 1024 }, maxCtx: 131072, tier: 3,
    note: 'Five local layers per global one: long contexts cost far less KV than the layer count suggests.',
  },
  {
    id: 'qwen3-32b', name: 'Qwen3 32B', maker: 'Alibaba',
    totalB: 32.8, activeB: 32.8, embedB: 0.78, layers: 64, qHeads: 64, kvHeads: 8, headDim: 128,
    attn: { full: 64, sliding: 0, window: 0 }, maxCtx: 131072, tier: 3.5,
    note: 'Dense 32B with 64 layers: 256 KB of KV per token at 16-bit.',
  },
  {
    id: 'llama-3.3-70b', name: 'Llama 3.3 70B', maker: 'Meta',
    totalB: 70.6, activeB: 70.6, embedB: 1.05, layers: 80, qHeads: 64, kvHeads: 8, headDim: 128,
    attn: { full: 80, sliding: 0, window: 0 }, maxCtx: 131072, tier: 3.5,
    note: 'The classic "does my box run 70B" test. Dense, so bandwidth sets the speed.',
  },
  {
    id: 'qwen3-next-80b', name: 'Qwen3-Next 80B-A3B', maker: 'Alibaba',
    totalB: 80.0, activeB: 3.0, embedB: 0.62, layers: 48, qHeads: 16, kvHeads: 2, headDim: 256,
    attn: { full: 12, sliding: 0, window: 0 }, stateMB: 36, maxCtx: 262144, tier: 4,
    moe: { experts: 512, topK: 10 },
    note: 'Hybrid: 36 linear-attention layers keep a fixed state, only 12 layers grow a KV cache.',
  },
  {
    id: 'glm-4.5-air', name: 'GLM-4.5-Air', maker: 'Z.ai',
    totalB: 106, activeB: 12, embedB: 0.62, layers: 46, qHeads: 96, kvHeads: 8, headDim: 128,
    attn: { full: 46, sliding: 0, window: 0 }, maxCtx: 131072, tier: 4,
    moe: { experts: 128, topK: 8 },
    note: '106B total, 12B active. A popular fit for 128 GB boxes at 4-bit.',
  },
  {
    id: 'llama-4-scout', name: 'Llama 4 Scout', maker: 'Meta',
    totalB: 109, activeB: 17, embedB: 1.03, layers: 48, qHeads: 40, kvHeads: 8, headDim: 128,
    attn: { full: 12, sliding: 36, window: 8192 }, maxCtx: 1048576, tier: 3,
    moe: { experts: 16, topK: 1 },
    note: 'Three of every four layers use 8K chunked attention.',
  },
  {
    id: 'gpt-oss-120b', name: 'gpt-oss-120b', maker: 'OpenAI',
    totalB: 116.8, activeB: 5.1, embedB: 0.58, layers: 36, qHeads: 64, kvHeads: 8, headDim: 64,
    attn: { full: 18, sliding: 18, window: 128 }, maxCtx: 131072, tier: 4,
    moe: { experts: 128, topK: 4 }, bits: { shared: 16, expert: 4.25 },
    quants: ['mxfp4'], reasons: { min: 60 },
    note: 'About 61 GB on disk, and it always reasons before answering. The model most 128 GB boxes are bought to run.',
  },
  {
    id: 'qwen3-235b-a22b', name: 'Qwen3 235B-A22B', maker: 'Alibaba',
    totalB: 235, activeB: 22, embedB: 0.62, layers: 94, qHeads: 64, kvHeads: 4, headDim: 128,
    attn: { full: 94, sliding: 0, window: 0 }, maxCtx: 131072, tier: 4.5,
    moe: { experts: 128, topK: 8 },
    note: 'Needs about 3 bits per weight to squeeze into 128 GB, with little room left for context.',
  },
  {
    id: 'deepseek-r1', name: 'DeepSeek R1 671B', maker: 'DeepSeek',
    totalB: 671, activeB: 37, embedB: 0.93, layers: 61, qHeads: 128, kvHeads: 1, headDim: 576,
    attn: { full: 61, sliding: 0, window: 0 }, kvBytesOverride: 70272, maxCtx: 131072, tier: 5,
    moe: { experts: 256, topK: 8 }, reasons: { min: 500 },
    note: 'Always thinks first, often for thousands of tokens. Multi-head latent attention compresses KV to 576 values per layer. Weights are the problem: 400 GB at 4-bit.',
  },
  // Calibration yardsticks: hidden from the picker, used by the Method tab.
  {
    id: 'llama-2-7b', name: 'Llama 2 7B', maker: 'Meta', hidden: true,
    totalB: 6.74, activeB: 6.74, embedB: 0.13, layers: 32, qHeads: 32, kvHeads: 32, headDim: 128,
    attn: { full: 32, sliding: 0, window: 0 }, maxCtx: 4096, tier: 1, note: 'The llama.cpp cross-platform yardstick.',
  },
  {
    id: 'qwen2.5-7b', name: 'Qwen2.5-Coder 7B', maker: 'Alibaba', hidden: true,
    totalB: 7.62, activeB: 7.62, embedB: 0.54, layers: 28, qHeads: 28, kvHeads: 4, headDim: 128,
    attn: { full: 28, sliding: 0, window: 0 }, maxCtx: 131072, tier: 2, note: 'Dense batching reference on DGX Spark.',
  },
];

// ── Quantization ─────────────────────────────────────────────
// bits: average stored bits per weight including block scales (GGUF K-quants
// mix precisions per tensor, so these are the published averages).
// tierLoss: how much a model's capability tier drops at this precision.
// compute: which tensor-core rate prompt processing can use when the runtime
// supports low-precision kernels on this hardware.
export const QUANTS = [
  { id: 'f16', label: 'BF16 / FP16', bits: 16, tierLoss: 0, compute: 'fp16' },
  { id: 'q8', label: 'Q8_0 / FP8', bits: 8.5, tierLoss: 0, compute: 'fp8' },
  { id: 'q6', label: 'Q6_K', bits: 6.56, tierLoss: 0, compute: 'fp16' },
  { id: 'q5', label: 'Q5_K_M', bits: 5.69, tierLoss: 0.05, compute: 'fp16' },
  { id: 'q4', label: 'Q4_K_M', bits: 4.85, tierLoss: 0.15, compute: 'fp4' },
  { id: 'mxfp4', label: 'MXFP4', bits: 4.25, tierLoss: 0, compute: 'fp4' },
  { id: 'q3', label: 'Q3_K_M', bits: 3.91, tierLoss: 0.45, compute: 'fp16' },
  { id: 'q2', label: 'Q2_K', bits: 2.96, tierLoss: 1.0, compute: 'fp16' },
  { id: 'q4_0', label: 'Q4_0', bits: 4.54, tierLoss: 0.2, compute: 'fp16', hidden: true },
];

export const KV_DTYPES = [
  { id: 'f16', label: 'FP16 KV', bytes: 2 },
  { id: 'q8', label: 'Q8 / FP8 KV', bytes: 1.0625 },
  { id: 'q4', label: 'Q4 KV', bytes: 0.5625 },
];

export const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[1];
export const quantById = (id) => QUANTS.find((q) => q.id === id) || QUANTS[4];
export const kvById = (id) => KV_DTYPES.find((k) => k.id === id) || KV_DTYPES[0];

/** Quant options a model accepts (pre-quantized checkpoints only ship one). */
export function quantsFor(model) {
  const ids = model.quants || QUANTS.filter((q) => q.id !== 'mxfp4' && !q.hidden).map((q) => q.id);
  return QUANTS.filter((q) => ids.includes(q.id));
}

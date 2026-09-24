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
//   moe               { experts, topK, layers? }; the always-read shared part is derived
//                     in perf.js; layers counts only the expert layers when some are dense
//   bits              { shared, expert } for checkpoints shipped pre-quantized
//   tier              coarse capability guide, 1 (toy) to 5 (frontier-class open model).
//                     Models added in September 2026 follow one line through the
//                     Artificial Analysis Intelligence Index without reasoning:
//                     tier = 2 + 0.3 x (index - 4), capped at 5. The older tiers were
//                     set by hand and sit within half a tier of that line, except
//                     DeepSeek R1, kept at 5 as the open frontier of its day. The cap
//                     hides real gaps: Qwen3.6 27B and GLM-4.7 both score far above R1.
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
    attn: { full: 36, sliding: 0, window: 0 }, maxCtx: 32768, tier: 2.5,
    note: '32K native context; 128K needs YaRN scaling switched on, which servers do not do by default.',
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
    attn: { full: 64, sliding: 0, window: 0 }, maxCtx: 32768, tier: 3.5,
    note: 'Dense 32B with 64 layers: 256 KB of KV per token at 16-bit. 32K native context, 128K only with YaRN switched on.',
  },
  {
    id: 'llama-3.3-70b', name: 'Llama 3.3 70B', maker: 'Meta',
    totalB: 70.6, activeB: 70.6, embedB: 1.05, layers: 80, qHeads: 64, kvHeads: 8, headDim: 128,
    attn: { full: 80, sliding: 0, window: 0 }, maxCtx: 131072, tier: 3.5,
    note: 'The classic "does my box run 70B" test. Dense, so bandwidth sets the speed.',
  },
  {
    id: 'qwen3-next-80b', name: 'Qwen3-Next 80B-A3B Instruct', maker: 'Alibaba',
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
    moe: { experts: 256, topK: 8, layers: 58 }, reasons: { min: 500 },
    note: 'Always thinks first, often for thousands of tokens. Multi-head latent attention compresses KV to 576 values per layer. Weights are the problem: 400 GB at 4-bit.',
  },
  // ── September 2026 generation ──
  // Hybrid models (Qwen3.5/3.6, GLM) think by default and are modelled with
  // thinking off, as the other hybrids are; MiniMax-M2.7 cannot switch it off.
  {
    id: 'gemma-4-12b', name: 'Gemma 4 12B', maker: 'Google',
    totalB: 11.95, activeB: 11.95, embedB: 0, layers: 48, qHeads: 16, kvHeads: 8, headDim: 256,
    attn: { full: 8, sliding: 40, window: 1024 }, kvBytesOverride: 8192, maxCtx: 262144, tier: 3.6,
    note: 'Dense 12B for 16 GB machines. Five of every six layers look back only 1,024 tokens, and the global layers share one key-value head.',
  },
  {
    id: 'gemma-4-26b-a4b', name: 'Gemma 4 26B-A4B', maker: 'Google',
    totalB: 25.2, activeB: 3.8, embedB: 0, layers: 30, qHeads: 16, kvHeads: 8, headDim: 256,
    attn: { full: 5, sliding: 25, window: 1024 }, kvBytesOverride: 10240, maxCtx: 262144, tier: 4.7,
    moe: { experts: 128, topK: 8 },
    note: 'Mixture of experts with 3.8B active: generates like a small model, answers like a big one of last year.',
  },
  {
    id: 'glm-4.7-flash', name: 'GLM-4.7-Flash', maker: 'Z.ai',
    totalB: 29.9, activeB: 3.6, embedB: 0.32, layers: 47, qHeads: 20, kvHeads: 1, headDim: 576,
    attn: { full: 47, sliding: 0, window: 0 }, kvBytesOverride: 54144, maxCtx: 202752, tier: 4.1,
    moe: { experts: 64, topK: 4, layers: 46 },
    note: 'Latent attention like DeepSeek: 576 values per layer per token of KV cache, whatever the head count.',
  },
  {
    id: 'qwen3.6-27b', name: 'Qwen3.6 27B', maker: 'Alibaba',
    totalB: 27.8, activeB: 27.8, embedB: 1.27, layers: 64, qHeads: 24, kvHeads: 4, headDim: 256,
    attn: { full: 16, sliding: 0, window: 0 }, stateMB: 75, maxCtx: 262144, tier: 5,
    note: 'Dense and hybrid: 48 of 64 layers use linear attention with a fixed state, so only 16 grow a KV cache. Scores above DeepSeek R1 on current benchmarks, and every token reads all 28B weights.',
  },
  {
    id: 'gemma-4-31b', name: 'Gemma 4 31B', maker: 'Google',
    totalB: 30.7, activeB: 30.7, embedB: 0, layers: 60, qHeads: 32, kvHeads: 16, headDim: 256,
    attn: { full: 10, sliding: 50, window: 1024 }, kvBytesOverride: 40960, maxCtx: 262144, tier: 5,
    note: 'Dense 31B. Fifty of its sixty layers look back only 1,024 tokens, so long contexts stay cheap; generation is bandwidth-bound like any dense model.',
  },
  {
    id: 'qwen3.6-35b-a3b', name: 'Qwen3.6 35B-A3B', maker: 'Alibaba',
    totalB: 35.95, activeB: 3.0, embedB: 0.51, layers: 40, qHeads: 16, kvHeads: 2, headDim: 256,
    attn: { full: 10, sliding: 0, window: 0 }, stateMB: 31, maxCtx: 262144, tier: 4.7,
    moe: { experts: 256, topK: 8 },
    note: 'The small hybrid: 3B active, linear attention in three of every four layers. Fits a 24 GB Mac at 3-bit.',
  },
  {
    id: 'nemotron-3-super', name: 'Nemotron 3 Super 120B-A12B', maker: 'NVIDIA',
    totalB: 120, activeB: 12, embedB: 0.54, layers: 88, qHeads: 32, kvHeads: 2, headDim: 128,
    attn: { full: 8, sliding: 0, window: 0 }, stateMB: 84, maxCtx: 262144, tier: 3.2,
    moe: { experts: 512, topK: 22, layers: 40 },
    note: 'Mamba-2 hybrid: only 8 of 88 layers keep a KV cache, so a million-token context is affordable. NVIDIA ships it in NVFP4 for DGX Spark.',
  },
  {
    id: 'qwen3.5-122b-a10b', name: 'Qwen3.5 122B-A10B', maker: 'Alibaba',
    totalB: 125.1, activeB: 10, embedB: 0.76, layers: 48, qHeads: 32, kvHeads: 2, headDim: 256,
    attn: { full: 12, sliding: 0, window: 0 }, stateMB: 75, maxCtx: 262144, tier: 4.1,
    moe: { experts: 256, topK: 8 },
    note: 'Hybrid mixture of experts sized for 128 GB boxes at 4 to 5 bits. The newer 27B dense scores higher.',
  },
  {
    id: 'minimax-m2.7', name: 'MiniMax-M2.7', maker: 'MiniMax',
    totalB: 229, activeB: 10.4, embedB: 0.61, layers: 62, qHeads: 48, kvHeads: 8, headDim: 128,
    attn: { full: 62, sliding: 0, window: 0 }, maxCtx: 196608, tier: 5,
    moe: { experts: 256, topK: 8 }, reasons: { min: 150 },
    note: 'An agent model that always thinks between steps (about 150 hidden tokens at least, an estimate). 229B total needs 3 bits to fit 128 GB.',
  },
  {
    id: 'glm-4.7', name: 'GLM-4.7', maker: 'Z.ai',
    totalB: 355, activeB: 32, embedB: 0.78, layers: 92, qHeads: 96, kvHeads: 8, headDim: 128,
    attn: { full: 92, sliding: 0, window: 0 }, maxCtx: 202752, tier: 5,
    moe: { experts: 160, topK: 8, layers: 89 },
    note: 'A frontier-class open model: 355B total, 32B active. Needs a 256 GB box at 4 bits or two linked boxes.',
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
// tierLoss: how much a model's capability tier drops at this precision, for a
// model of 10B active parameters or more; smaller ones lose up to twice that
// (tierOf() in perf.js).
// compute: which tensor-core rate prompt processing can use when the runtime
// supports low-precision kernels on this hardware.
export const QUANTS = [
  { id: 'f16', label: 'BF16 / FP16', bits: 16, tierLoss: 0, compute: 'fp16' },
  { id: 'q8', label: '8-bit (Q8_0, FP8)', bits: 8.5, tierLoss: 0, compute: 'fp8' },
  { id: 'q6', label: '6-bit (Q6_K)', bits: 6.56, tierLoss: 0, compute: 'fp16' },
  { id: 'q5', label: '5-bit (Q5_K_M)', bits: 5.69, tierLoss: 0.05, compute: 'fp16' },
  { id: 'q4', label: '4-bit (Q4_K_M, AWQ)', bits: 4.85, tierLoss: 0.15, compute: 'fp4' },
  { id: 'mxfp4', label: 'MXFP4', bits: 4.25, tierLoss: 0, compute: 'fp4' },
  { id: 'q3', label: '3-bit (Q3_K_M)', bits: 3.91, tierLoss: 0.45, compute: 'fp16' },
  { id: 'q2', label: '2-bit (Q2_K)', bits: 2.96, tierLoss: 1.0, compute: 'fp16' },
  { id: 'q4_0', label: 'Q4_0', bits: 4.54, tierLoss: 0.2, compute: 'fp16', hidden: true },
];

// tierLoss: an 8-bit KV cache is close to lossless; a 4-bit one measurably
// hurts long-context recall, so it costs a little capability.
export const KV_DTYPES = [
  { id: 'f16', label: 'FP16 KV', bytes: 2, tierLoss: 0 },
  { id: 'q8', label: 'Q8 / FP8 KV', bytes: 1.0625, tierLoss: 0 },
  { id: 'q4', label: 'Q4 KV', bytes: 0.5625, tierLoss: 0.1 },
];

export const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[1];
export const quantById = (id) => QUANTS.find((q) => q.id === id) || QUANTS[4];
export const kvById = (id) => KV_DTYPES.find((k) => k.id === id) || KV_DTYPES[0];

/** Quant options a model accepts (pre-quantized checkpoints only ship one). */
export function quantsFor(model) {
  const ids = model.quants || QUANTS.filter((q) => q.id !== 'mxfp4' && !q.hidden).map((q) => q.id);
  return QUANTS.filter((q) => ids.includes(q.id));
}

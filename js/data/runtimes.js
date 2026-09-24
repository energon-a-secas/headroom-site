// ── Inference runtimes ───────────────────────────────────────
// The same box and model behave very differently depending on the server
// that runs them. What matters to the simulator:
//
//   batching    'slots': a fixed number of parallel slots, each with its own
//               preallocated context (llama.cpp, Ollama, MLX). A request longer
//               than a slot's context fails.
//               'paged': KV cache is a shared pool handed out in blocks, so
//               concurrency is limited by memory, not by a slot count (vLLM,
//               SGLang, TensorRT-LLM).
//   bwEff       share of peak memory bandwidth a decode step achieves
//   computeEff  share of peak tensor throughput prompt processing achieves
//   stepMs      fixed cost per engine iteration (launches, sampling, Python)
//   perSeqMs    extra cost per sequence in a batched step (bookkeeping,
//               sampling, non-fused kernels); why 32 users are not 32x free
//   lowPrecision  can run prompt math in FP8/FP4 when the weights and the
//               hardware allow it; otherwise everything computes at FP16
//   platforms   which box platforms it runs on
//
// Efficiencies are calibrated against published benchmarks; the Method tab
// lists the comparison. Treat them as a starting point, then edit them.

export const RUNTIMES = [
  {
    id: 'llamacpp', name: 'llama.cpp server', batching: 'slots',
    slots: 4, ctxPerSlot: 16384, maxBatch: 4,
    bwEff: 0.85, computeEff: 0.5, stepMs: 1, perSeqMs: 0.45,
    prefixCache: true, chunk: 512, lowPrecision: false,
    platforms: ['cuda', 'rocm', 'metal', 'cpu'],
    blurb: 'Runs everywhere, quantized GGUF files, fast for one user. Parallel slots split a fixed context.',
  },
  {
    id: 'ollama', name: 'Ollama, one slot', batching: 'slots',
    slots: 1, ctxPerSlot: 8192, maxBatch: 1,
    bwEff: 0.72, computeEff: 0.45, stepMs: 4, perSeqMs: 0.6,
    prefixCache: true, chunk: 512, lowPrecision: false,
    platforms: ['cuda', 'rocm', 'metal', 'cpu'],
    blurb: 'The easy install, with one request served at a time and an 8K context. Everyone else queues.',
  },
  {
    id: 'vllm', name: 'vLLM', batching: 'paged',
    slots: 0, ctxPerSlot: 0, maxBatch: 128,
    bwEff: 0.74, computeEff: 0.55, stepMs: 10, perSeqMs: 0.08,
    prefixCache: true, chunk: 2048, lowPrecision: true,
    platforms: ['cuda', 'rocm'],
    blurb: 'Built for many users: paged KV cache, continuous batching, automatic prefix caching.',
  },
  {
    id: 'sglang', name: 'SGLang', batching: 'paged',
    slots: 0, ctxPerSlot: 0, maxBatch: 128,
    bwEff: 0.76, computeEff: 0.56, stepMs: 6, perSeqMs: 0.07,
    prefixCache: true, chunk: 2048, lowPrecision: true,
    platforms: ['cuda'],
    blurb: 'Like vLLM, with a radix-tree prefix cache that pays off when requests share a system prompt.',
  },
  {
    id: 'trtllm', name: 'TensorRT-LLM', batching: 'paged',
    slots: 0, ctxPerSlot: 0, maxBatch: 128,
    bwEff: 0.82, computeEff: 0.62, stepMs: 3, perSeqMs: 0.05,
    prefixCache: true, chunk: 2048, lowPrecision: true,
    platforms: ['cuda'],
    blurb: 'NVIDIA only and fiddly to build, but the most efficient kernels on Blackwell.',
  },
  {
    id: 'mlx', name: 'MLX server', batching: 'slots',
    slots: 4, ctxPerSlot: 16384, maxBatch: 4,
    bwEff: 0.85, computeEff: 0.5, stepMs: 1.5, perSeqMs: 0.5,
    prefixCache: true, chunk: 512, lowPrecision: false,
    platforms: ['metal'],
    blurb: 'Apple silicon native. Good single-user speed, modest batching.',
  },
];

export const runtimeById = (id) => RUNTIMES.find((r) => r.id === id) || RUNTIMES[0];

/** Runtimes that run on a platform, best-for-crowds first. */
export function runtimesFor(platform) {
  return RUNTIMES.filter((r) => r.platforms.includes(platform));
}

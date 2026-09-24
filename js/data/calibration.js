// ── Calibration points ───────────────────────────────────────
// Published benchmarks the efficiencies are tuned against. The Method tab
// shows each beside the model's own prediction, so a reader can see where
// the simulator is optimistic and where it is pessimistic.
//
// Single user:  tg = generation tok/s, pp = prompt tok/s, chunk = the
//               benchmark's micro-batch (llama-bench -ub), ctx = depth.
// Batched:      batch = concurrent streams, agg = total generated tok/s.
//
// Software moves these numbers by 50% or more within months, so every
// point carries its build or date.

const GG = 'https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md';
const G15013 = 'https://github.com/ggml-org/llama.cpp/discussions/15013';
const G4167 = 'https://github.com/ggml-org/llama.cpp/discussions/4167';
const KY = 'https://github.com/kyuz0/amd-strix-halo-toolboxes/blob/main/docs/results.json';
const LMSYS = 'https://www.lmsys.org/blog/2025-10-13-nvidia-dgx-spark/';
const DENDRO = 'https://dendro-logic.com/engineering/nvidia-dgx-spark-concurrency-benchmark/';
const JH = 'https://jetsonhacks.com/wp-content/uploads/2025/10/SparkThorLlamaBenchmarks.html';
const JG = 'https://github.com/geerlingguy/ai-benchmarks';
const LHL = 'https://github.com/lhl/strix-halo-testing/tree/main/llm-bench';

export const CALIBRATION = [
  // Llama 2 7B Q4_0: the one model every platform has been measured on.
  { box: 'dgx-spark', model: 'llama-2-7b', quant: 'q4_0', runtime: 'llamacpp', tg: 56.7, pp: 3661, chunk: 512, source: 'llama.cpp CUDA scoreboard, b6767', url: G15013 },
  { box: 'rtx-5090', model: 'llama-2-7b', quant: 'q4_0', runtime: 'llamacpp', tg: 300.4, pp: 14970, chunk: 512, source: 'llama.cpp CUDA scoreboard', url: G15013 },
  { box: 'rtx-pro-6000', model: 'llama-2-7b', quant: 'q4_0', runtime: 'llamacpp', tg: 281.1, pp: 16619, chunk: 512, source: 'llama.cpp CUDA scoreboard', url: G15013 },
  { box: 'ryzen-ai-halo', model: 'llama-2-7b', quant: 'q4_0', runtime: 'llamacpp', tg: 50.6, pp: 1545, chunk: 512, source: 'kyuz0, Strix Halo ROCm 7.2, 2026-05', url: KY },
  { box: 'mac-m5max-128', model: 'llama-2-7b', quant: 'q4_0', runtime: 'llamacpp', tg: 119.9, pp: 3220, chunk: 512, source: 'llama.cpp Apple scoreboard, M5 Max 40c', url: G4167 },
  { box: 'mac-mini-m5pro', model: 'llama-2-7b', quant: 'q4_0', runtime: 'llamacpp', tg: 66.3, pp: 1621, chunk: 512, source: 'llama.cpp Apple scoreboard, M5 Pro 20c', url: G4167 },
  { box: 'mac-m3u-512', model: 'llama-2-7b', quant: 'q4_0', runtime: 'llamacpp', tg: 92.1, pp: 1471, chunk: 512, source: 'llama.cpp Apple scoreboard, M3 Ultra 80c', url: G4167 },
  // The models people buy these boxes for.
  { box: 'dgx-spark', model: 'gpt-oss-20b', quant: 'mxfp4', runtime: 'llamacpp', tg: 83.4, pp: 4506, chunk: 2048, source: 'llama.cpp b7946, 2026-02', url: GG },
  { box: 'dgx-spark', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'llamacpp', tg: 58.7, pp: 2444, chunk: 2048, source: 'llama.cpp b7946, 2026-02', url: GG },
  { box: 'dgx-spark', model: 'qwen3-8b', quant: 'q4', runtime: 'llamacpp', tg: 43.7, pp: 3167, chunk: 512, source: 'DandinPower bench, 2025-12', url: 'https://github.com/DandinPower/llama.cpp_bench/blob/main/dgx_spark/report.md' },
  { box: 'dgx-spark', model: 'qwen3-30b-a3b', quant: 'q4', runtime: 'llamacpp', tg: 89.3, pp: 2541, chunk: 512, source: 'DandinPower bench, 2025-12', url: 'https://github.com/DandinPower/llama.cpp_bench/blob/main/dgx_spark/report.md' },
  { box: 'dgx-spark', model: 'qwen3-32b', quant: 'q4', runtime: 'llamacpp', tg: 10.7, pp: 762, chunk: 512, source: 'DandinPower bench, 2025-12', url: 'https://github.com/DandinPower/llama.cpp_bench/blob/main/dgx_spark/report.md' },
  { box: 'dgx-spark', model: 'llama-3.1-8b', quant: 'q8', runtime: 'sglang', tg: 20.5, pp: 7991, chunk: 2048, source: 'LMSYS review, SGLang FP8', url: LMSYS },
  { box: 'dgx-spark', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'vllm', tg: null, pp: 4892, chunk: 2048, source: 'NVIDIA forum, community CUTLASS vLLM builds, early 2026 (stock vLLM is slower)', url: 'https://forums.developer.nvidia.com/t/356651' },
  { box: 'dgx-spark', model: 'gpt-oss-20b', quant: 'mxfp4', runtime: 'ollama', tg: 49.7, pp: 2053, chunk: 512, source: 'LMSYS review, Ollama, 2025-10', url: LMSYS },
  { box: 'ryzen-ai-halo', model: 'gpt-oss-20b', quant: 'mxfp4', runtime: 'llamacpp', tg: 73.1, pp: 1787, chunk: 512, source: 'kyuz0 ROCm, 2026-05', url: KY },
  { box: 'ryzen-ai-halo', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'llamacpp', tg: 51.8, pp: 626, chunk: 512, source: 'kyuz0 ROCm, 2026-05', url: KY },
  { box: 'ryzen-ai-halo', model: 'llama-3.3-70b', quant: 'q4', runtime: 'llamacpp', tg: 4.75, pp: 94.7, chunk: 512, source: 'lhl, Framework, mid-2025', url: LHL },
  { box: 'ryzen-ai-halo', model: 'glm-4.5-air', quant: 'q4', runtime: 'llamacpp', tg: 23, pp: 178.5, chunk: 512, source: 'lhl, Framework, mid-2025', url: LHL },
  { box: 'jetson-thor', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'llamacpp', tg: 41.8, pp: 938, chunk: 2048, source: 'JetsonHacks, b6767, 2025-10', url: JH },
  { box: 'mac-m3u-512', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'llamacpp', tg: 70.8, pp: 864, chunk: 512, source: 'Hardware Corner, 2025-10', url: 'https://www.hardware-corner.net/first-dgx-spark-llm-benchmarks/' },
  { box: 'rtx-5090', model: 'gpt-oss-20b', quant: 'mxfp4', runtime: 'ollama', tg: 205, pp: 8519, chunk: 512, source: 'LMSYS review, Ollama', url: LMSYS },
  { box: 'pi5', model: 'llama-3.2-3b', quant: 'q4', runtime: 'ollama', tg: 4.88, pp: null, chunk: 512, source: 'Jeff Geerling ai-benchmarks, Ollama', url: JG },
];

export const BATCH_CALIBRATION = [
  { box: 'dgx-spark', model: 'gpt-oss-20b', quant: 'mxfp4', runtime: 'llamacpp', ctx: 512, points: [[1, 80.1], [8, 271.8], [32, 681.5]], source: 'llama-batched-bench b7946', url: GG },
  { box: 'dgx-spark', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'llamacpp', ctx: 512, points: [[1, 57.1], [8, 159.2], [32, 353.3]], source: 'llama-batched-bench b7946', url: GG },
  { box: 'dgx-spark', model: 'qwen3-30b-a3b', quant: 'q8', runtime: 'llamacpp', ctx: 512, points: [[1, 58.4], [8, 153.4], [32, 346.5]], source: 'llama-batched-bench b7946 (Qwen3-Coder-30B-A3B)', url: GG },
  { box: 'dgx-spark', model: 'qwen2.5-7b', quant: 'q8', runtime: 'llamacpp', ctx: 512, points: [[1, 29.1], [8, 194.2], [32, 589.2]], source: 'llama-batched-bench b7946', url: GG },
  { box: 'dgx-spark', model: 'gpt-oss-120b', quant: 'mxfp4', runtime: 'vllm', ctx: 1900, points: [[1, 33.5], [64, 373], [256, 863]], source: 'dendro-logic, vLLM 26.03, 2026-04', url: DENDRO },
  { box: 'dgx-spark', model: 'llama-3.1-8b', quant: 'q8', runtime: 'sglang', ctx: 1500, points: [[32, 368]], source: 'LMSYS review, SGLang FP8', url: LMSYS },
];

# Local setups: research and calculation handoff

Prepared 2026-09-26. Give this file to another model with access to the repository
and the web. The visual work is implemented; this is a separate research task.

## Ready-to-use task for the next model

Extend Headroom's verified local hardware and software catalog. Read `CLAUDE.md`,
`PRODUCT.md`, `DESIGN.md`, and `docs/research.md` first. Keep the zero-build site,
DOM-free engine, and existing UI. Start by returning a sourced research report
and proposed data changes. Do not treat the enclosure illustrations or starter
figures as product specifications. Do not change calibration efficiencies or
mission pars just to improve a result.

Work in this order:

1. Audit the eight examples in `js/data/setups.js`: verify exact hardware SKU,
   memory configuration, OS, runtime version, model revision, weight format,
   KV precision, context limit, and supported acceleration backend. The examples
   run in the simulator; that is not proof of a tested installation.
2. Research real profiles for MacBook Air and MacBook Pro, current Mac mini and
   Mac Studio configurations, Framework Desktop, other small AMD computers,
   and GPU desktops in compact, mini, mid, full-tower and rack enclosures.
   Use actual available products, recording region and date. Keep unknowns null.
3. Separate official specifications, measured results, estimates, and missing
   information. Record the exact primary URL next to every claim. Prefer
   manufacturer technical specifications, model cards, runtime documentation,
   and reproducible measurements published by the person who ran them.
4. Produce runnable scenario JSON and calculate the memory fit, concurrency,
   latency, throughput and economics with the existing engine. Compare its
   predictions with measurements; never relabel a prediction as a benchmark.
5. Propose narrowly scoped catalog and calibration changes with their evidence.
   Run the existing regressions and recompute mission pars only when an
   evidence-based price/performance change makes that necessary.

## What is already implemented

- Eight complete examples: Mac personal chat, Mac coding, Mac document Q&A,
  AMD mini PC at home, a GPU coding desktop, a larger document server, DGX Spark
  agents, and a Raspberry Pi overnight queue.
- macOS and Linux filters, one-click scenario loading, and editable settings.
- Seven additional original 3D enclosures: slim laptop, large laptop, small
  form factor, mini tower, mid tower, full tower, and rack server. The new PNGs
  come from those same procedural meshes. There are 24 thumbnails in total.
- Custom builds explicitly inherit a named catalog baseline. Both laptop
  illustrations initially copy the existing Mac mini profile; they are **not
  MacBook hardware profiles**. Users must enter their actual specifications.
- Enclosures persist in saved scenarios and shared links through
  `sc.box.enclosure`. They do not alter the engine's performance calculations.
- A first-visit welcome dialog, reopened through Quick start.

## Files and contracts

| File | Responsibility |
|---|---|
| `js/data/setups.js` | Examples, scenario factory, custom-build baselines |
| `js/data/enclosures.js` | Allowed visual families; no performance data |
| `js/ui/device-models.js` | Procedural geometry and cached mesh templates |
| `js/ui/device-art.js` | Hardware-family and thumbnail mapping |
| `scripts/render-device-art.mjs` | Regenerate PNGs after changing models |
| `js/data/hardware.js` | Memory, bandwidth, compute, power and price inputs |
| `js/data/models.js` | Architecture, weight and KV assumptions |
| `js/data/runtimes.js` | Backends, batching, context and efficiency assumptions |
| `js/data/calibration.js` | Measured comparison points |
| `js/engine/perf.js` | Weight/KV fit and roofline calculations |
| `js/engine/sim.js` | Request-level simulation |
| `js/engine/report.js` | Latency, verdict, utilization and economics |
| `scripts/calculate-setups.mjs` | Headless reports and user-count sweeps |

Factory entry points:

```js
import { createSetupScenario, createCustomBuild } from './js/data/setups.js';
const example = createSetupScenario('mac-studio-code');
const editable = createCustomBuild('laptop-slim');
```

Unknown IDs return null. The factories return fresh scenarios. The browser
assigns fresh group IDs when loading them. Operating system is descriptive
example metadata; there is currently no separate OS performance model.

## Primary starting points

These links identify where to verify facts; they do not certify the current
catalog or supply measured inference results for every configuration.

- Apple technical specifications: [Mac support](https://support.apple.com/mac)
  and [Mac mini specifications](https://support.apple.com/en-us/128108).
  Confirm exact generation and memory option before copying any figures.
- Framework: [Desktop announcement](https://frame.work/blog/introducing-the-framework-desktop)
  and [mechanical documentation repository](https://github.com/FrameworkComputer/Framework-Desktop).
  Inspect the license of each CAD asset before importing or redistributing it.
- PC case candidates: [Fractal Design case catalog](https://www.fractal-design.com/products/cases/)
  and [North XL support](https://support.fractal-design.com/support/solutions/articles/4000203875-north-xl).
  Research compact alternatives as well; do not assume a GPU fits from its name.
- [llama.cpp](https://github.com/ggml-org/llama.cpp) for actual build flags,
  supported models, Metal/Vulkan/CUDA support, server flags and `llama-bench`.
- [Ollama on macOS](https://docs.ollama.com/macos) for installation requirements.
  The page checked during this UI work specifies macOS 14 or newer and
  distinguishes Apple M-series GPU support from x86 CPU-only support.
- [MLX LM](https://github.com/ml-explore/mlx-lm) for model conversion, native
  quantization and serving. The UI's MLX example uses a generic 4-bit estimate;
  **GGUF Q4_K_M and MLX 4-bit weights are not interchangeable artifacts**.
- [vLLM GPU installation](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/)
  for the current OS, GPU and driver matrix. Pin the release and verify each
  platform/model/quantization combination independently.

Keep software requirements separate from inference measurements. An OS or
backend appearing in the simulator's dropdown does not prove that a particular
driver release, model artifact or instruction set works together.

## Evidence to collect for each real device

Return a machine-readable JSON or CSV table alongside a concise Markdown report:

| Field group | Required information |
|---|---|
| Identity | Manufacturer, exact SKU, release/status, region, checked date |
| Enclosure | Dimensions in mm, volume in litres, motherboard/PSU format, GPU clearance, cooling limits, source/license of any 3D assets |
| Memory | RAM and VRAM separately, unified vs discrete, OS reserve, measured usable allocation, sustained bandwidth |
| Compute | Accelerator, dense vs sparse and precision of quoted throughput, supported kernels |
| Software | OS/version, runtime/commit, backend, driver and toolchain versions |
| Model | Repository/revision, artifact checksum, quantization, weight size, KV dtype, supported context |
| Measurement | Input/output tokens, concurrency, warmup, sample count, prefix reuse, batch settings, power mode |
| Results | Prefill tok/s, decode tok/s, TTFT p50/p95, inter-token latency, total throughput, memory peak, wall power |
| Economics | Complete-system price, currency/date/tax assumptions, wall idle/load W, electricity rate |
| Evidence | Per-field primary URL, quoted units, measured/official/estimated status, derivation, uncertainty |

Important gaps to investigate:

- Laptop thermal throttling and battery/power modes versus a desktop using a
  related chip. Do not copy desktop sustained performance into a laptop profile.
- GPU VRAM versus system RAM: only count memory actually available to inference.
- macOS available GPU memory and runtime overhead; do not automatically assign
  all unified memory to weights and KV cache.
- Host RAM, processor, GPU, enclosure, PSU, cooling and storage costs for a
  complete PC; a GPU price alone is not the computer price.
- Runtime/model support for sparse, hybrid-attention and MoE architectures.
- GGUF block overhead versus MLX/native quantization, and KV cache precision.
- Real multi-GPU/model-split support and communication costs. A larger case
  does not create memory capacity, extra GPUs or additional serving replicas.
- Embedding, vector search, document parsing, speech and agent tools. The current
  request personas approximate attached context and fixed client processing;
  they do not implement those full pipelines.

## Run calculations without spending model tokens

These commands need Node, but no npm install, browser, AI model download or API
key. Run them from the repository root. JSON goes to stdout; use file redirection
to give the next model only the scenarios and results it needs.

```sh
# Discover the scenario IDs.
node scripts/calculate-setups.mjs --list

# Every example, 20 simulated minutes each, including the 60-second warmup.
node scripts/calculate-setups.mjs > /tmp/headroom-setups.json

# Sweep concurrency and search the capacity of a single example.
node scripts/calculate-setups.mjs --setup mac-studio-code --users 1,2,4,8 --redline 128 > /tmp/headroom-mac-code.json

# Load a scenario JSON with researched/custom hardware values.
node scripts/calculate-setups.mjs --scenario /tmp/my-scenario.json --users 1,4,8 --duration 1800 > /tmp/headroom-custom-results.json

# Verify the simulation and UI after implementing evidence-based changes.
make test
make serve
# In another terminal, with Playwright available:
node tests/ui.mjs
```

The report includes the input scenario, weights and KV memory, single-user
speed estimates, per-group latency percentiles, request failures, utilization,
power, and the existing economics model. `--users` scales the complete mix;
`--redline` uses the engine's 95% response-target criterion. A capped result is
a lower bound from the search, not a measured maximum. Inspect sample counts
before relying on percentiles from a small run.

Keep the following computations auditable:

- Weight memory = tensor payload + the actual quantization block metadata.
- KV memory = the model's attention layout × active context × concurrent
  sequences × KV dtype, including sliding-window/hybrid/stateful differences.
- Fit = usable accelerator memory minus weights, runtime overhead and KV cache.
- Decode/prefill = bandwidth and compute rooflines, then measured efficiency and
  serving overhead. Peak TFLOPS alone does not predict token throughput.
- Electricity = idle and busy wall power × time × local electricity rate.
- Amortization = complete-system price / ownership period. The current cloud
  comparison prices are editable assumptions, not a freshly researched quote.

Do not silently change these equations in the UI pass. Propose changes together
with a counterexample, reproducible benchmark, unit/precision explanation and
regression evidence.

## Optional follow-up: local installation and model delegation

The user would also like a tutorial for running locally and having a main model
delegate suitable work to smaller local models. This was explicitly optional;
there is no live agent orchestration or model installation in this UI change.

For a later implementation, propose:

1. One verified macOS path and one verified Linux path. Pin an OS/runtime/model
   combination, give exact installation and model-download commands, then a
   localhost health check and a short inference request. Explain disk and memory
   needs, and show how to stop the server. Recheck current docs before publishing.
2. A concrete workflow: a main model plans a task, sends a bounded document
   summary or extraction to a local worker, validates its structured response,
   and incorporates it into the final result. Label where data is sent and
   which provider, if any, charges for it.
3. A minimal adapter for the selected runtime's supported API, with timeouts,
   cancellation, bounded concurrency, context/token budgets and error handling.
   Treat retrieved documents and worker output as untrusted task data. Keep
   tool permissions explicit and review side effects before execution.
4. Distinguish sequential handoffs from parallel workers and multiple models
   sharing one GPU. Include main-model memory residency and model-switch/load
   costs. Headroom currently simulates one model per setup; calling a preset
   “agents” does not simulate a multi-model routing graph.
5. Add quality evaluation and task-level completion time to throughput and cost.
   Demonstrate with a small reproducible task before suggesting broad routing.

Expected deliverables: `docs/local-setup-research.md`, a sourced evidence table,
scenario JSON fixtures, calculation output, and a proposed implementation diff.
The installation/delegation tutorial can be delivered separately after those
combinations have been verified on real hardware.

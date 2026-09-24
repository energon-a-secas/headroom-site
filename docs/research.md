# Headroom research: local AI inference boxes under multi-user load

Researched 2026-09-23 for Headroom. The question: what hardware specs, measured throughput curves and model architecture facts does a browser simulator need so that its presets and calibration targets match what these boxes actually do in September 2026. Depth: deep (cross-checked where a second source existed). Constraint assumed: the simulator is a zero-build static site, so everything below is data for it to hold. Nothing here needs a dependency.

**Tags.** `O` = OFFICIAL (vendor spec or vendor-published number), `M` = MEASURED (reviewer, benchmark, or a live price listing I read), `E` = ESTIMATE (I derived it; the arithmetic is shown), `R` = RUMOR. `snip` = I read it only in a search snippet, not on the page itself (robots blocked the host or I didn't fetch it). Citation keys are listed in section 0.

---

## 1. The short answer

Use **memory bandwidth × an efficiency factor** for decode, **effective TFLOPS** for prefill, and **measured batching curves per architecture** for concurrency. Don't use peak specs. Calibrate on the llama.cpp numbers for DGX Spark and Strix Halo in section 2B, and store the llama.cpp build and date with every calibration point, because the same box and model moved by more than 50% in six months of software updates. The infographic is out of date on 4 of its 5 rows. DGX Spark launched at $3,999 and has cost $4,699 since February 2026. "AMD Ryzen AI Halo" is a real $3,999 box that shipped in July 2026. The ASUS GX10 is no longer anything like $2,999. "1 PFLOP" is sparse FP4 marketing: dense BF16 is about 100 to 213 TFLOPS depending on which benchmark you believe. "Microsoft RTX Spark, late 2025" is really NVIDIA's RTX Spark (N1X) platform, announced 2026-05-31 and shipping fall 2026, and Microsoft's product built on it is the Surface RTX Spark Dev Box, with no announced price. The 192GB class is AMD's Gorgon Halo, announced in 2026 with 160GB usable by the GPU and $7,000+ boxes (snip). Apple meanwhile replaced the comparison Macs with M5-generation machines between August and September 2026. A 2026 DRAM shortage drives prices, so every price preset needs a date.

---

## 0. Source index (every key used below)

| Key | URL | Read how |
|---|---|---|
| nv-spark | https://www.nvidia.com/en-us/products/workstations/dgx-spark/ | fetched |
| nv-spark-pr | https://nvidianews.nvidia.com/news/nvidia-dgx-spark-arrives-for-worlds-ai-developers | fetched |
| nv-price | https://forums.developer.nvidia.com/t/2-23-2026-price-change-announcement/361713 | fetched (NVIDIA staff post) |
| nv-mma | https://forums.developer.nvidia.com/t/detailed-compute-performance-metrics-for-dgx-spark/351993 | fetched |
| nv-blog | https://developer.nvidia.com/blog/how-nvidia-dgx-sparks-performance-enables-intensive-ai-tasks | fetched (2025-10-24) |
| reg-mamf | https://www.theregister.com/2025/12/25/amd_strix_halo_nvidia_spark/ | snip only (robots blocks ClaudeBot) |
| th-spark | https://www.tomshardware.com/pc-components/gpus/nvidia-dgx-spark-review/2 and /4 | fetched (2026-01-27) |
| th-halo | https://www.tomshardware.com/pc-components/gpus/embargo-mon-july-6-8am-pt-1100-edt-amd-ryzen-ai-halo-review | fetched (2026-07-06), pages 1, 2, 4 |
| jg-gb10 | https://github.com/geerlingguy/sbc-reviews/issues/92 | fetched (Dell Pro Max GB10, 2025-11) |
| jg-fw | https://github.com/geerlingguy/sbc-reviews/issues/80 | fetched (Framework Desktop) |
| jg-ai | https://github.com/geerlingguy/ai-benchmarks (README findings tables) | fetched |
| gg-spark | https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md | fetched (build b7946, 2026-02-05) |
| gg-spark-nov | https://github.com/ggml-org/llama.cpp/blob/15274c0c501727b782b37e81eb77e5edae55fffa/benches/dgx-spark/dgx-spark.md | fetched (2025-11-02 run) |
| gg-16578 | https://github.com/ggml-org/llama.cpp/discussions/16578 | fetched |
| gg-15013 | https://github.com/ggml-org/llama.cpp/discussions/15013 | fetched (CUDA scoreboard) |
| gg-4167 | https://github.com/ggml-org/llama.cpp/discussions/4167 | fetched (Apple silicon scoreboard) |
| lmsys1 | https://www.lmsys.org/blog/2025-10-13-nvidia-dgx-spark/ | fetched |
| lmsys2 | https://www.lmsys.org/blog/2025-11-03-gpt-oss-on-nvidia-dgx-spark/ | fetched |
| dendro | https://dendro-logic.com/engineering/nvidia-dgx-spark-concurrency-benchmark/ | fetched via WebFetch (2026-04-22) |
| muninn | https://ai-muninn.com/en/blog/dgx-spark-nvfp4-compression-not-compute | fetched (2026-05-30) |
| dandin | https://github.com/DandinPower/llama.cpp_bench/blob/main/dgx_spark/report.md | fetched (2025-12-05) |
| jh-thor | https://jetsonhacks.com/wp-content/uploads/2025/10/SparkThorLlamaBenchmarks.html | fetched (b6767, 2025-10-31) |
| hwc | https://www.hardware-corner.net/first-dgx-spark-llm-benchmarks/ | fetched (2025-10-15) |
| ky-lc | https://github.com/kyuz0/amd-strix-halo-toolboxes/blob/main/docs/results.json | fetched (run 2026-05-16, builds 9187/9193) |
| ky-halo | https://github.com/kyuz0/amd-strix-halo-toolboxes/blob/main/docs/ryzen-ai-halo-results.json | fetched (build 9927) |
| ky-vllm | https://github.com/kyuz0/amd-strix-halo-vllm-toolboxes (README + docs/results.json) | fetched |
| lhl | https://github.com/lhl/strix-halo-testing/tree/main/llm-bench | fetched (mid-2025, pre-production Framework) |
| shwiki | https://strixhalo.wiki/AI/llamacpp-performance/ | fetched |
| amd-vgm | https://www.amd.com/en/blogs/2025/amd-ryzen-ai-max-upgraded-run-up-to-128-billion-parameter-llms-lm-studio.html | fetched (2025-07-29) |
| tt-halo | https://www.tweaktown.com/news/112183/amds-ryzen-ai-halo-ai-mini-pc-launches-in-the-us-with-128gb-memory-and-a-dollars3999-price-tag/index.html | fetched (2026-06-14) |
| th-gorgon | https://www.tomshardware.com/pc-components/cpus/amd-ryzen-ai-max-400-gorgon-halo-packs-up-to-192gb-of-unified-memory-refreshed-apu-uses-zen-5-and-rdna-3-5-and-can-clock-up-to-5-2-ghz | fetched (2026-05-21) |
| gmk | https://www.gmktec.com/products/amd-ryzen%E2%84%A2-ai-max-395-evo-x2-ai-mini-pc | fetched (Shopify variant JSON, 2026-09-23) |
| fw-blog | https://frame.work/blog/updates-on-memory-pricing-and-navigating-the-volatile-memory-market | fetched (no prices in text) |
| th-fw | https://www.tomshardware.com/desktops/gaming-pcs/diy-pc-maker-framework-finally-succumbs-to-ram-apocalypse-is-raising-prices-on-its-desktops-now-starts-at-usd1-139-with-32gb-128gb-up-usd450 | snip |
| asus-shop | https://eshop.asus.com/us/ascent-gx10.html | fetched 2026-09-23 |
| gx10-snip | https://www.techradar.com/computing/hands-on-asus-ascent-gx10-mini-pc | snip |
| nv-rtxspark | https://nvidianews.nvidia.com/news/nvidia-microsoft-windows-pcs-agents-rtx-spark | fetched |
| wiki-rtxspark | https://en.wikipedia.org/wiki/Nvidia_RTX_Spark | fetched |
| ms-devbox | https://blogs.windows.com/devices/2026/06/02/building-the-next-generation-of-devices-for-developers-surface-rtx-spark-dev-box/ | fetched |
| apple-ms | https://www.apple.com/mac-studio/specs/ | fetched (M5 generation) |
| apple-ms25 | https://support.apple.com/en-us/122211 | fetched (Mac Studio 2025 specs) |
| apple-mm24 | https://support.apple.com/en-us/121555 | fetched (Mac mini 2024 specs) |
| apple-mm | https://www.apple.com/mac-mini/specs/ | fetched (M6 / M5 Pro) |
| apple-m5pr | https://www.apple.com/newsroom/2026/08/apple-introduces-new-mac-studio-with-m5-max-and-m5-ultra/ | fetched |
| apple-m3pr | https://www.apple.com/newsroom/2025/03/apple-unveils-new-mac-studio-the-most-powerful-mac-ever/ | fetched |
| apple-pwr | https://support.apple.com/en-us/102027 (Mac Studio), https://support.apple.com/en-us/103253 (Mac mini) | fetched (published 2026-09-21) |
| mr-0305 / mr-0505 | https://www.macrumors.com/2026/03/05/mac-studio-no-512gb-ram-upgrade/ , https://www.macrumors.com/2026/05/05/apple-mac-studio-mac-mini-ram-cuts/ | fetched |
| mr-m3u | https://www.macrumors.com/2025/03/05/maxed-out-m3-ultra-mac-studio-14099/ | snip |
| nv-thor | https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/ | fetched |
| thor-price | https://www.hackster.io/news/nvidia-tells-resellers-to-open-jetson-agx-thor-developer-kit-orders-at-3-499-06e8cbf52441 | snip |
| nv-rtxbw | https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf | fetched (Appendix A) |
| nv-pro6000 | https://www.nvidia.com/en-us/products/workstations/professional-desktop-gpus/rtx-pro-6000/ | fetched |
| vcp | https://videocardprices.com/card/nvidia-rtx-5090/ , https://videocardprices.com/card/nvidia-rtx-pro-6000-blackwell/ | fetched (prices "as of September 23, 2026") |
| pro-msrp | https://www.thundercompute.com/blog/nvidia-rtx-pro-6000-pricing | snip |
| rpi | https://www.raspberrypi.com/products/raspberry-pi-5/ ; price posts 2025-12-01, 2026-02-02, 2026-04-01 at https://www.raspberrypi.com/news/ | fetched |
| hf | `https://huggingface.co/<repo>/blob/main/config.json` + model card README (repos in Part C) | fetched |
| eink | https://www.waveshare.com/w/upload/c/c4/E-paper-mode-declaration.pdf (E Ink Corp mode spec, Table 1) | fetched |
| kwt / kua / mr-kindle | https://github.com/martin-at-ipal/kindle-web-tools , https://github.com/Tokisaki-Galaxy/kindle-modify-browserUA , https://www.mobileread.com/forums/showthread.php?t=357173 | fetched |

---

## 2A. Hardware

### Core table (what the simulator needs per box)

| Box | Memory | BW theoretical | Dense compute | GPU-allocatable | Power idle / LLM | Price launch -> now | Status |
|---|---|---|---|---|---|---|---|
| **NVIDIA DGX Spark** (GB10) | 128 GB LPDDR5x, 256-bit {O nv-spark}, 4266 MHz {M th-spark} | 273 GB/s {O nv-spark} | FP4: "1 PFLOP" is sparse {O nv-spark}; dense ~500 TF {E th-spark: half of sparse}; mmapeak FP4 427, FP8 214, BF16 213, TF32 53 TF {M nv-mma}; torch MAMF BF16 99.8 to 101, FP8 207.7 TF {M reg-mamf snip}. The two BF16 figures disagree 2× (section 4) | CUDA "Total global memory 119.7 GiB" {M nv-mma} | idle 35 W headless, 40 W with display {M th-spark}; 31.5 W idle, 38 W with 200G link up (Dell GB10) {M jg-gb10}; ~160 W wall under GPU load {M th-spark}; 122.8 W peak gpt-oss-20b, 138.4 W peak DeepSeek-R1-14B (Dell GB10, Ollama) {M jg-ai}; PSU 240 W, GB10 TDP 140 W {O nv-spark} | $3,999 at launch, orders from 2025-10-15 {O nv-spark-pr, nv-price}; MSRP $4,699 from week of 2026-02-23 {O nv-price} | shipping since Oct 2025 |
| **ASUS Ascent GX10** (GB10) | same GB10, 128 GB {O asus-shop} | 273 GB/s (same SoC) {E} | same as GB10 {E} | same as GB10 {E} | 180 W USB-C PD input {O asus-shop}; measured LLM power not found | ~$2,999 (1TB) at announcement {snip gx10-snip, secondary}; Amazon $3,099.99 (1TB) / $4,149.99 (4TB) in Jan 2026 {M snip gx10-snip}; ASUS eShop today: GX10-GG0010BN "Starting at $6,999.00", **out of stock** {M asus-shop} | shipping, US stock gone |
| **Dell Pro Max GB10** | same | 273 GB/s | same | same | 31.5 W idle, 127.1 W stress-ng max {M jg-gb10} | $3,998.99 as tested Nov 2025 {M jg-gb10} | shipping; current price not found |
| Other GB10 OEMs | same | | | | | HP ZGX Nano G1n ~$6,030; Acer Veriton GN100 $3,999 (4TB) {snip, secondary roundups, unverified} | |
| **AMD Ryzen AI Halo** (real product: AMD's own dev box, Ryzen AI Max+ 395) | 128 GB LPDDR5X-8000 {O tt-halo} | 256 GB/s {O tt-halo, th-halo}; ~215 GB/s measured GPU on Strix Halo {M lhl} | GPU FP16 ~59 TF theoretical "effective is much lower" {E lhl, third-party calc}; NPU 50 TOPS {O tt-halo} | Linux: 126,976 MiB reported as VRAM on the Halo box {M ky-halo}; Windows: VGM max 96 GB {O amd-vgm} | 240 W brick {M th-halo}; blowers audible at idle {M th-halo}; idle watts not published | $3,999 list, Windows 11 Pro or Linux same price {O tt-halo}; Newegg $4,699.99, Amazon $4,788.88, Walmart $4,999.99 on review page today {M th-halo price widget} | Micro Center in-store from ~2026-07-10 {M tt-halo} |
| Strix Halo boxes: **Framework Desktop** | 128 GB LPDDR5x-8000 {M lhl} | 256 GB/s | as above | Linux GTT set to 120,000 MB in a tested config {M lhl} | 12.5 W idle at wall, 154.7 W stress max {M jg-fw}; 133 W peak on Llama 3.2 3B GPU run {M jg-ai} | $1,999 (128GB) at launch -> $2,459 in Jan 2026 {snip th-fw}; further 128GB rises in Mar, Apr, May, Jun 2026 with no figures in the post {M fw-blog} | shipping; today's price not read (robots disallows `frame.work/us/`) |
| **GMKtec EVO-X2** | 128 GB LPDDR5X-8000 | 256 GB/s | as above | as above | no measurement found | $3,499.99 (128GB/1TB), $3,649.99 (128GB/2TB), 64GB $2,199.99; banner "Price increase coming soon" {M gmk, 2026-09-23} | in stock |
| **HP Z2 Mini G1a** (Max+ PRO 395) | 128 GB | 256 GB/s | as above | as above | not measured | list $4,781, B&H $3,342.65 {snip, secondary} | shipping |
| **NVIDIA RTX Spark** (the real "Microsoft RTX Spark") | up to 128 GB unified {O nv-rtxspark}; LPDDR5X 16-channel {M wiki-rtxspark} | **not published** | "up to 1 PFLOP FP4" {O nv-rtxspark} (sparse assumed, same wording as GB10) | unknown | N1X 675 TDP 45 to 80 W {M wiki-rtxspark, secondary}; Surface Dev Box "100-watt thermal envelope" {M wiki-rtxspark, not on Microsoft's page} | no prices announced {O nv-rtxspark, ms-devbox}; Surface Dev Box $3,000 to $3,500 {R snip biggo} | announced 2026-05-31; "fall 2026" {O}; October launch {snip Tom's/wccftech} |
| **192GB class: Ryzen AI Max PRO 400 "Gorgon Halo"** | up to 192 GB {O AMD via th-gorgon} | not stated; 256 GB/s if it keeps the 256-bit LPDDR5X-8000 {E, unverified} | Zen 5 + RDNA 3.5 again, 495 = 40 CU "8065S", 490/485 = 32 CU {O th-gorgon} | up to **160 GB as VRAM, 32 GB reserved** {O th-gorgon} | unknown | 192GB boxes $7,500 to $8,000 / Minisforum EUR 7,000+ {R snip guru3d, videocardz} | partner systems "starting in Q3 2026" {O AMD quote in th-gorgon} |
| **Mac Studio M3 Ultra** | 96 GB base; offered up to 512 GB at launch {O apple-m3pr} | 819 GB/s {O apple-ms25} | Apple publishes no TFLOPS | macOS default GPU wired limit ~75%, raisable with `sysctl iogpu.wired_limit_mb` {M community; see Part A notes} | 9 W idle, 270 W max (512GB config) {O apple-pwr}; 227 W peak gpt-oss-20b, 261.8 W peak DeepSeek R1 671B {M jg-ai} | $3,999 base, 512 GB from $9,499 {snip mr-m3u}; 512 GB removed Mar 2026, 256 GB upgrade $1,600 -> $2,000 {M mr-0305}; 256 GB removed May 2026, 96 GB only {M mr-0505} | **superseded** by M5 Ultra (2026-08-25) {O apple-m5pr} |
| Mac Studio M5 Ultra (successor) | 96 GB base, 256 or 512 GB {O apple-ms} | 1.2 TB/s {O apple-ms} | "up to 4x faster LLM prompt processing than M3 Ultra" {O apple-m5pr} | as above | 9 W idle, 385 W max (512GB) {O apple-pwr} | from $5,499 {O apple-m5pr} | ships 2026-09-22; 512 GB "late October" {O apple-m5pr} |
| **Mac Studio M4 Max 128GB** | 128 GB needs the 16-core CPU / 40-core GPU chip {O apple-ms25} | 546 GB/s {O apple-ms25} | none published | as above | 6 W idle / 145 W max for the 36GB base config; the 128GB config is not listed {O apple-pwr} | price not determined | superseded by M5 Max (614 GB/s, up to 128 GB, from $2,499) {O apple-ms, apple-m5pr} |
| **Mac mini M4 Pro 64GB** | 64 GB {O apple-mm24} | 273 GB/s {O apple-mm24} | none published | as above | 5 W idle, 140 W max (64GB) {O apple-pwr} | 64 GB option removed May 2026, M4 Pro max 48 GB {M mr-0505} | superseded by M5 Pro (307 GB/s, up to 64 GB) {O apple-mm} |
| **Jetson AGX Thor** dev kit | 128 GB 256-bit LPDDR5X {O nv-thor} | 273 GB/s {O nv-thor} | 2,070 FP4 TFLOPS **sparse** {O nv-thor}; ~1,035 dense {E, half} | not found | module 40 to 130 W {O nv-thor} | $3,499 {snip thor-price} | GA Aug 2025 {snip thor-price} |
| **RTX 5090** desktop | 32 GB GDDR7, 512-bit {O nv-rtxbw} | 1,792 GB/s {O nv-rtxbw} | dense: BF16 (FP32 acc) 209.5, FP16 (FP16 acc) 419, FP8 (FP32 acc) 419, FP8 (FP16 acc) 838, FP4 1,676 TF; sparse doubles each {O nv-rtxbw} | 32 GB less driver/display reserve | TGP 575 W {O nv-rtxbw}; host idle depends on the PC | MSRP $1,999; Amazon new $6,699, eBay used $5,000; 90-day low $4,199.99 {M vcp} | shipping |
| **RTX PRO 6000 Blackwell** (Workstation) | 96 GB GDDR7 ECC {O nv-pro6000} | 1,792 GB/s {O nv-pro6000} | 4,000 FP4 TOPS **sparse**, FP32 125 TF {O nv-pro6000}; dense FP4 2,000, FP8 ~1,000, BF16 ~500 {E halving chain, assumes full-rate FP32 accumulate on pro cards, unverified} | 96 GB | 600 W max {O nv-pro6000} | MSRP $8,565 {snip pro-msrp}; Amazon $15,929.99 {M vcp} | shipping |
| **Raspberry Pi 5 16GB** | LPDDR4X-4267 {O rpi} | ~17 GB/s {E 4267 MT/s × 4 B, assumes 32-bit bus, unverified} | CPU only (4× Cortex-A76 2.4 GHz) {O rpi} | shared | 11.9 to 13.0 W during CPU LLM runs {M jg-ai} | $120 -> $145 (2025-12-01) -> +$60 (2026-02-02) -> +$100 (2026-04-01) {O rpi posts}; = $305 now {E cumulative} | shipping |

### Connectivity and multi-box linking

| Box | Ports {source} | Linking two (or more) units, and what it really delivers |
|---|---|---|
| DGX Spark | 10GbE RJ-45, ConnectX-7 @ 200 Gbps (QSFP), Wi-Fi 7, BT 5.4, 4× USB-C {O nv-spark} | NVIDIA now says "up to 4 DGX Spark systems for 700 billion parameter models" {O nv-spark}. Measured CX-7 iperf3: 106 Gbps one way, 86 Gbps each way bidirectional; both ports active gives ~100G each, not 400G; each port is PCIe Gen5 x4 {M jg-gb10}. Qwen3-235B NVFP4 across two Sparks: 11.73 tok/s decode {O nv-blog} |
| ASUS GX10 | 3× USB-C 20 Gbps (DP 2.1), 1× USB-C PD in, 10GbE, ConnectX-7, Wi-Fi 7 {O asus-shop} | "dual GX10 system stacking" {O asus-shop} |
| Ryzen AI Halo | 10GbE, Wi-Fi 7, BT 5.4, 4× USB-C, HDMI 2.1b {O tt-halo}; of the USB-C, 2 are USB4 and 1 is power in {M th-halo} | no vendor clustering story found |
| Framework Desktop | 5GbE (4.71 Gbps iperf3) {M jg-fw}; USB4/TB networking capped at ~10 Gbps (9.40 Gbps bidir) {M jg-fw} | 4-node llama.cpp RPC cluster over 2.5/5 GbE {M jg-fw issue #21 link}; vLLM TP=2 across two Strix Halo hosts over RoCE with an Intel E810 NIC: Llama 3.1 8B 388 -> 712 tok/s peak {M ky-vllm} |
| GMKtec EVO-X2 | 2.5GbE (Realtek 8125BG), USB4 {O gmk} | as Framework (USB4 / Ethernet) |
| Mac Studio M5 / M3 Ultra | 10GbE, Thunderbolt 5 (120 Gb/s), 4 rear + 2 front TB5 on Ultra {O apple-ms, apple-ms25} | M5 generation: "cluster multiple Mac Studio systems ... Thunderbolt 5 and RDMA" {O apple-m5pr}; whether M3 Ultra supports the same RDMA path: not verified |
| Mac mini M4 Pro | 3× TB5, Gigabit (10GbE optional) {O apple-mm24} | same TB5 caveat |
| Jetson Thor | 5GbE RJ45 + QSFP28 (4×25GbE) {O nv-thor} | not studied |
| Pi 5 | Gigabit Ethernet, 802.11ac {O rpi} | n/a |

### Notes that don't fit the tables

- **macOS GPU memory cap.** The default is "about 75%" of unified memory in community write-ups, but it varies. Logged `recommendedMaxWorkingSetSize` was 55,662.79 MB on an M4 Max 64GB {M gg-16578}, which is about 81% if MB means 10^6 bytes {E}, and 12.7 GB on a 16GB M5 {M gg-4167}, about 74% {E}. So model the cap as a per-config value, not a flat 75%.
- **Strix Halo memory.** On Windows the GPU gets a fixed VGM carve-out of at most 96 GB {O amd-vgm}. On Linux GTT is dynamic: 120 GB is a tested setting {M lhl}, and ~124 GiB was reported on the Halo box {M ky-halo}. Gorgon Halo raises the GPU cap to 160 GB {O th-gorgon}.
- **GB10 runtimes.** GB10 is SM121, not SM120, and some FP4 kernels needed older stacks. Single-stream decode of Qwen3-8B: FP8 25.65 tok/s, NVFP4 W4A4 38.59, NVFP4 W4A16 40.85 (vLLM). The gain comes from bandwidth, not the FP4 cores {M muninn}.
- **RTX Spark variants** {M wiki-rtxspark, snip}. N1X 675: 20 cores / 6,144 CUDA cores / up to 128 GB. N1X 650: 18 cores / 5,120 CUDA cores. Laptop memory is "up to 64GB" in one source and "up to 32GB" in wccftech (snip). NVIDIA claims "120-billion-parameter large language models with 1 million tokens context" {O nv-rtxspark}.

---

## 2B. Measured inference (calibration set)

Conventions. `pp` = prompt tokens/s, `tg` = generated tokens/s for one stream. For llama-batched-bench, "aggregate" is S_TG: total generated tokens/s across B streams, measured after each stream's prompt (PP tokens) is already cached. Per-user speed = aggregate / B {E}.

### Cross-box common yardstick: Llama 2 7B Q4_0 (3.56 GiB), llama-bench pp512 / tg128

| Box | pp512 | tg128 | Source | Effective BW = tg × 3.823 GB {E} | Effective prefill TFLOPS = 2 × 6.74e9 × pp {E} |
|---|---|---|---|---|---|
| RTX PRO 6000 | 16,619 | 281.1 | {M gg-15013, FA on} | 1,075 GB/s = 60% of 1,792 | 224 |
| RTX 5090 | 14,970 | 300.4 | {M gg-15013, FA on} | 1,148 = 64% | 202 |
| DGX Spark | 3,661 | 56.7 | {M gg-15013, b6767} | 217 = 79% | 49 |
| Apple M5 Max 40c | 3,220 | 119.9 | {M gg-4167} | 458 = 75% of 614 | 43 |
| Apple M5 Pro 20c | 1,621 | 66.3 | {M gg-4167} | 254 = 83% of 307 | 22 |
| Strix Halo ROCm 7.2.3 | 1,545 | 50.6 | {M ky-lc, 2026-05} | 193 = 76% of 256 | 21 |
| Strix Halo Vulkan RADV | 1,338 | 55.7 | {M ky-lc} | 213 = 83% | 18 |
| M3 Ultra 80c | 1,471 | 92.1 | {M gg-4167} | 352 = **43%** of 819 | 20 |
| M4 Max 40c | 886 | 83.1 | {M gg-4167} | 318 = 58% of 546 | 12 |
| M4 Pro 20c | 440 | 50.7 | {M gg-4167} | 194 = 71% of 273 | 6 |

The effective-BW column assumes weights dominate traffic at 128 tokens of context, and the prefill column ignores attention FLOPs. Both are simplifications I made. Ultra-class Apple chips and discrete GPUs use a lower fraction of their theoretical bandwidth on small models.

### Priority models

| Box | Runtime (build/date) | Model | Quant | pp tok/s | tg tok/s | Concurrency -> aggregate tg tok/s | Source |
|---|---|---|---|---|---|---|---|
| DGX Spark | llama.cpp b7946, 2026-02-05 | gpt-oss-20b | MXFP4 | 4,506 (pp2048); 2,689 @32k depth | 83.4 (tg32); 61.7 @32k | B1 80.1 / B8 271.8 / B32 681.5 (512-token prompts); B32 473.6 at 4k, 390.9 at 8k | {M gg-spark} |
| DGX Spark | same | gpt-oss-120b | MXFP4 | 2,444; 1,567 @32k | 58.7; 42.8 @32k | B1 57.1 / B8 159.2 / B32 353.3 (512); B32 262.2 at 4k | {M gg-spark} |
| DGX Spark | same | Qwen3-Coder-30B-A3B | Q8_0 | 2,987; 1,348 @32k | 61.1; 30.2 @32k | B1 58.4 / B8 153.4 / B32 346.5 (512) | {M gg-spark} |
| DGX Spark | same | Qwen2.5-Coder-7B (dense stand-in for Llama 3.1 8B) | Q8_0 | 2,250 | 29.4 | B1 29.1 / B8 194.2 / B32 589.2 (512) | {M gg-spark} |
| DGX Spark | llama.cpp, launch build 2025-10 | GLM-4.5-Air | Q4_K | 817 (pp2048) | 18.45 | none | {M hwc, reprinting launch numbers} |
| DGX Spark | llama.cpp, 2025-12 | Qwen3 8B / Qwen3-30B-A3B / Qwen3 32B | Q4_K_M | 3,167 / 2,541 / 762 (pp512) | 43.7 / 89.3 / 10.7 | none | {M dandin} |
| DGX Spark | SGLang | Llama 3.1 8B | FP8 | 7,991 | 20.5 | B32: 368 decode, 7,949 prefill | {M lmsys1} |
| DGX Spark | SGLang | Llama 3.1 70B | FP8 | 803 | 2.7 | none | {M lmsys1} |
| DGX Spark | Ollama | gpt-oss-20b | MXFP4 | 2,053 | 49.7 | none | {M lmsys1} |
| DGX Spark | SGLang (tuned) | gpt-oss-20b / 120b | MXFP4 | none | ~70 / ~50 | none | {M lmsys2} |
| DGX Spark | TRT-LLM, ISL 2048 / OSL 128 | Llama 3.1 8B | NVFP4 | 10,257 | 38.65 | none | {O nv-blog, vendor-run} |
| 2× DGX Spark | TRT-LLM | Qwen3 235B | NVFP4 | 23,477 | 11.73 | none | {O nv-blog} |
| DGX Spark | vLLM 26.03, ~1,500 in / 400 out | gpt-oss-120b | MXFP4 | none | 33.5 | c64: 373 (5.9/user); c256: 863 (3.6/user) | {M dendro} |
| DGX Spark | est. from bandwidth | Llama 3.3 70B | Q4_K_M | none | ≤6.4 at 100% BW; ~5 at 79% | none | {E 273 / 42.5 GB} |
| Strix Halo (Fedora 43) | llama.cpp b9187/9193, 2026-05-16 | gpt-oss-20b | MXFP4 | 1,787 ROCm / 1,692 RADV (pp512); 1,003 / 556 @32k | 73.1 / 79.8; 52.2 / 61.1 @32k | none | {M ky-lc} |
| Strix Halo | same | gpt-oss-120b | MXFP4 | 626 ROCm / 720 RADV; 589 / 308 @32k | 51.8 / 56.6; 36.3 / 43.0 @32k | none | {M ky-lc} |
| Strix Halo (EVO-X2) | llama.cpp ROCm b6816, 2025-10-22 | gpt-oss-120b | MXFP4 | 1,000 (pp2048, ub 2048); 349 @32k | 47.5; 35.4 @32k | none | {M gg-16578, user eugr} |
| Strix Halo (Framework, pre-prod) | llama.cpp mid-2025 | Llama 3.1 8B fine-tune (Shisa V2 8B) | Q4_K_M | 878 | 37.2 to 42.0 | none | {M lhl} |
| Strix Halo | same | Llama 3.3 70B fine-tune (Shisa V2 70B) | Q4_K_M | 94.7 | 4.5 to 5.0 | none | {M lhl} |
| Strix Halo | same | Qwen3-30B-A3B | UD-Q4_K_XL | 669 | 58.5 to 78.0 | none | {M lhl}; Vulkan RADV 755 / 85.1 {M shwiki} |
| Strix Halo | same | Qwen3 32B | Q8_0 | 226 | 6.4 | none | {M lhl} |
| Strix Halo | same | GLM-4.5-Air | UD-Q4_K_XL | 178.5 | 22.6 to 23.4 | none | {M lhl} |
| Strix Halo | vLLM peak, 200 ShareGPT prompts | Llama 3.1 8B / gpt-oss-20b / gpt-oss-120b | "BF16" per results file | none | none | saturated: 388 to 435 / 439 / 125 tok/s (1 box); 712 to 773 / 727 / 229 (2 boxes TP=2 RoCE) | {M ky-vllm} |
| Jetson AGX Thor | llama.cpp b6767 | gpt-oss-20b / 120b | MXFP4 | 1,861 / 938 (pp2048) | 57.2 / 41.8 | 120b at 4k: B8 79.1, B32 148.6 | {M jh-thor} |
| Mac Studio M3 Ultra | llama.cpp | gpt-oss-120b | MXFP4 | 864 (pp2048) | 70.8 | none | {M hwc, origin not stated} |
| Mac Studio M3 Ultra 512GB | Ollama | gpt-oss-20b / DeepSeek R1 671B | default | none | 115.3 / 19.9 | none; peak 227 / 261.8 W | {M jg-ai} |
| RTX 5090 | Ollama | gpt-oss-20b | MXFP4 | 8,519 | 205 | none | {M lmsys1} |
| RTX PRO 6000 | Ollama | gpt-oss-20b | MXFP4 | 10,108 | 215 | none | {M lmsys1} |
| Pi 5 16GB | Ollama CPU | Llama 3.2 3B / DeepSeek R1 14B | default | none | 4.88 / 1.20 | none | {M jg-ai} |

**Software drift, same box and model.** gpt-oss-120b on DGX Spark tg32: 38.55 at launch {M hwc}, then 60.40 by Nov 2025 {M gg-spark-nov}, then 58.72 by Feb 2026 {M gg-spark}. pp2048 went 1,723 -> 1,919 -> 2,444. On Strix Halo, gpt-oss-120b tg128 went 33.7 in mid-2025 {M lhl} to 51.8 to 56.6 in May 2026 {M ky-lc}.

---

## 2C. Model architecture (from each repo's config.json and model card, fetched today)

KV bytes/token is my arithmetic, `2 (K,V) × layers × kv_heads × head_dim × 2 bytes` in BF16 {E}. Gated Meta and Google repos returned 401, so for those I read the ungated `unsloth/` mirrors of the same checkpoints. The configs are identical copies, but the mirror is not the primary source.

| Model (repo read) | Total / active | Layers | KV heads | head_dim | Attention pattern | Native ctx | KV/token BF16 {E} |
|---|---|---|---|---|---|---|---|
| Llama 3.1 8B (unsloth mirror) | 8B dense (card) | 32 | 8 | 128 | full | 128k (card); 131,072 in config | 128 KiB |
| Llama 3.3 70B (unsloth mirror) | 70B dense (card) | 80 | 8 | 128 | full | 128k | 320 KiB |
| Qwen3-8B | 8.2B dense | 36 | 8 | 128 | full | **32,768 native**, 131,072 with YaRN; config says 40,960 = 32k out + 8k prompt | 144 KiB |
| Qwen3-32B | 32.8B dense | 64 | 8 | 128 | full | 32,768 / 131,072 YaRN | 256 KiB |
| Qwen3-30B-A3B | 30.5B / 3.3B, 128 experts, 8 active | 48 | 4 | 128 | full | 32,768 / 131,072 YaRN | 96 KiB |
| Qwen3-235B-A22B | 235B / 22B, 128 experts, 8 active | 94 | 4 | 128 | full | 32,768 / 131,072 YaRN | 188 KiB |
| gpt-oss-20b | 21B / 3.6B, 32 experts, 4 active | 24 | 8 | 64 | alternating: 12 sliding (window 128) + 12 full | 131,072 (initial 4,096 + YaRN ×32) | 24 KiB full layers + 3 MiB/seq fixed for sliding layers |
| gpt-oss-120b | 117B / 5.1B, 128 experts, 4 active | 36 | 8 | 64 | 18 sliding (128) + 18 full | 131,072 | 36 KiB + 4.5 MiB/seq fixed |
| Gemma 3 27B (unsloth mirror) | 27B dense | 62 | 16 | 128 | 5 local : 1 global (`sliding_window_pattern` 6, window 1,024), so 10 global layers {E} | 128k (card) | 80 KiB global + up to 416 MiB/seq for local layers |
| GLM-4.5-Air | 106B / 12B (card), 128 routed + 1 shared expert, 8 active, first layer dense | 46 (+1 MTP layer) | 8 | 128 | full, partial RoPE 0.5 | 131,072 (config) | 184 KiB |
| Mistral Small 3.2 24B | 24B dense | 40 | 8 | 128 | full (sliding_window null) | 131,072 (config) | 160 KiB |
| Llama 4 Scout (unsloth mirror) | 109B / 17B, 16 experts, 1 active (card) | 48 | 8 | 128 | 36 RoPE layers with `attention_chunk_size` 8,192, 12 NoPE global layers (every 4th); the reading of `no_rope_layers` is mine {E} | 10M (card) | 48 KiB global + up to 1.125 GiB/seq chunked; 192 KiB if a runtime caches all layers |
| DeepSeek-V3 / R1 | 671B / 37B, 256 routed + 1 shared, 8 active, first 3 dense | 61 (+1 MTP) | MLA: kv_lora_rank 512 + rope 64 | n/a | MLA compressed latent cache | 128K (card); 163,840 in config | **68.6 KiB** with MLA vs 4.77 MiB naive MHA (128 heads × (192+128)), 71× smaller {E} |

Sources: {hf} `unsloth/Llama-3.1-8B-Instruct`, `unsloth/Llama-3.3-70B-Instruct`, `Qwen/Qwen3-8B`, `Qwen/Qwen3-32B`, `Qwen/Qwen3-30B-A3B`, `Qwen/Qwen3-235B-A22B`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `unsloth/gemma-3-27b-it`, `zai-org/GLM-4.5-Air`, `mistralai/Mistral-Small-3.2-24B-Instruct-2506`, `unsloth/Llama-4-Scout-17B-16E-Instruct`, `deepseek-ai/DeepSeek-V3`, `deepseek-ai/DeepSeek-R1`. gpt-oss weights ship as MXFP4 and DeepSeek-V3 ships as FP8 block-quantized (config `quantization_config`).

---

## 2D. Kindle browser and e-ink latency

| Item | Finding | Tag / source |
|---|---|---|
| Engine | Kindle firmware 5.16.4+ switched the built-in browser to **Chromium** | {M kua, mr-kindle} |
| Chromium version | **not determined**. The 5.16.4 package's squashfs was built 2023-10-06; the browser launches `--single-process --skia-resource-cache-limit-mb=64` and still sends the legacy `Kindle/3.0+` WebKit UA string | {M mr-kindle} |
| Pre-5.16.4 browser (WebKit) | "limited ES5"; `new WebSocket` closes immediately with no code | {M kwt, FW 5.12.3, 2020} |
| fetch / EventSource / WebSocket on the Chromium browser | **not verified by any source I could read** | none |
| E-ink full refresh (GC16) | 450 ms typical at 25°C | {O eink Table 1} |
| Text-with-white-background modes (GL16/GLR16/GLD16) | 450 ms | {O eink} |
| Partial / fast (DU, 2-level) | 260 ms; DU4 290 ms | {O eink} |
| A2 page-flip (black/white) | 120 ms | {O eink} |
| INIT (full clear) | 2,000 ms | {O eink} |
| Kindle-specific timings | not published; E Ink notes times depend on temperature LUTs | {O eink §2.1} |

---

## 3. What it costs us (the simulator, zero-build static)

- **Everything above is plain data.** A JSON preset file carries it, no runtime cost.
- **Decode model:** `tg ≈ eff_bw / bytes_per_token`, where `eff_bw = frac × BW` and `frac` comes from the yardstick table (0.43 to 0.83) {E}. MoE bytes per token = active weights + attention. Check: 70B Q4 on either 128GB box gives ~5 tok/s, which matches the Strix measurement of 4.5 to 5.0 {M lhl}.
- **Prefill model:** effective TFLOPS from the yardstick (Strix ~20, DGX ~50, M5 Max ~43, 5090 ~200) {E}. Peak TFLOPS overshoot prefill by 2 to 10×.
- **Concurrency must be per architecture.** On DGX Spark, a dense 7B scales aggregate decode ~20× from B1 to B32 (29.1 -> 589). MoE scales far less: gpt-oss-120b 6.2× (57.1 -> 353.3), Qwen3-30B-A3B 5.9× {M gg-spark}. More streams touch more experts, so the bandwidth saving disappears. A single "batch efficiency" constant will be wrong for one family or the other.
- **Context depth** costs 25 to 50% of tg at 32k on these boxes {M gg-spark, ky-lc}. Strix Halo prefill falls off a cliff on Vulkan at depth (gpt-oss-20b RADV pp 1,692 -> 556 at 32k) {M ky-lc}. Depth needs to be an input, not a footnote.
- **Allocatable memory differs from the sticker.** DGX 119.7 GiB, Strix 96 GB on Windows vs ~124 GiB on Linux, Mac about 75 to 81% by default, Gorgon 160 of 192 GB. The "fits / doesn't fit" logic should use these numbers.
- **Idle power differs 5×** (Mac 5 to 9 W, Framework 12.5 W, GB10 31.5 to 40 W). Any energy-per-user figure at low utilisation is dominated by idle.
- **Anything needing live prices or live benchmarks** means a scraper or an API. Out of scope for a zero-build site unless someone runs a manual refresh; presets should just show "as of" dates.

---

## 4. What the sources get wrong or contradict

- **The infographic** (Surprises section below).
- **NVIDIA's "1 PFLOP"** is sparse NVFP4; "take sparsity out ... about 500 TFLOPS ... mostly marketing" {M th-spark}. GX10's shop page just says "1 PFLOP" with no qualifier {O asus-shop}.
- **GB10 BF16 disagreement:** mmapeak's mma.sync says 212.9 TF BF16 and 213.7 FP8 {M nv-mma}, while torch MAMF says 99.8 BF16 and 207.7 FP8 {M reg-mamf snip}. rossingram/Spark-DGX-Benchmark's README says "Spark: ~11-12 TFLOPs" FP16/BF16, off from both by 10× or more (https://github.com/rossingram/Spark-DGX-Benchmark). For a simulator, prefill-derived ~50 TF is what llama.cpp actually achieves {E}.
- **AMD vs reviewers:** AMD claims Ryzen AI Halo has "token throughput advantages of 4% to 14%" over DGX Spark {O tt-halo}. Tom's found it "generally slower", with time-to-first-token "far behind GB10 as context length grows" {M th-halo}.
- **ASUS GX10 price is inconsistent across ASUS's own channels:** "$3,999" US starting price as of 2026-08-18 (snip), but the eShop today shows $6,999 and out of stock {M asus-shop}.
- **Apple's spec page lags its store:** the support page still says M3 Ultra is "Configurable to: 256GB" {O apple-ms25}, while the store dropped 256 GB in May 2026 {M mr-0505}.
- **Invented 70B numbers:** an SEO roundup (presenc.ai, snip) claims DGX Spark does "approximately 35-45 tps" on 70B Q4. That's impossible: 273 GB/s over ~42.5 GB of weights caps it at ~6.4 tok/s {E}.
- **Kyuz0 vLLM file** labels gpt-oss runs "BF16" even though the checkpoint is MXFP4 {M ky-vllm}. Whether weights were upcast on ROCm is unknown.
- **N1X laptop memory:** 64 GB in one report vs 32 GB in another (snip).
- **Strix Halo tg is backend-dependent in both directions.** RADV wins tg, ROCm wins pp, and the gap flips with context depth {M shwiki, ky-lc}. A single "Strix Halo" number without its backend is not a calibration point.

---

## 5. Could not determine

- Current street prices for Framework Desktop 128GB (product pages under `frame.work/us/` are robots-disallowed; the blog has no figures), Dell Pro Max GB10 today, Mac Studio M4 Max 128GB and Mac mini M4 Pro 64GB launch configure prices (Apple's store prices load via script), and NVIDIA Marketplace's live DGX Spark stock (connection failed).
- RTX Spark / N1X memory bandwidth, dense TFLOPS, and any shipping price. Surface Dev Box price.
- Gorgon Halo memory speed and bandwidth.
- Dense BF16/FP8 for Strix Halo from AMD itself (the AMD product page timed out twice). Whether RDNA 3.5 has native FP8 matrix ops: not verified.
- Apple GPU TFLOPS (Apple doesn't publish them); M4 Max 128GB and M3 Ultra 96GB max power (Apple lists only other configs).
- Jetson Thor LLM wall power, idle power, and GPU-allocatable memory.
- DGX Spark Llama 3.3 70B Q4 llama.cpp numbers (only the FP8 SGLang 2.7 tok/s and my bandwidth estimate). LMSYS's full results sheet is on docs.google.com, which robots disallows.
- Strix Halo llama.cpp concurrency (llama-batched-bench) numbers: none found; only vLLM saturated throughput.
- Kindle browser Chromium version, and fetch/SSE/WebSocket support on it.
- Idle power of a 5090 or PRO 6000 system (depends on the host).

**Fetch log.** Robots.txt disallows ClaudeBot or Claude-User on these hosts, so I didn't fetch them (snippets only): arstechnica.com, chipsandcheese.com, videocardz.com, amazon.com (Kindle pages), techpowerup.com, theverge.com, theregister.com, nextplatform.com, cnx-software.com, docs.google.com. These hosts returned 403 to the robots request, so they're unstudied: phoronix.com, notebookcheck.net, msi.com, microsoft.com (Surface page), pcworld.com, hothardware.com, guru3d.com, digitaltrends.com, overclock3d.net, digitalcitizen.life. Other failures: amd.com Ryzen AI Halo page timed out twice; marketplace.nvidia.com didn't connect. explore.whatismybrowser.com returned 502 for robots.txt and 502 for the page, so nothing was read, but a page request was still made while its robots status was unknown. dendro-logic.com returned 403 to curl, so I read it through WebFetch.

---

## Surprises

**Infographic, row by row**
1. *DGX Spark "from $4,699"*: true only since the week of 2026-02-23. It launched at $3,999 {O nv-price}. The "up to 200B inference / 70B fine-tuning" line is NVIDIA's own {O nv-spark-pr}, and NVIDIA now also says up to 4 linked units for 700B {O nv-spark}.
2. *"AMD Ryzen AI Halo"*: real. $3,999 list, 256 GB/s, Windows or Linux are all correct {O tt-halo}. But it shipped July 2026, street prices run $4,699.99 to $4,999.99 {M th-halo}, and on Windows the GPU gets at most 96 GB of the 128 {O amd-vgm}.
3. *ASUS GX10 "from $2,999", "up to 1 PFLOP"*: the price is stale (Amazon $3,099.99 in Jan 2026; ASUS eShop $6,999 and out of stock today) {M asus-shop}. The PFLOP is sparse FP4.
4. *"Microsoft RTX Spark (coming late 2025)"*: no such product. NVIDIA RTX Spark (N1X) was announced with Microsoft on 2026-05-31 for fall 2026 {O nv-rtxspark}. Microsoft's box is the Surface RTX Spark Dev Box, price TBA {O ms-devbox}. Its reported 45 to 80 W chip TDP and 100 W envelope (vs GB10's 140 W) suggest it will run slower than a DGX Spark {E}.
5. *"Upcoming 192GB AI PCs"*: that's Gorgon Halo (Ryzen AI Max PRO 400), announced May 2026. Only 160 GB is GPU-usable, it's the same Zen 5 / RDNA 3.5 silicon, and boxes are rumored at $7,500+ {O th-gorgon, R snip}. Macs passed 192 GB long ago: 512 GB M3 Ultra in 2025 {O apple-m3pr}, and 512 GB M5 Ultra arrives late Oct 2026 {O apple-m5pr}. Medusa Halo on LPDDR6 (~460.8 GB/s, 2027-28) is RUMOR only.

**Facts that change how the simulator should be built**
- **Memory is the market story of 2026.** 5090 street price is 235% over MSRP, PRO 6000 is $15,930, Pi 5 16GB went from $120 to $305, and Apple pulled its 256/512 GB options {M vcp, O rpi, M mr-0505}. Presets need `price_usd`, `price_date` and `available` fields, not one number.
- **The Apple comparison set is a generation old.** The M5 Max prefills Llama 2 7B at 3,220 tok/s vs 886 on the M4 Max {M gg-4167}, and Apple claims 4× over the M3 Ultra {O apple-m5pr}. "Mac = fast decode, slow prefill" no longer holds for M5.
- **MoE batching scales ~6× at B=32, dense scales ~20×** {M gg-spark}. Multi-user curves have to be per architecture.
- **Software moves numbers 50%+ in months** {M hwc, gg-spark-nov, gg-spark, lhl, ky-lc}. Calibration points need a build and date, and preferably a "software era" toggle.
- **Real link bandwidth between boxes** is ~100 to 110 Gbps on "200G" ConnectX-7 {M jg-gb10} and ~10 Gbps on USB4 networking {M jg-fw}. Tensor-parallel scaling over two boxes is 1.8× for Llama 8B on Strix Halo with RoCE {M ky-vllm}.
- **The priority model list is dated.** The Sept 2026 Strix Halo benchmark suite tests Qwen3.5/3.6, Gemma 4, GLM-4.7-Flash, Nemotron 3 Super and MiniMax-M2.7 alongside gpt-oss {M ky-lc}. Worth one more research pass for those configs if presets should look current.
- **Kindle client:** the e-ink floor is 120 to 450 ms per update (2 s for a full clear) {O eink}. Token streaming should batch into updates about once a second, and the page should work with plain polling, because the Kindle Chromium's support for streaming APIs is unverified and the old engine killed WebSockets {M kwt}.

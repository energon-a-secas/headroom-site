// ── Hardware catalog ─────────────────────────────────────────
// What each box brings to inference. Decode speed is set by memory bandwidth,
// prompt speed by tensor throughput, and how much fits by usable memory.
//
//   memGB       installed memory (unified, or VRAM for discrete GPUs)
//   usableGB    what the inference process can actually allocate after the OS
//   bwGBs       peak memory bandwidth
//   tflops      dense tensor throughput by precision (sparse figures halved).
//               Apple publishes none: those are estimates backed out of
//               measured prompt speed, so they carry `confidence: estimate`.
//   eff.bw      share of the runtime's bandwidth efficiency this platform reaches
//   eff.compute share of the runtime's compute efficiency this platform reaches
//   eff.step    fixed per-iteration overhead multiplier (host CPU, launch latency)
//   eff.moeM0   how badly small per-expert matrix multiplies run during prompt
//               processing: efficiency is m / (m + moeM0) for m tokens per expert
//   idleW/loadW wall power at idle and under sustained inference
//   link        interconnect used when two or more boxes split one model
//   status      shipping | discontinued | announced | custom
//   price       USD as of priceAsOf; 2026's memory shortage moves these monthly
//
// Sources and measurements: docs/research.md in this repo. The efficiencies
// are fitted to llama.cpp, vLLM and SGLang benchmarks (see js/data/calibration.js).

const ASOF = '2026-09-23';

export const BOXES = [
  {
    id: 'dgx-spark', name: 'NVIDIA DGX Spark', short: 'DGX Spark', maker: 'NVIDIA', chip: 'GB10 Grace Blackwell',
    platform: 'cuda', status: 'shipping', priceUsd: 4699, priceAsOf: ASOF,
    priceNote: 'Launched at $3,999 in October 2025; NVIDIA raised it to $4,699 in February 2026.',
    memGB: 128, usableGB: 116, bwGBs: 273, tflops: { fp16: 100, fp8: 208, fp4: 427 },
    eff: { bw: 1.0, compute: 0.98, step: 1, moeM0: 110 }, idleW: 35, loadW: 160,
    net: '10 GbE, ConnectX-7 QSFP (about 106 Gb/s measured), Wi-Fi 7',
    link: { name: 'ConnectX-7 (about 106 Gb/s real)', latencyUs: 6, gbps: 106 }, pairable: true,
    confidence: 'measured', form: 'cube',
  },
  {
    id: 'asus-gx10', name: 'ASUS Ascent GX10', short: 'Ascent GX10', maker: 'ASUS', chip: 'GB10 Grace Blackwell',
    platform: 'cuda', status: 'shipping', priceUsd: 3999, priceAsOf: ASOF,
    priceNote: 'US list $3,999 in August 2026; the ASUS eShop showed $6,999 and out of stock on 2026-09-23. It was $3,100 on Amazon in January.',
    memGB: 128, usableGB: 116, bwGBs: 273, tflops: { fp16: 100, fp8: 208, fp4: 427 },
    eff: { bw: 1.0, compute: 0.98, step: 1, moeM0: 110 }, idleW: 32, loadW: 150,
    net: '10 GbE, ConnectX-7 QSFP, Wi-Fi 7',
    link: { name: 'ConnectX-7 (about 106 Gb/s real)', latencyUs: 6, gbps: 106 }, pairable: true,
    confidence: 'measured', form: 'cube',
  },
  {
    id: 'ryzen-ai-halo', name: 'AMD Ryzen AI Halo', short: 'Ryzen AI Halo', maker: 'AMD', chip: 'Ryzen AI Max+ 395, Radeon 8060S',
    platform: 'rocm', status: 'shipping', priceUsd: 3999, priceAsOf: ASOF,
    priceNote: 'AMD list $3,999 since July 2026; retailers charge $4,700 to $5,000. On Windows the GPU gets at most 96 GB; these numbers assume Linux.',
    memGB: 128, usableGB: 116, bwGBs: 256, tflops: { fp16: 59, fp8: 59, fp4: 59 },
    eff: { bw: 1.0, compute: 0.68, step: 1, moeM0: 50 }, idleW: 18, loadW: 160,
    net: '10 GbE, Wi-Fi 7, 2x USB4',
    link: { name: 'USB4 / 10 GbE', latencyUs: 45, gbps: 10 }, pairable: false,
    confidence: 'measured', form: 'slab',
  },
  {
    id: 'evo-x2', name: 'GMKtec EVO-X2 128 GB', short: 'EVO-X2', maker: 'GMKtec', chip: 'Ryzen AI Max+ 395, Radeon 8060S',
    platform: 'rocm', status: 'shipping', priceUsd: 3500, priceAsOf: ASOF,
    priceNote: '$3,499.99 with 1 TB on the GMKtec store, with a price rise announced. Framework Desktop 128 GB uses the same chip.',
    memGB: 128, usableGB: 116, bwGBs: 256, tflops: { fp16: 59, fp8: 59, fp4: 59 },
    eff: { bw: 1.0, compute: 0.68, step: 1, moeM0: 50 }, idleW: 13, loadW: 150,
    net: '2.5 GbE, Wi-Fi 7, USB4',
    link: { name: 'USB4 (about 10 Gb/s)', latencyUs: 45, gbps: 10 }, pairable: false,
    confidence: 'measured', form: 'slab',
  },
  {
    id: 'jetson-thor', name: 'Jetson AGX Thor dev kit', short: 'Jetson Thor', maker: 'NVIDIA', chip: 'Blackwell, 2560 cores',
    platform: 'cuda', status: 'shipping', priceUsd: 3499, priceAsOf: ASOF, priceNote: 'Developer kit list price. NVIDIA quotes 2,070 sparse FP4 TFLOPS, but measured prompt speed is half a DGX Spark, so the rates here follow the measurements.',
    memGB: 128, usableGB: 112, bwGBs: 273, tflops: { fp16: 100, fp8: 200, fp4: 400 },
    eff: { bw: 0.75, compute: 0.45, step: 1.2, moeM0: 110 }, idleW: 20, loadW: 130,
    net: '5 GbE, QSFP28 (4x 25 GbE), Wi-Fi 6E',
    link: { name: '4x 25 GbE', latencyUs: 20, gbps: 100 }, pairable: false,
    confidence: 'measured', form: 'module',
  },
  {
    id: 'mac-m5max-128', name: 'Mac Studio M5 Max 128 GB', short: 'M5 Max 128', maker: 'Apple', chip: 'M5 Max, 40-core GPU',
    platform: 'metal', status: 'shipping', priceUsd: 3699, priceAsOf: ASOF,
    priceNote: 'Mac Studio M5 Max starts at $2,499; the 128 GB price is an estimate. Apple publishes no TFLOPS, so compute is backed out of measured prompt speed.',
    memGB: 128, usableGB: 104, bwGBs: 614, tflops: { fp16: 86, fp8: 86, fp4: 86 },
    eff: { bw: 1.0, compute: 1, step: 1, moeM0: 30 }, idleW: 7, loadW: 180,
    net: '10 GbE, Thunderbolt 5, Wi-Fi 7',
    link: { name: 'Thunderbolt 5 with RDMA', latencyUs: 15, gbps: 80 }, pairable: true,
    confidence: 'estimate', form: 'studio',
  },
  {
    id: 'mac-m5ultra-256', name: 'Mac Studio M5 Ultra 256 GB', short: 'M5 Ultra 256', maker: 'Apple', chip: 'M5 Ultra',
    platform: 'metal', status: 'shipping', priceUsd: 7899, priceAsOf: ASOF,
    priceNote: 'M5 Ultra starts at $5,499 with 96 GB; the 256 GB price is an estimate. 512 GB ships late October.',
    memGB: 256, usableGB: 220, bwGBs: 1200, tflops: { fp16: 160, fp8: 160, fp4: 160 },
    eff: { bw: 0.8, compute: 1, step: 1, moeM0: 30 }, idleW: 9, loadW: 280,
    net: '10 GbE, Thunderbolt 5, Wi-Fi 7',
    link: { name: 'Thunderbolt 5 with RDMA', latencyUs: 15, gbps: 80 }, pairable: true,
    confidence: 'estimate', form: 'studio',
  },
  {
    id: 'mac-mini-m5pro', name: 'Mac mini M5 Pro 64 GB', short: 'M5 Pro 64', maker: 'Apple', chip: 'M5 Pro, 20-core GPU',
    platform: 'metal', status: 'shipping', priceUsd: 2199, priceAsOf: ASOF,
    priceNote: 'Price estimated from the M4 Pro 64 GB it replaced; Apple cut 64 GB M4 Pro options in May 2026.',
    memGB: 64, usableGB: 50, bwGBs: 307, tflops: { fp16: 44, fp8: 44, fp4: 44 },
    eff: { bw: 1.0, compute: 1, step: 1, moeM0: 30 }, idleW: 5, loadW: 90,
    net: '1 GbE (10 GbE option), Thunderbolt 5, Wi-Fi 7',
    link: { name: 'Thunderbolt 5 with RDMA', latencyUs: 15, gbps: 80 }, pairable: true,
    confidence: 'estimate', form: 'mini',
  },
  {
    id: 'rtx-5090', name: 'Desktop with RTX 5090', short: 'RTX 5090 PC', maker: 'NVIDIA + your PC', chip: 'GeForce RTX 5090, 32 GB GDDR7',
    platform: 'cuda', status: 'shipping', priceUsd: 5700, priceAsOf: ASOF,
    priceNote: 'GPU $4,200 at its 90-day low (MSRP $1,999; Amazon $6,699 new) plus about $1,500 for the host PC.',
    memGB: 32, usableGB: 30, bwGBs: 1792, tflops: { fp16: 419, fp8: 419, fp4: 1676 },
    eff: { bw: 1.0, compute: 0.96, step: 0.5, moeM0: 110 }, idleW: 75, loadW: 650,
    net: 'Whatever the host PC has, usually 2.5 to 10 GbE',
    link: { name: '10 GbE', latencyUs: 45, gbps: 10 }, pairable: false,
    confidence: 'measured', form: 'tower',
  },
  {
    id: 'rtx-pro-6000', name: 'Workstation with RTX PRO 6000', short: 'RTX PRO 6000', maker: 'NVIDIA + workstation', chip: 'RTX PRO 6000 Blackwell, 96 GB GDDR7',
    platform: 'cuda', status: 'shipping', priceUsd: 11100, priceAsOf: ASOF,
    priceNote: 'GPU MSRP $8,565 (Amazon lists $15,930) plus about $2,500 for the workstation.',
    memGB: 96, usableGB: 92, bwGBs: 1792, tflops: { fp16: 500, fp8: 1000, fp4: 2000 },
    eff: { bw: 0.92, compute: 0.9, step: 0.5, moeM0: 110 }, idleW: 90, loadW: 750,
    net: 'Whatever the workstation has, usually 10 GbE',
    link: { name: '10 GbE', latencyUs: 45, gbps: 10 }, pairable: false,
    confidence: 'measured', form: 'tower',
  },
  {
    id: 'pi5', name: 'Raspberry Pi 5 16 GB', short: 'Pi 5', maker: 'Raspberry Pi', chip: 'Cortex-A76 x4, CPU inference',
    platform: 'cpu', status: 'shipping', priceUsd: 305, priceAsOf: ASOF,
    priceNote: 'Launched at $120; three memory-driven rises since December 2025.',
    memGB: 16, usableGB: 14, bwGBs: 17, tflops: { fp16: 0.4, fp8: 0.4, fp4: 0.4 },
    eff: { bw: 0.66, compute: 0.6, step: 1, moeM0: 1 }, idleW: 3, loadW: 12,
    net: '1 GbE, Wi-Fi 5',
    link: { name: '1 GbE', latencyUs: 80, gbps: 1 }, pairable: false,
    confidence: 'estimate', form: 'board',
  },
  {
    id: 'mac-m3u-512', name: 'Mac Studio M3 Ultra 512 GB', short: 'M3 Ultra 512', maker: 'Apple', chip: 'M3 Ultra, 80-core GPU',
    platform: 'metal', status: 'discontinued', priceUsd: 9499, priceAsOf: ASOF,
    priceNote: 'Was $9,499 new; Apple removed the 512 GB option in March 2026. Used prices vary.',
    memGB: 512, usableGB: 470, bwGBs: 819, tflops: { fp16: 40, fp8: 40, fp4: 40 },
    eff: { bw: 0.6, compute: 1, step: 1, moeM0: 30 }, idleW: 9, loadW: 260,
    net: '10 GbE, Thunderbolt 5, Wi-Fi 6E',
    link: { name: 'Thunderbolt 5', latencyUs: 30, gbps: 80 }, pairable: false,
    confidence: 'measured', form: 'studio',
  },
  {
    id: 'rtx-spark-devbox', name: 'Surface RTX Spark Dev Box', short: 'RTX Spark box', maker: 'Microsoft + NVIDIA', chip: 'NVIDIA N1X (RTX Spark)',
    platform: 'cuda', status: 'announced', priceUsd: 3250, priceAsOf: ASOF,
    priceNote: 'Announced 2026-05-31 for fall 2026 with no price; $3,000 to $3,500 is a rumour. Bandwidth and TFLOPS are unpublished: these assume GB10-class memory in a 45 to 80 W chip.',
    memGB: 128, usableGB: 110, bwGBs: 273, tflops: { fp16: 50, fp8: 100, fp4: 200 },
    eff: { bw: 0.95, compute: 0.9, step: 1, moeM0: 110 }, idleW: 10, loadW: 100,
    net: 'Unannounced',
    link: { name: 'Unannounced', latencyUs: 45, gbps: 10 }, pairable: false,
    confidence: 'estimate', form: 'mini',
  },
  {
    id: 'gorgon-halo-192', name: 'Ryzen AI Max PRO 400 192 GB', short: 'Gorgon Halo 192', maker: 'AMD partners', chip: 'Ryzen AI Max PRO 495, Radeon 8065S',
    platform: 'rocm', status: 'announced', priceUsd: 7500, priceAsOf: ASOF,
    priceNote: 'The 192 GB class from the infographic. AMD caps GPU memory at 160 GB; partner boxes from Q3 2026, rumoured at $7,500 or more. Bandwidth assumed unchanged at 256 GB/s.',
    memGB: 192, usableGB: 156, bwGBs: 256, tflops: { fp16: 62, fp8: 62, fp4: 62 },
    eff: { bw: 1.0, compute: 0.68, step: 1, moeM0: 50 }, idleW: 18, loadW: 170,
    net: 'Assumed 10 GbE, Wi-Fi 7',
    link: { name: '10 GbE', latencyUs: 45, gbps: 10 }, pairable: false,
    confidence: 'estimate', form: 'slab',
  },
];

/** Starting point for the custom box editor. */
export const CUSTOM_BOX = {
  id: 'custom', name: 'Custom box', short: 'Custom', maker: 'You', chip: 'Your numbers',
  platform: 'cuda', status: 'custom', priceUsd: 3000, priceAsOf: '', priceNote: 'Your numbers.',
  memGB: 128, usableGB: 116, bwGBs: 300, tflops: { fp16: 80, fp8: 160, fp4: 320 },
  eff: { bw: 1.0, compute: 0.9, step: 1, moeM0: 110 }, idleW: 30, loadW: 200,
  net: 'Your network', link: { name: '10 GbE', latencyUs: 45, gbps: 10 }, pairable: true,
  confidence: 'estimate', form: 'cube',
};

export const STATUS_LABEL = {
  shipping: 'Shipping now', discontinued: 'Discontinued, used market', announced: 'Announced, not shipping yet', custom: 'Your own',
};

export const boxById = (id, custom) => {
  if (id === 'custom') {
    return { ...CUSTOM_BOX, ...(custom || {}),
      tflops: { ...CUSTOM_BOX.tflops, ...(custom?.tflops || {}) },
      eff: { ...CUSTOM_BOX.eff, ...(custom?.eff || {}) } };
  }
  return BOXES.find((b) => b.id === id) || BOXES[0];
};

// ── The crowd: who uses the box, from what, over which wire ──
// A scenario is a list of groups. Each group is N users of one persona, on
// one client device, over one link, speaking one protocol. The simulator
// runs every user as a closed loop: ask, wait, read, think, ask again.

// ── Personas ──
// Token counts are means; the simulator draws lognormal samples around them.
//   prompt      new tokens typed or produced per turn
//   context     tokens attached to every turn that are NOT shared (a book
//               passage, retrieved chunks, a code file)
//   prefix      system prompt / tool definitions shared by the whole group,
//               which a prefix cache can skip after the first request
//   output      tokens generated per answer
//   history     true: the conversation is resent each turn and grows
//   turns       turns per conversation before starting fresh
//   think       mean seconds between reading the answer and asking again
//   readTps     how fast the person reads the answer (tokens/s); 0 = a machine
//   slo         what counts as a good answer for this persona
//               ttft: first visible text (s), tps: stream speed floor,
//               e2e: whole answer visible (s)
//   patience    seconds a queued request waits before the person gives up
//   lead        tokens that must be generated before anything can be shown or
//               spoken: a speech engine buffers about 60 characters (16 tokens)
//               before it talks; a tool call comes before a device reply
//   reason      hidden thinking tokens the task asks for (a reasoning model
//               always writes at least its own minimum; see models.js)
//   burst       true: sends are synchronised to a clock, every burstEvery
//               seconds, spread over burstSpread seconds
//   outRatio    answer length follows input length (a translation): visible
//               tokens = (prompt + context) x outRatio, instead of `output`
//   name        (in a group's tweak) what the report calls this group
//   prefixId    (group level) names the system prompt; groups with the same
//               persona and prefix share one cached prompt unless they differ
export const PERSONAS = [
  {
    id: 'chat', name: 'Chat assistant', glyph: 'C',
    prompt: 90, context: 0, prefix: 450, output: 380, history: true, turns: 8,
    think: 40, readTps: 6, slo: { ttft: 2, tps: 8, e2e: 0 }, patience: 60,
    blurb: 'Everyday questions, a growing conversation, answers streamed as they are written.',
  },
  {
    id: 'reader', name: 'E-reader companion', glyph: 'R',
    prompt: 35, context: 1400, prefix: 300, output: 140, history: false, turns: 6,
    think: 150, readTps: 4, slo: { ttft: 0, tps: 0, e2e: 20 }, patience: 90,
    blurb: 'Asks about the passage on screen, so each question carries a page of the book. Short answers.',
  },
  {
    id: 'coder', name: 'Coding agent', glyph: '<>',
    prompt: 1400, context: 0, prefix: 7000, output: 450, history: true, turns: 20,
    think: 4, readTps: 0, slo: { ttft: 12, tps: 10, e2e: 0 }, patience: 300,
    blurb: 'An agent loop: long system prompt and tools, tool output appended every step, huge contexts.',
  },
  {
    id: 'rag', name: 'Document Q&A', glyph: 'D',
    prompt: 60, context: 3200, prefix: 400, output: 260, history: false, turns: 4,
    think: 70, readTps: 6, slo: { ttft: 3, tps: 8, e2e: 0 }, patience: 60,
    blurb: 'Retrieval pulls a few thousand tokens of documents into every question.',
  },
  {
    id: 'voice', name: 'Voice assistant', glyph: 'V',
    prompt: 25, context: 0, prefix: 900, output: 70, history: true, turns: 4,
    think: 90, readTps: 3, slo: { ttft: 1.2, tps: 10, e2e: 0 }, patience: 10, lead: 16,
    blurb: 'Speech in, speech out. The speech engine needs about 16 tokens before it can start, and anything past 1.2 seconds to the first word feels broken.',
  },
  {
    id: 'student', name: 'Classroom student', glyph: 'S',
    prompt: 160, context: 0, prefix: 600, output: 420, history: true, turns: 6,
    think: 110, readTps: 5, slo: { ttft: 0, tps: 0, e2e: 60 }, patience: 120,
    burst: true, burstEvery: 300, burstSpread: 20,
    blurb: 'Everyone gets the same exercise and presses submit within seconds of each other.',
  },
  {
    id: 'home', name: 'Smart-home agent', glyph: 'H',
    prompt: 120, context: 0, prefix: 1600, output: 60, history: false, turns: 1,
    think: 25, readTps: 0, slo: { ttft: 1.5, tps: 0, e2e: 4 }, patience: 15,
    blurb: 'Device events trigger a tool call. Big shared prompt of devices and tools, tiny answers.',
  },
  {
    id: 'robot', name: 'Warehouse robot', glyph: 'W',
    prompt: 700, context: 0, prefix: 4000, output: 250, history: false, turns: 1,
    think: 240, readTps: 0, slo: { ttft: 0, tps: 0, e2e: 10 }, patience: 30,
    blurb: 'A mobile robot asks for a new plan when its task changes: map, tools and rules in a big shared prompt, a short plan back, and it idles until the plan arrives.',
  },
  {
    id: 'batch', name: 'Overnight batch', glyph: 'B',
    prompt: 60, context: 3000, prefix: 300, output: 300, history: false, turns: 1,
    think: 0, readTps: 0, slo: { ttft: 0, tps: 0, e2e: 600 }, patience: 3600,
    blurb: 'A worker summarizing documents back to back. Nobody waits on it; only throughput matters.',
  },
];

// ── Client devices ──
//   updateMs    how often the screen can usefully repaint while streaming
//   renderMs    cost of one repaint (e-ink refresh is slow and blocks)
//   finalMs     cost of the last repaint when the answer is complete
//   mode        'stream' shows tokens as they arrive; 'final' waits for the
//               whole answer (an e-ink page that flashes once)
//   pipelineMs  fixed work outside the model: speech-to-text before, TTS after
//   thinking    true: the app streams a reasoning model's thinking block as it
//               is written, so that counts as the first visible text; a speaker
//               cannot speak its reasoning and waits for the answer itself
//   noun        how a sentence names it ("a Kindle cannot show thinking")
// The Kindle's browser is Chrome 75 (firmware 5.16.4 and later), so it can
// stream over SSE or WebSocket; whole answers are the default because each
// e-ink repaint costs about 450 ms. Pick a streaming protocol to compare.
export const CLIENTS = [
  { id: 'browser', name: 'Laptop browser', noun: 'laptop browser', updateMs: 16, renderMs: 2, finalMs: 2, mode: 'stream', pipelineMs: 0, protocol: 'sse', thinking: true },
  { id: 'phone', name: 'Phone app', noun: 'phone app', updateMs: 33, renderMs: 4, finalMs: 4, mode: 'stream', pipelineMs: 0, protocol: 'sse', thinking: true },
  { id: 'kindle', name: 'Kindle (e-ink)', noun: 'Kindle', updateMs: 1000, renderMs: 450, finalMs: 450, mode: 'final', pipelineMs: 0, protocol: 'http', thinking: false },
  { id: 'speaker', name: 'Smart speaker', noun: 'smart speaker', updateMs: 50, renderMs: 0, finalMs: 0, mode: 'stream', pipelineMs: 550, protocol: 'ws', thinking: false },
  { id: 'ide', name: 'IDE / terminal agent', noun: 'coding agent', updateMs: 50, renderMs: 0, finalMs: 0, mode: 'stream', pipelineMs: 0, protocol: 'sse', thinking: true },
  { id: 'script', name: 'Script or service', noun: 'script', updateMs: 0, renderMs: 0, finalMs: 0, mode: 'final', pipelineMs: 0, protocol: 'http', thinking: false },
  { id: 'badge', name: 'E-paper badge (ESP32)', noun: 'e-paper badge', updateMs: 3000, renderMs: 1500, finalMs: 2000, mode: 'final', pipelineMs: 0, protocol: 'mesh', thinking: false },
];

// ── Links ──
//   rttMs       base round trip at zero distance
//   kmMs        extra round-trip ms per km (fibre ~0.01 with routing detours)
//   mbps        usable throughput of the shared medium (or per client when not shared)
//   pktUs       fixed airtime per packet regardless of size (preamble,
//               contention, acknowledgement). Tiny token packets pay it in full.
//   mtu         payload bytes per packet
//   loss        packet loss; each loss costs a retransmission
//   arq         the radio retransmits on its own (Wi-Fi, Bluetooth, mesh
//               rebroadcasts), so loss costs airtime only; on internet paths
//               a loss also stalls the connection for a TCP recovery
//   duty        share of time the radio may transmit (regulatory duty cycle)
//   shared      one medium for the whole group (radio) vs switched paths
//   maxClients  connections the access point / hub can actually hold
//   rangeKm     beyond this, the link does not reach
export const LINKS = [
  { id: 'local', name: 'Same machine', rttMs: 0.05, kmMs: 0, mbps: 10000, pktUs: 0, mtu: 65000, loss: 0, duty: 1, shared: false, maxClients: 100000, rangeKm: 0, unit: 'none' },
  { id: 'lan', name: 'Ethernet LAN', rttMs: 0.4, kmMs: 0, mbps: 1000, pktUs: 0, mtu: 1460, loss: 0, duty: 1, shared: false, maxClients: 100000, rangeKm: 0.1, unit: 'm' },
  { id: 'wifi', name: 'Wi-Fi 6 (same floor)', rttMs: 4, kmMs: 0, mbps: 280, pktUs: 160, mtu: 1460, loss: 0.002, arq: true, duty: 1, shared: true, maxClients: 64, rangeKm: 0.04, unit: 'm' },
  { id: 'wifiweak', name: 'Wi-Fi (far room)', rttMs: 14, kmMs: 0, mbps: 40, pktUs: 420, mtu: 1460, loss: 0.02, arq: true, duty: 1, shared: true, maxClients: 64, rangeKm: 0.06, unit: 'm' },
  { id: 'ble', name: 'Bluetooth LE hub', rttMs: 45, kmMs: 0, mbps: 0.25, pktUs: 1250, mtu: 244, loss: 0.01, arq: true, duty: 1, shared: true, maxClients: 10, rangeKm: 0.03, unit: 'm' },
  { id: 'vpn', name: 'Internet via VPN', rttMs: 18, kmMs: 0.012, mbps: 40, pktUs: 0, mtu: 1400, loss: 0.001, duty: 1, shared: false, maxClients: 100000, rangeKm: 20000, unit: 'km' },
  { id: 'cell', name: '4G / 5G phone', rttMs: 48, kmMs: 0.012, mbps: 20, pktUs: 0, mtu: 1400, loss: 0.005, duty: 1, shared: false, maxClients: 100000, rangeKm: 20000, unit: 'km' },
  { id: 'starlink', name: 'Starlink', rttMs: 42, kmMs: 0.012, mbps: 15, pktUs: 0, mtu: 1400, loss: 0.01, duty: 1, shared: false, maxClients: 100000, rangeKm: 20000, unit: 'km' },
  { id: 'geo', name: 'Satellite (GEO)', rttMs: 600, kmMs: 0, mbps: 5, pktUs: 0, mtu: 1400, loss: 0.01, duty: 1, shared: false, maxClients: 100000, rangeKm: 20000, unit: 'km' },
  { id: 'lora', name: 'LoRa mesh (Meshtastic)', rttMs: 3500, kmMs: 0, mbps: 0.00107, pktUs: 180000, mtu: 200, loss: 0.08, arq: true, duty: 1, shared: true, maxClients: 80, rangeKm: 12, unit: 'km' },
  { id: 'loraeu', name: 'LoRa mesh (EU, 10% duty)', rttMs: 3500, kmMs: 0, mbps: 0.00107, pktUs: 180000, mtu: 200, loss: 0.08, arq: true, duty: 0.1, shared: true, maxClients: 80, rangeKm: 12, unit: 'km' },
];

// ── Protocols ──
// How tokens travel. The overheads decide whether a thin link survives.
//   stream      tokens sent as they are generated
//   eventBytes  framing per streamed event (an OpenAI-style SSE chunk is a
//               whole JSON object per token)
//   coalesceMs  batch tokens into one event per interval (0 = every token)
//   reqBytes    request framing; history true means the client resends the
//               whole conversation every turn
//   handshakeRtt  extra round trips before the first byte (TCP + TLS)
export const PROTOCOLS = [
  { id: 'sse', name: 'HTTP + SSE (OpenAI API)', stream: true, eventBytes: 190, coalesceMs: 0, reqBytes: 700, resendsHistory: true, handshakeRtt: 0 },
  { id: 'ws', name: 'WebSocket, 50 ms batches', stream: true, eventBytes: 12, coalesceMs: 50, reqBytes: 120, resendsHistory: false, handshakeRtt: 0 },
  { id: 'http', name: 'HTTP, whole answer', stream: false, eventBytes: 0, coalesceMs: 0, reqBytes: 700, resendsHistory: true, handshakeRtt: 0 },
  { id: 'coldhttp', name: 'HTTP, new TLS each time', stream: false, eventBytes: 0, coalesceMs: 0, reqBytes: 700, resendsHistory: true, handshakeRtt: 2 },
  { id: 'mesh', name: 'Compact text packets', stream: false, eventBytes: 16, coalesceMs: 0, reqBytes: 16, resendsHistory: false, handshakeRtt: 0 },
];

export const BYTES_PER_TOKEN = 4;

export const personaById = (id) => PERSONAS.find((p) => p.id === id) || PERSONAS[0];
export const clientById = (id) => CLIENTS.find((c) => c.id === id) || CLIENTS[0];
export const linkById = (id) => LINKS.find((l) => l.id === id) || LINKS[1];
export const protocolById = (id) => PROTOCOLS.find((p) => p.id === id) || PROTOCOLS[0];

// ── Network model ────────────────────────────────────────────
// Text is tiny, so bandwidth almost never matters. What matters is:
//   - round trips (distance, radio scheduling, handshakes)
//   - per-packet airtime on shared radios: a Wi-Fi or Bluetooth frame costs
//     the same preamble and acknowledgement whether it carries one token or
//     a kilobyte, so one-token-per-event streaming to 50 clients adds up
//   - duty-cycle rules on LoRa, which cap how much a gateway may transmit
//   - how many clients a hub can hold at all
//   - on internet paths, a lost packet stalls the connection until TCP
//     notices and resends it (about a round trip plus 200 ms); radios that
//     retransmit at the link layer (Wi-Fi, Bluetooth, LoRa rebroadcasts) only
//     pay the extra airtime
//
// A shared medium is one FIFO: every transmission from or to any client in
// the group queues behind the previous one. A switched link gives each
// client its own path, so only its own serialization and latency apply.

import { linkById, protocolById, clientById, BYTES_PER_TOKEN } from '../data/crowd.js';

/**
 * Build the runtime link state for one group. `unlimited` lifts the hub's
 * client cap: "how many would the box hold with enough access points".
 */
export function makeLink(group, unlimited = false, rng = null) {
  const L = linkById(group.link);
  const proto = protocolById(group.protocol || clientById(group.client).protocol);
  const km = Math.max(0, group.distanceKm || 0);
  const inRange = L.rangeKm === 0 || km <= L.rangeKm;
  // Radios slow down toward the edge of their range; wired and WAN links do not.
  const edge = L.shared && L.rangeKm > 0 ? Math.min(1, km / L.rangeKm) : 0;
  const rateFactor = edge < 0.4 ? 1 : Math.max(0.15, 1 - (edge - 0.4) * 1.4);
  const rttS = (L.rttMs + L.kmMs * km + (edge > 0.7 ? L.rttMs * 2 * (edge - 0.7) : 0)) / 1000;
  return {
    def: L, proto, km, inRange,
    rttS, oneWayS: rttS / 2,
    bps: L.mbps * 1e6 * rateFactor,
    pktS: L.pktUs * 1e-6,
    mtu: L.mtu, loss: L.loss, duty: L.duty, arq: !!L.arq, rng,
    rtoS: rttS + 0.2,
    shared: L.shared, maxClients: unlimited ? Infinity : L.maxClients,
    freeAt: 0,       // shared medium: when the channel is next idle
    busyS: 0,        // accumulated airtime, for utilisation
    backlogPeakS: 0, // worst queueing delay seen on the channel
  };
}

/** Airtime to move `bytes` in `events` separate messages. */
export function airtime(link, bytes, events = 1) {
  if (bytes <= 0) return 0;
  const packets = Math.max(events, Math.ceil(bytes / link.mtu));
  const raw = packets * link.pktS + (bytes * 8) / link.bps;
  return raw / (1 - link.loss) / link.duty;
}

/**
 * Send a message that is ready at `t`. Returns when its last byte arrives.
 * On a shared medium the message waits for the channel first.
 */
/** Extra delay when an end-to-end path loses a packet of this message. */
function recovery(link, bytes, events) {
  if (link.arq || !link.loss || !link.rng) return 0;
  const packets = Math.max(events, Math.ceil(bytes / link.mtu));
  return link.rng.chance(1 - Math.pow(1 - link.loss, packets)) ? link.rtoS : 0;
}

export function transmit(link, t, bytes, events = 1) {
  const air = airtime(link, bytes, events);
  const lost = recovery(link, bytes, events);
  if (!link.shared) return t + air + link.oneWayS + lost;
  const start = Math.max(t, link.freeAt);
  const wait = start - t;
  if (wait > link.backlogPeakS) link.backlogPeakS = wait;
  link.freeAt = start + air;
  link.busyS += air;
  return link.freeAt + link.oneWayS + lost;
}

/** Bytes a client uploads to ask one question. */
export function requestBytes(link, req) {
  const p = link.proto;
  const tokens = p.resendsHistory ? req.history + req.prompt : req.prompt;
  return p.reqBytes + tokens * BYTES_PER_TOKEN;
}

/**
 * Bytes and events for a streamed burst of `k` tokens produced over
 * `spanS` seconds. Coalescing protocols send one event per interval.
 */
export function streamBurst(link, k, spanS) {
  const p = link.proto;
  const events = p.coalesceMs > 0 ? Math.max(1, Math.ceil((spanS * 1000) / p.coalesceMs)) : k;
  const capped = Math.min(events, k);
  return { bytes: k * BYTES_PER_TOKEN + capped * p.eventBytes, events: capped };
}

/** Bytes of a whole, non-streamed answer. */
export function answerBytes(link, tokens) {
  const p = link.proto;
  const frame = p.id === 'mesh' ? p.eventBytes * Math.ceil((tokens * BYTES_PER_TOKEN) / link.mtu) : 350;
  return tokens * BYTES_PER_TOKEN + frame;
}

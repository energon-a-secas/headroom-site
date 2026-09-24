// ── Missions ─────────────────────────────────────────────────
// Each mission fixes the crowd and the goal; the player picks the box,
// model, precision and runtime. Stars:
//   1  the crowd is served: answers meet the goal, everyone can connect,
//      and the model is capable enough for the job (tier floor)
//   2  ...and the hardware fits the budget
//   3  ...and the hardware costs no more than par: the cheapest setup in the
//      catalog that serves this crowd, found by simulating every box, model
//      and server against it (prices as of the catalog date). Par is how
//      the game says "you did not buy a supercomputer you will not use".
//
// Groups use the same shape as a sandbox scenario, including `tweak`
// (per-mission persona changes, such as a slower answer target).

export const MISSIONS = [
  {
    id: 'bookclub', title: 'The e-ink book club',
    story: 'A library lends 50 Kindles loaded with the same reading list. Readers tap a word or a passage and ask the house AI about it. E-ink cannot stream, so the whole answer has to arrive and refresh within 20 seconds.',
    groups: [{ persona: 'reader', count: 50, client: 'kindle', link: 'wifi', distanceKm: 0.015 }],
    goal: 0.95, budget: 5000, minTier: 3.5, duration: 1200, par: 3500,
    hint: 'Answers are short and prompts share a system prompt. Prompt processing and a paged cache matter more than raw decode speed.',
  },
  {
    id: 'family', title: 'Family of five',
    story: 'Two parents chat from their phones, a teenager does homework on a laptop, and a kitchen speaker answers whoever walks by. Nobody should notice the others.',
    groups: [
      { persona: 'chat', count: 2, client: 'phone', link: 'wifi', distanceKm: 0.01 },
      { persona: 'student', count: 1, client: 'browser', link: 'wifi', distanceKm: 0.01, tweak: { burst: false, think: 60 } },
      { persona: 'voice', count: 2, client: 'speaker', link: 'wifiweak', distanceKm: 0.02 },
    ],
    goal: 0.95, budget: 3000, minTier: 3, duration: 1800, par: 2200,
    hint: 'The speaker needs its first word in 1.2 seconds even when the teenager is mid-essay.',
  },
  {
    id: 'crew', title: 'Coding crew',
    story: 'Six developers each run a coding agent against a shared box on the office LAN. Agents resend a long system prompt and every tool result, all day.',
    groups: [{ persona: 'coder', count: 6, client: 'ide', link: 'lan', distanceKm: 0 }],
    goal: 0.9, budget: 8000, minTier: 3.5, duration: 1800, par: 3500,
    hint: 'Contexts grow to tens of thousands of tokens. Watch the KV cache and the context window before the tokens per second.',
  },
  {
    id: 'bell', title: 'The classroom bell',
    story: 'Thirty students get the same exercise and press submit within twenty seconds of each other. Every answer must be on screen within a minute, every time the bell rings.',
    groups: [{ persona: 'student', count: 30, client: 'browser', link: 'wifi', distanceKm: 0.02 }],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1500, par: 3500,
    hint: 'Average load is low; the burst is what breaks boxes. Throughput at batch 30 is the number that matters.',
  },
  {
    id: 'butler', title: 'Voice butler',
    story: 'Eight smart speakers around a large house. Speech-to-text and text-to-speech run on the speakers; the box only has to start talking fast.',
    groups: [{ persona: 'voice', count: 8, client: 'speaker', link: 'wifi', distanceKm: 0.03 }],
    goal: 0.95, budget: 3000, minTier: 2, duration: 1200, par: 2200,
    hint: 'Only time to first token counts here. A small fast model on a modest box can beat a giant one.',
  },
  {
    id: 'cabin', title: 'Off-grid cabin over LoRa',
    story: 'Twelve hikers carry e-paper badges on a Meshtastic mesh, up to 5 km from a solar-powered cabin. Answers are kept to a sentence or two, and anything inside three minutes counts.',
    groups: [{ persona: 'chat', count: 12, client: 'badge', link: 'lora', protocol: 'mesh', distanceKm: 5,
      tweak: { output: 60, prefix: 200, history: false, think: 240, slo: { ttft: 0, tps: 0, e2e: 180 }, patience: 600 } }],
    goal: 0.95, budget: 2500, minTier: 2, duration: 3600, maxWatts: 60, par: 2200,
    hint: 'The radio is the bottleneck, not the box. Every packet costs airtime, so use compact packets, never token-by-token streaming.',
  },
  {
    id: 'remote', title: 'Team across an ocean',
    story: 'Eight people use the box in the office; twelve more reach it through a VPN from 9,000 km away. Everyone expects chat to feel local.',
    groups: [
      { persona: 'chat', count: 8, client: 'browser', link: 'lan', distanceKm: 0 },
      { persona: 'chat', count: 12, client: 'browser', link: 'vpn', distanceKm: 9000 },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1500, par: 3500,
    hint: 'Distance adds a fixed 100+ ms. The first-token target still leaves room, if the queue stays short.',
  },
  {
    id: 'archivist', title: 'Overnight archivist',
    story: 'A small firm wants 20,000 documents summarized before morning: ten hours, so at least 2,000 an hour, with nobody watching.',
    groups: [{ persona: 'batch', count: 24, client: 'ide', link: 'lan', distanceKm: 0 }],
    goal: 0.95, budget: 5000, minTier: 3, duration: 1200, perHour: 2000, par: 3500,
    hint: 'Pure throughput. Big batches, a paged runtime and a model that decodes cheaply per token.',
  },
  {
    id: 'office', title: 'Office of fifty',
    story: 'Fifty staff chat and search company documents over office Wi-Fi. You may buy more than one box.',
    groups: [
      { persona: 'chat', count: 35, client: 'browser', link: 'wifi', distanceKm: 0.02 },
      { persona: 'rag', count: 15, client: 'browser', link: 'wifi', distanceKm: 0.02 },
    ],
    goal: 0.95, budget: 12000, minTier: 3.5, duration: 1500, par: 3500,
    hint: 'Two boxes as replicas double throughput. Splitting one model across two only helps if it does not fit on one.',
  },
];

export const missionById = (id) => MISSIONS.find((m) => m.id === id) || MISSIONS[0];

/** Score a report against a mission. Returns stars (0 to 3) and the checks behind them. */
export function scoreMission(m, report) {
  const checks = [];
  if (!report.ok) {
    checks.push({ ok: false, text: report.fit?.reason || 'The model does not fit.' });
    return { stars: 0, checks };
  }
  const pass = report.passRate ?? 0;
  const served = report.unserved === 0;
  const tierOk = report.engine.tier >= m.minTier;
  let goalOk = pass >= m.goal && served;
  checks.push({ ok: pass >= m.goal, text: `${Math.round(pass * 100)}% of answers on target (goal ${Math.round(m.goal * 100)}%)` });
  if (!served) checks.push({ ok: false, text: `${report.unserved} users could not connect` });
  if (m.perHour) {
    const rate = report.groups.reduce((a, g) => a + g.perHour, 0);
    const ok = rate >= m.perHour;
    goalOk = goalOk && ok;
    checks.push({ ok, text: `${Math.round(rate).toLocaleString('en-US')} jobs an hour (goal ${m.perHour.toLocaleString('en-US')})` });
  }
  checks.push({ ok: tierOk, text: `Capability tier ${report.engine.tier.toFixed(1)} (needs ${m.minTier})` });
  if (m.maxWatts) {
    const ok = report.util.avgW <= m.maxWatts;
    goalOk = goalOk && ok;
    checks.push({ ok, text: `${Math.round(report.util.avgW)} W average draw (solar limit ${m.maxWatts} W)` });
  }
  const star1 = goalOk && tierOk;
  const budgetOk = report.engine.priceUsd <= m.budget;
  checks.push({ ok: budgetOk, text: `$${report.engine.priceUsd.toLocaleString('en-US')} of hardware (budget $${m.budget.toLocaleString('en-US')})` });
  const parOk = report.engine.priceUsd <= m.par;
  checks.push({ ok: parOk, text: `Par is $${m.par.toLocaleString('en-US')}: the cheapest hardware that serves this crowd` });
  const stars = star1 ? (budgetOk ? (parOk ? 3 : 2) : 1) : 0;
  return { stars, checks };
}

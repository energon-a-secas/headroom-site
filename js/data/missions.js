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
    goal: 0.95, budget: 5000, minTier: 3.5, duration: 1200, par: 2200,
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
    goal: 0.9, budget: 8000, minTier: 3.5, duration: 1800, par: 2200,
    hint: 'Contexts grow to tens of thousands of tokens. Watch the KV cache and the context window before the tokens per second.',
  },
  {
    id: 'bell', title: 'The classroom bell',
    story: 'Thirty students get the same exercise and press submit within twenty seconds of each other. Every answer must be on screen within a minute, every time the bell rings.',
    groups: [{ persona: 'student', count: 30, client: 'browser', link: 'wifi', distanceKm: 0.02 }],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1500, par: 2200,
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
    goal: 0.95, budget: 2500, minTier: 2, duration: 3600, maxWatts: 60, par: 700,
    hint: 'The radio is the bottleneck, not the box. Every packet costs airtime, so use compact packets, never token-by-token streaming.',
  },
  {
    id: 'remote', title: 'Team across an ocean',
    story: 'Eight people use the box in the office; twelve more reach it through a VPN from 9,000 km away. Everyone expects chat to feel local.',
    groups: [
      { persona: 'chat', count: 8, client: 'browser', link: 'lan', distanceKm: 0 },
      { persona: 'chat', count: 12, client: 'browser', link: 'vpn', distanceKm: 9000 },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1500, par: 2200,
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
  {
    id: 'house-is-the-prompt', title: 'The house is the prompt',
    story: 'A family runs Home Assistant with 150 devices exposed to its voice assistant: lights, blinds, locks, the heating and the living-room TV. Every voice command from the satellites in six rooms carries the whole device list as an 8,500-token system prompt, and four automations ask the model to decide things such as whether a doorbell ring is a delivery. The speakers should start talking within 1.2 seconds, and each automation needs its decision within 4.',
    groups: [
      { persona: 'voice',  count: 6,  client: 'speaker',  link: 'wifi',  distanceKm: 0.015,  tweak: { prefix: 8500 } },
      { persona: 'home',  count: 4,  client: 'ide',  link: 'lan',  distanceKm: 0,  tweak: { prefix: 2500,  think: 60 } },
    ],
    goal: 0.95, budget: 3000, minTier: 3, duration: 1800, par: 2200,
    hint: 'Look at the context window and prefix caching before the box. The device list is the same on every request.',
  },
  {
    id: 'ward-voice-badges', title: 'Voice badges on the ward',
    story: 'Thirty nurses on a surgical ward wear hands-free voice badges on the hospital Wi-Fi. They ask about a patient, such as when bed 12 last had pain relief, and the badge pulls about 1,500 tokens of that patient\'s recent chart into the question. Patient data cannot leave the building, and if the first word takes longer than 1.2 seconds the nurses walk back to the workstation.',
    groups: [
      { persona: 'voice',  count: 30,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { context: 1500,  think: 240 } },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1800, par: 3500,
    hint: 'Every question carries a chart, so prompt reading is on the voice path. Look at prompt speed, and at which servers compute in FP4 or FP8 on this box.',
  },
  {
    id: 'foreign-desk', title: 'The foreign desk',
    story: 'Ten journalists on a regional paper\'s foreign desk read the overseas press through the house model. Each drops in a 1,000-word article in German or Spanish, and the newsroom\'s translate button returns the whole English text in one piece rather than as a stream. They skim it and pull the next one, and nobody waits more than a minute for an article.',
    groups: [
      { persona: 'chat',  count: 10,  client: 'browser',  link: 'lan',  protocol: 'http',  distanceKm: 0,  tweak: { prompt: 1700,  output: 1300,  prefix: 900,  history: false,  turns: 1,  think: 60,  readTps: 7,  slo: { ttft: 0,  tps: 0,  e2e: 60 },  patience: 300 } },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1800, par: 2200,
    hint: 'One or two long answers are in flight at a time. One stream\'s speed is memory bandwidth over the bytes each token reads, and a batching server does not raise it.',
  },
  {
    id: 'fleet-two-satellites', title: 'Twenty ships, two satellites',
    story: 'A ship manager\'s shore office runs a box so officers can search the safety manual, port rules and charter clauses from the bridge. Ten ships now have Starlink; ten still use a geostationary VSAT link whose firewall opens a new TLS session for every question and returns the whole answer at once. An officer on the old link goes back to the paper binder if the answer takes more than ten seconds.',
    groups: [
      { persona: 'rag',  count: 20,  client: 'browser',  link: 'starlink',  distanceKm: 3000,  tweak: { think: 180 } },
      { persona: 'rag',  count: 20,  client: 'browser',  link: 'geo',  protocol: 'coldhttp',  distanceKm: 3000,  tweak: { think: 180,  slo: { ttft: 0,  tps: 0,  e2e: 10 } } },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1800, par: 3700,
    hint: 'On the old link three satellite round trips are spent before the box starts, and nothing shows until the last token. What is left of ten seconds goes to one stream\'s speed.',
  },
  {
    id: 'helpdesk-backfill', title: 'The backfill that ate the help desk',
    story: 'Twenty support agents ask the house model about the knowledge base all day. On Monday morning someone starts a backfill of 18,000 old tickets into knowledge-base drafts, with eight workers that each send the next ticket the moment the last one returns. The agents still expect their first word within 3 seconds.',
    groups: [
      { persona: 'rag',  count: 20,  client: 'browser',  link: 'lan',  distanceKm: 0 },
      { persona: 'batch',  count: 8,  client: 'ide',  link: 'lan',  distanceKm: 0,  tweak: { context: 2200,  prompt: 150,  prefix: 1200,  output: 250 } },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1800, par: 3500,
    hint: 'The backfill never pauses. A server that admits by slot hands the slots to whoever asks first, and the workers always ask first.',
  },
  {
    id: 'solar-school-lab', title: 'The solar-powered school lab',
    story: 'A rural secondary school with no grid power runs its computer lab from a solar array and a battery, and a donor grant pays for an offline AI tutor for 32 students. The teacher sets a new exercise every five minutes and every answer must be on screen within a minute. The battery can give the box only 35 W averaged over the school day.',
    groups: [
      { persona: 'student',  count: 32,  client: 'browser',  link: 'wifi',  distanceKm: 0.02 },
    ],
    goal: 0.95, budget: 4000, minTier: 3, duration: 1500, maxWatts: 35, par: 2200,
    hint: 'The box waits most of the day, so its idle draw sets the average. Check the watts before the speed, then give the burst enough slots.',
  },
  {
    id: 'six-language-guide', title: 'The six-language audio guide',
    story: 'A city museum rents audio-guide handsets that listen and speak, and on a Saturday afternoon about 100 visitors use them at once in six languages. Each language has its own 2,500-token guide prompt with the tour script, and every question also carries the label text of the object in front of the visitor. An answer that takes more than 1.2 seconds to start talking feels broken.',
    groups: [
      { persona: 'voice',  count: 36,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { prefix: 2500,  context: 500,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 18,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { prefix: 2500,  context: 500,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 14,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { prefix: 2500,  context: 500,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 12,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { prefix: 2500,  context: 500,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 10,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { prefix: 2500,  context: 500,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 10,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { prefix: 2500,  context: 500,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
    ],
    goal: 0.95, budget: 5000, minTier: 3, duration: 1800, par: 3500,
    hint: 'Six languages means six system prompts. Count how many the server can keep cached at once before you count visitors.',
  },
  {
    id: 'tier-floor-lab', title: 'The tier 4.5 proof lab',
    story: 'A university mathematics department gives 12 PhD students and postdocs a shared assistant for proofs and problem sets. Smaller models failed the department\'s own test set, so the floor is tier 4.5, and unpublished results must stay on campus. Answers run to 700 tokens, but people read them as they stream, so 6 tokens a second and a first word within 6 seconds is enough.',
    groups: [
      { persona: 'chat',  count: 12,  client: 'browser',  link: 'lan',  distanceKm: 0,  tweak: { prompt: 150,  output: 700,  think: 90,  slo: { ttft: 6,  tps: 6,  e2e: 0 },  patience: 180 } },
    ],
    goal: 0.95, budget: 10000, minTier: 4.5, duration: 1800, par: 7400,
    hint: 'Tier 4.5 decides the memory before the crowd decides anything. Then compare one big box with two smaller ones split.',
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
  // Every group must meet the goal on its own: an easy group's passes must
  // not hide a group that is failing.
  const lagging = report.groups.filter((g) => g.n > 0 && (g.passPct ?? 0) < m.goal);
  let goalOk = pass >= m.goal && served && !lagging.length;
  checks.push({ ok: pass >= m.goal, text: `${Math.round(pass * 100)}% of answers on target (goal ${Math.round(m.goal * 100)}%)` });
  for (const g of lagging) checks.push({ ok: false, text: `${g.count} x ${g.persona}: only ${Math.round((g.passPct ?? 0) * 100)}% on target` });
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

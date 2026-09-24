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

import { fmtTier } from '../engine/report.js';

export const MISSIONS = [
  {
    id: 'bookclub', title: 'The e-ink book club',
    story: 'A library lends 50 Kindles loaded with the same reading list. Readers tap a word or a passage and ask the house AI about it. E-ink cannot stream, so the whole answer has to arrive and refresh within 20 seconds.',
    groups: [{ persona: 'reader', count: 50, client: 'kindle', link: 'wifi', distanceKm: 0.015 }],
    goal: 0.95, budget: 5000, minTier: 3.5, duration: 1200, par: 2200,
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q3', kv: 'f16', runtime: 'llamacpp', overrides: { slots: 4, ctxPerSlot: 16384 } },
    hint: 'Nothing shows until the whole answer is written, so every token counts against the 20 seconds, including any hidden thinking a reasoning model writes first. Each question also carries a page of the book that no cache can skip.',
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
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'qwen3-30b-a3b', quant: 'q8', kv: 'f16', runtime: 'llamacpp', overrides: { slots: 4, ctxPerSlot: 16384 } },
    hint: 'The speaker needs its first word in 1.2 seconds even when the teenager is mid-essay. It cannot speak a reasoning model\'s hidden thinking, so that thinking and a 16-token speech buffer both come before the first word.',
  },
  {
    id: 'crew', title: 'Coding crew',
    story: 'Six developers each run a coding agent against a shared box on the office LAN. Agents resend a long system prompt and every tool result, all day.',
    groups: [{ persona: 'coder', count: 6, client: 'ide', link: 'lan', distanceKm: 0 }],
    goal: 0.9, budget: 8000, minTier: 3.5, duration: 1800, par: 2200,
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q3', kv: 'q4', runtime: 'llamacpp', overrides: { slots: 16, ctxPerSlot: 32768 } },
    hint: 'The system prompt and tools alone are 7,000 tokens, and contexts grow to tens of thousands. Check the context window first (Ollama\'s 8K default cuts the prompt and answers without its start), then the KV cache, then the tokens per second.',
  },
  {
    id: 'bell', title: 'The classroom bell',
    story: 'Thirty students get the same exercise and press submit within twenty seconds of each other. Every answer must be on screen within a minute, every time the bell rings.',
    groups: [{ persona: 'student', count: 30, client: 'browser', link: 'wifi', distanceKm: 0.02 }],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1500, par: 2200,
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q3', kv: 'f16', runtime: 'llamacpp', overrides: { slots: 4, ctxPerSlot: 16384 } },
    hint: 'Average load is low; the burst is what breaks boxes. Thirty answers of about 420 tokens must all be on screen within a minute of submit, so count the tokens a second the box delivers across the whole burst. A model that reasons first adds its thinking to every one of them.',
  },
  {
    id: 'butler', title: 'Voice butler',
    story: 'Eight smart speakers around a large house. Speech-to-text and text-to-speech run on the speakers; the box only has to start talking fast.',
    groups: [{ persona: 'voice', count: 8, client: 'speaker', link: 'wifi', distanceKm: 0.03 }],
    goal: 0.95, budget: 3000, minTier: 2, duration: 1200, par: 2200,
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'qwen3-30b-a3b', quant: 'q3', kv: 'q4', runtime: 'llamacpp', overrides: { slots: 4, ctxPerSlot: 16384 } },
    hint: 'Only the first word counts, and a speaker cannot say anything until the model has written its hidden thinking and 16 tokens of the answer. A small model that answers straight away on a modest box beats a giant one that reasons first.',
  },
  {
    id: 'cabin', title: 'Off-grid cabin over LoRa',
    story: 'Twelve hikers carry e-paper badges on a Meshtastic mesh, up to 5 km from a solar-powered cabin. Answers are kept to a sentence or two, and anything inside three minutes counts.',
    groups: [{ persona: 'chat', count: 12, client: 'badge', link: 'lora', protocol: 'mesh', distanceKm: 5,
      tweak: { output: 60, prefix: 200, history: false, think: 240, slo: { ttft: 0, tps: 0, e2e: 180 }, patience: 600 } }],
    goal: 0.95, budget: 2500, minTier: 2, duration: 3600, maxWatts: 60, par: 700,
    parSetup: { box: 'pi5', count: 2, mode: 'replica', model: 'qwen3-8b', quant: 'q3', kv: 'q4', runtime: 'llamacpp', overrides: { slots: 4, ctxPerSlot: 16384 } },
    hint: 'Every answer spends more than ten seconds on the radio whatever the box, and token-by-token streaming would jam the channel, so the badges use compact packets. Three minutes leaves the rest for the box, so a slow and frugal one can be enough.',
  },
  {
    id: 'remote', title: 'Team across an ocean',
    story: 'Eight people use the box in the office; twelve more reach it through a VPN from 9,000 km away. Everyone expects chat to feel local.',
    groups: [
      { persona: 'chat', count: 8, client: 'browser', link: 'lan', distanceKm: 0 },
      { persona: 'chat', count: 12, client: 'browser', link: 'vpn', distanceKm: 9000 },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1500, par: 2200,
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q3', kv: 'f16', runtime: 'llamacpp', overrides: { slots: 8, ctxPerSlot: 16384 } },
    hint: 'Distance adds a fixed 100+ ms. The first-token target still leaves room, if the queue stays short.',
  },
  {
    id: 'archivist', title: 'Overnight archivist',
    story: 'A small firm wants 20,000 documents summarized before morning: ten hours, so at least 2,000 an hour, with nobody watching.',
    groups: [{ persona: 'batch', count: 24, client: 'ide', link: 'lan', distanceKm: 0 }],
    goal: 0.95, budget: 5000, minTier: 3, duration: 1200, perHour: 2000, par: 3500,
    parSetup: { box: 'jetson-thor', count: 1, mode: 'replica', model: 'gpt-oss-20b', quant: 'mxfp4', kv: 'q8', runtime: 'trtllm', overrides: {} },
    hint: 'Pure throughput. Big batches, a paged runtime and a model that decodes cheaply per token. A model that always reasons also writes its hidden thinking for every document.',
  },
  {
    id: 'office', title: 'Office of fifty',
    story: 'Fifty staff chat and search company documents over office Wi-Fi. You may buy more than one box.',
    groups: [
      { persona: 'chat', count: 35, client: 'browser', link: 'wifi', distanceKm: 0.02 },
      { persona: 'rag', count: 15, client: 'browser', link: 'wifi', distanceKm: 0.02 },
    ],
    goal: 0.95, budget: 12000, minTier: 3.5, duration: 1500, par: 3500,
    parSetup: { box: 'jetson-thor', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q3', kv: 'q8', runtime: 'trtllm', overrides: {} },
    hint: 'Fifteen of the staff attach about 3,200 tokens of documents to every question, and no cache can skip them, so on a small box prompt reading runs out first. If you buy two boxes, compare a split pair with replicas: split, both chips read every prompt.',
  },
  {
    id: 'house-is-the-prompt', title: 'The house is the prompt',
    story: 'A family runs Home Assistant with 150 entities exposed to its voice assistant, from lights and locks to the thermostat, so every command from the speakers in six rooms carries the same 8,500-token system prompt of devices and tool definitions. Four automations share a different 2,500-token prompt and ask small questions from sensor readings, such as whether the washing machine\'s power draw means the cycle has finished. On a busy evening each room speaks every few minutes, the model calls a tool before it replies, and the family wants the first spoken word within 2 seconds and each automation\'s answer within 4 seconds.',
    groups: [
      { persona: 'voice',  count: 6,  client: 'speaker',  link: 'wifi',  distanceKm: 0.015,  tweak: { prefix: 8500,  lead: 56,  think: 300,  slo: { ttft: 2 } } },
      { persona: 'home',  count: 4,  client: 'ide',  link: 'lan',  distanceKm: 0,  tweak: { prefix: 2500,  think: 600,  slo: { ttft: 0 } } },
    ],
    goal: 0.95, budget: 3000, minTier: 3, duration: 3600, par: 2200,
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'qwen3-30b-a3b', quant: 'q8', kv: 'q8', runtime: 'llamacpp', overrides: { slots: 4, ctxPerSlot: 16384 } },
    hint: 'Home Assistant asks Ollama for an 8K context unless you raise it, and a prompt that does not fit is cut, not refused. The voice prompt and the automations\' prompt alternate all evening, so check whether the server can keep both cached at once.',
  },
  {
    id: 'ward-voice-badges', title: 'Voice badges on the ward',
    story: 'Six nurses work the morning medication round on a 30-bed surgical ward, each wearing a hands-free voice badge on the hospital Wi-Fi. Every few minutes a nurse asks something like when bed 12 last had pain relief; the hospital\'s badge server turns the speech into text, attaches about 1,500 tokens of that patient\'s recent chart, and speaks the answer back. Patient data cannot leave the building, and after 1.2 seconds of silence nurses start repeating the question over the answer.',
    groups: [
      { persona: 'voice',  count: 6,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  tweak: { context: 1500,  history: false,  turns: 1,  think: 180 } },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 3600, par: 4000,
    parSetup: { box: 'asus-gx10', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q4', kv: 'f16', runtime: 'trtllm', overrides: {} },
    hint: 'Like a smart speaker, a badge says nothing until the box has read the whole chart and written about 16 tokens for the speech engine, and it cannot speak a model\'s hidden thinking. Six nurses are not a crowd: watch prompt and generation speed under One user as you change the box and the server.',
  },
  {
    id: 'foreign-desk', title: 'The foreign desk',
    story: 'Ten journalists on a national daily\'s foreign desk spend the two hours before the morning news meeting reading the overseas press through the house model. Each drops in a German or Spanish article, usually about 1,000 words and sometimes twice that. The translate button asks for low reasoning effort and returns the whole English text in one piece rather than as a stream. A translation that takes more than 90 seconds counts as late, and because lines from these translations get quoted in print, the editor will not settle for a small model.',
    groups: [
      { persona: 'chat',  count: 10,  client: 'browser',  link: 'lan',  protocol: 'http',  distanceKm: 0,  tweak: { prompt: 1700,  output: 1300,  prefix: 900,  history: false,  turns: 1,  think: 60,  readTps: 7,  slo: { ttft: 0,  tps: 0,  e2e: 90 },  patience: 300 } },
    ],
    goal: 0.95, budget: 6000, minTier: 4, duration: 7200, par: 3500,
    parSetup: { box: 'jetson-thor', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q6', kv: 'f16', runtime: 'trtllm', overrides: {} },
    hint: 'About two long answers are in flight at a time, so a batching server has almost nothing to batch. Each token then costs the time to read the active weights plus the fixed time the server spends on every step, and at this load that second part is not small.',
  },
  {
    id: 'fleet-two-satellites', title: 'Twenty ships, two satellite links',
    story: 'A ship-management company runs a box in its shore office so the officers on its 20 ships, up to 3,000 km out, can search the safety manual, port rules and charter clauses. During a port-state inspection campaign two officers on every ship use it, each asking about once every quarter of an hour. Ten ships now have Starlink and read each answer as it streams in, with the first words due within 3 seconds. Ten still use a geostationary VSAT link whose scanning proxy opens a new TLS session for every question and holds the reply until all of it has arrived. An officer on the old link goes back to the paper binder if that takes more than 10 seconds.',
    groups: [
      { persona: 'rag',  count: 20,  client: 'browser',  link: 'starlink',  distanceKm: 3000,  tweak: { think: 900 } },
      { persona: 'rag',  count: 20,  client: 'browser',  link: 'geo',  protocol: 'coldhttp',  distanceKm: 3000,  tweak: { think: 900,  slo: { ttft: 0,  tps: 0,  e2e: 10 } } },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 3600, par: 3700,
    parSetup: { box: 'mac-m5max-128', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q3', kv: 'f16', runtime: 'llamacpp', overrides: { slots: 2, ctxPerSlot: 131072 } },
    hint: 'Round trips cost the old link about 1.8 of its 10 seconds. The rest goes to reading the prompt and writing every token, hidden thinking included, because the proxy shows nothing until the last one. The Starlink half still wants its first words within 3 seconds on 3,700-token questions.',
  },
  {
    id: 'helpdesk-backfill', title: 'The backfill that ate the help desk',
    story: 'Twenty support agents look things up in the knowledge base through the house model, each about once every four minutes, on a box running llama.cpp with its default four slots. It kept up for months. On Monday morning someone starts a backfill that turns last year\'s closed tickets into knowledge-base drafts, with eight workers that each send the next ticket the moment the previous one comes back. The agents still expect their first word within 3 seconds.',
    groups: [
      { persona: 'rag',  count: 20,  client: 'browser',  link: 'lan',  distanceKm: 0,  tweak: { think: 180 } },
      { persona: 'batch',  count: 8,  client: 'ide',  link: 'lan',  distanceKm: 0,  tweak: { context: 2200,  prompt: 150,  prefix: 1200,  output: 250 } },
    ],
    goal: 0.95, budget: 6000, minTier: 3.5, duration: 1800, par: 3500,
    parSetup: { box: 'jetson-thor', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q3', kv: 'q8', runtime: 'trtllm', overrides: {} },
    hint: 'The backfill never pauses. Eight workers on four slots always leave tickets waiting, and each agent question joins the back of that line. More places end the wait but not the sharing: every ticket is a long prompt read in the same passes as the agents\' questions, so check the agents\' own score, not the average.',
  },
  {
    id: 'solar-school-lab', title: 'The solar-powered school lab',
    story: 'A rural secondary school with no grid power wants an offline AI tutor for a class of 36, paid for by a $5,000 donor grant. The teacher sets a new exercise every five minutes, the whole class submits within about 20 seconds, and every answer must be complete on screen within a minute. The tutor box has its own solar panel and battery, which can spare about 240 Wh a day: 30 W averaged over the eight-hour school day, with the box shut down after the last lesson.',
    groups: [
      { persona: 'student',  count: 36,  client: 'browser',  link: 'wifi',  distanceKm: 0.02 },
    ],
    goal: 0.95, budget: 5000, minTier: 3, duration: 1500, maxWatts: 30, par: 2200,
    parSetup: { box: 'mac-mini-m5pro', count: 1, mode: 'replica', model: 'gpt-oss-20b', quant: 'mxfp4', kv: 'f16', runtime: 'llamacpp', overrides: { slots: 8, ctxPerSlot: 16384 } },
    hint: 'Between exercises the box sits waiting, so its idle draw is a floor under the average and busy time adds to it. Check that floor before the speed, then give the burst enough slots: answering a queue a few at a time keeps the box busy longer.',
  },
  {
    id: 'six-language-guide', title: 'The six-language audio guide',
    story: 'A city museum rents audio-guide handsets that listen and speak, and on a Saturday afternoon 100 visitors use them at once: 36 in English, 18 in Spanish, 14 in French, 12 in German, 10 in Japanese and 10 in Mandarin. Each language has its own 2,500-token guide prompt, a tour script the curators approved word for word, so the six cannot be merged into one. Every question also carries the wall label of the object in front of the visitor, and the galleries have several Wi-Fi access points. An answer that takes more than 1.2 seconds to start talking feels broken, and the handset\'s own speech processing uses about half a second of that.',
    groups: [
      { persona: 'voice',  count: 36,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  prefixId: 'guide-en',  tweak: { prefix: 2500,  context: 180,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 18,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  prefixId: 'guide-es',  tweak: { prefix: 2500,  context: 180,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 14,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  prefixId: 'guide-fr',  tweak: { prefix: 2500,  context: 180,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 12,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  prefixId: 'guide-de',  tweak: { prefix: 2500,  context: 180,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 10,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  prefixId: 'guide-ja',  tweak: { prefix: 2500,  context: 180,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
      { persona: 'voice',  count: 10,  client: 'speaker',  link: 'wifi',  distanceKm: 0.03,  prefixId: 'guide-zh',  tweak: { prefix: 2500,  context: 180,  prompt: 30,  output: 90,  turns: 5,  think: 120,  patience: 10 } },
    ],
    goal: 0.95, budget: 5000, minTier: 3, duration: 1800, par: 3700,
    parSetup: { box: 'mac-m5max-128', count: 1, mode: 'replica', model: 'qwen3-next-80b', quant: 'q2', kv: 'q8', runtime: 'llamacpp', overrides: { slots: 8, ctxPerSlot: 16384 } },
    hint: 'Six languages means six tour scripts, and a server caches each one on its own. Check how much of each prompt comes from cache, then how fast the box writes the 16 tokens the speech engine needs before it can talk.',
  },
  {
    id: 'tier-floor-lab', title: 'The law faculty\'s drafting assistant',
    story: 'A law faculty gives 12 researchers a shared assistant for drafting opinions and translating judgments between Spanish, Catalan and Portuguese, and case files cannot leave the building. On the faculty\'s own test set the 100B-class models slipped on non-English legal terms, and so did the big ones cut to low precision, so nothing under capability tier 4.5 will do. On a busy afternoon all twelve are drafting at once. Each question carries the passage being worked on, drafts run to about 500 words, and people read them as they stream, so the first word within 6 seconds is enough.',
    groups: [
      { persona: 'chat',  count: 12,  client: 'browser',  link: 'lan',  distanceKm: 0,  tweak: { prompt: 150,  context: 800,  prefix: 600,  output: 700,  turns: 4,  think: 300,  readTps: 5,  slo: { ttft: 6,  tps: 8,  e2e: 0 },  patience: 180 } },
    ],
    goal: 0.95, budget: 10000, minTier: 4.5, duration: 3600, par: 7400,
    parSetup: { box: 'mac-m5max-128', count: 2, mode: 'split', model: 'qwen3-235b-a22b', quant: 'q6', kv: 'q4', runtime: 'llamacpp', overrides: { slots: 8, ctxPerSlot: 16384 } },
    hint: 'Tier 4.5 sets the memory before the crowd sets anything, and a lower precision lowers the tier. Then compare one big box with two smaller ones split, and check what each leaves for the KV cache.',
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
  // A 94.7% must not print as the 95% it missed.
  const shown = pass < m.goal && Math.round(pass * 100) >= Math.round(m.goal * 100) ? (pass * 100).toFixed(1) : Math.round(pass * 100);
  checks.push({ ok: pass >= m.goal, text: `${shown}% of answers on target (goal ${Math.round(m.goal * 100)}%)` });
  for (const g of lagging) checks.push({ ok: false, text: `${g.count} x ${g.persona}: only ${Math.round((g.passPct ?? 0) * 100)}% on target` });
  if (!served) checks.push({ ok: false, text: `${report.unserved} users could not connect` });
  if (m.perHour) {
    const rate = report.groups.reduce((a, g) => a + g.perHour, 0);
    const ok = rate >= m.perHour;
    goalOk = goalOk && ok;
    checks.push({ ok, text: `${Math.round(rate).toLocaleString('en-US')} jobs an hour (goal ${m.perHour.toLocaleString('en-US')})` });
  }
  checks.push({ ok: tierOk, text: `Capability tier ${fmtTier(report.engine.tier)} (needs ${m.minTier})` });
  if (m.maxWatts) {
    const ok = report.util.avgW <= m.maxWatts;
    goalOk = goalOk && ok;
    checks.push({ ok, text: `${Math.round(report.util.avgW)} W average draw (solar limit ${m.maxWatts} W)` });
  }
  const star1 = goalOk && tierOk;
  const budgetOk = report.engine.priceUsd <= m.budget;
  checks.push({ ok: budgetOk, text: `$${report.engine.priceUsd.toLocaleString('en-US')} of hardware (budget $${m.budget.toLocaleString('en-US')})` });
  const parOk = star1 && report.engine.priceUsd <= m.par;
  checks.push({ ok: parOk, text: `Par is $${m.par.toLocaleString('en-US')}: the cheapest hardware that serves this crowd` });
  const stars = star1 ? (budgetOk ? (parOk ? 3 : 2) : 1) : 0;
  return { stars, checks };
}

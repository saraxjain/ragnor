// AI case conference: three specialist agents review an athlete in parallel, a lead agent reconciles them into
// one plan, and a safety-reviewer agent checks the plan before a human signs off.
// Engine: Google Agent Development Kit (SequentialAgent[ ParallelAgent[specialists], lead, safety ]) on Gemini.
// Without a key (or if ADK fails) the same structure is produced by deterministic offline reasoning.
import library from "../shared/evidence/library.json" with { type: "json" };
import { sanitizeDeep, findViolations } from "../shared/lib/index.ts";
import { compareToBaseline } from "../shared/lib/baseline.ts";
import { config, live } from "./config.ts";
import { audit, getAthlete, type Athlete } from "./store.ts";
import { scoreAthlete } from "./risk.ts";

export type Status = "concern" | "watch" | "clear";
export interface Finding {
  agent: "load" | "recovery" | "movement";
  status: Status;
  summary: string;
  evidence: { kind: "data" | "literature"; ref: string; detail: string }[];
  recommendation: string;
  confidence: number;
}
export interface Plan {
  priority: "today" | "this_week" | "routine";
  headline: string;
  actions: { owner: "coach" | "athlete" | "trainer" | "clinician" | "parent"; action: string }[];
  disagreements: string[];
}
export interface SafetyReview {
  verdict: "approved" | "revised";
  checks: { name: string; passed: boolean; note: string }[];
}
export interface Vote { agent: Finding["agent"]; vote: "approve" | "object"; reason: string }
export interface DebateRound { round: number; votes: Vote[]; revision?: string }
export interface CaseReview {
  athlete_id: string;
  created_at: string;
  engine: "adk" | "offline";
  findings: Finding[];
  plan: Plan;
  debate: DebateRound[];
  consensus: "unanimous" | "after_revision" | "none";
  safety: SafetyReview;
  signoff?: { by: string; at: string; decision: "accepted" | "edited" | "rejected"; note?: string };
}

const g = globalThis as unknown as { __ragnorCases?: Map<string, CaseReview> };
const cases = () => (g.__ragnorCases ??= new Map());
export const getCase = (id: string) => cases().get(id);

const LIB = library.entries;
const libFor = (domain: string) => LIB.filter((e) => e.domain.includes(domain)).map((e) => `${e.id}: ${e.title} (${e.source}). ${e.key_point}`).join("\n");

// ---------- evidence pack (what every agent sees) ----------
export function evidencePack(a: Athlete) {
  const m = scoreAthlete(a);
  const today = a.checkins.find((c) => c.date === a.risk_today.date);
  return {
    athlete: { id: a.id, first_name: a.name.split(" ")[0], sport: a.sport },
    model: { risk_7d_pct: Math.round(m.risk_7d * 1000) / 10, tier: m.tier, drivers: m.top_drivers.map((d) => `${d.label} = ${d.value}`) },
    features: m.features,
    rules_flags: a.risk_today.flags.map((f) => `${f.rule_id}: ${f.reason}`),
    wearable: a.wearable.recent.length ? compareToBaseline(a.wearable.recent, a.wearable.baseline) : null,
    today_checkin: today ? { sleep_h: today.sleep_h, load_min: today.load_min, intensity: today.intensity, soreness: today.soreness, meals: today.meals, symptoms: today.symptoms, red_flags: today.red_flags } : null,
    landing: a.landing ? { errors: a.landing.result.items.filter((i) => i.present && i.confidence >= 0.5).map((i) => `${i.id} (${i.side}, ${i.timestamp_s}s)`), band: a.landing.score.band } : null,
  };
}

const AGENTS = ["load", "recovery", "movement"] as const;
export const AGENT_LABEL: Record<Finding["agent"], string> = { load: "training load", recovery: "recovery", movement: "movement" };

// ---------- offline reasoning (deterministic, same output shape) ----------
function offlineFindings(a: Athlete): Finding[] {
  const p = evidencePack(a);
  const f = p.features;
  const dataLines = (ev: Finding["evidence"]) => ev.filter((e) => e.kind === "data").map((e) => e.detail.toLowerCase()).join("; ");

  const ldEv: Finding["evidence"] = [];
  let ld = 0;
  if (f.acwr >= 1.3) { ld += 2; ldEv.push({ kind: "data", ref: "acwr", detail: `Acute:chronic workload ratio ${f.acwr} (this week vs last 4)` }, { kind: "literature", ref: "E7", detail: "Load spikes relative to preparation raise injury risk" }); }
  if (f.monotony >= 2.5) { ld += 1; ldEv.push({ kind: "data", ref: "monotony", detail: `Training monotony ${f.monotony}` }, { kind: "literature", ref: "E10", detail: "High monotony with high load linked to overtraining" }); }
  if (f.acwr < 0.8) ldEv.push({ kind: "data", ref: "acwr", detail: `Load is below usual (ACWR ${f.acwr}); fitness can be built back gradually` });
  const load: Finding = {
    agent: "load",
    status: ld >= 2 ? "concern" : ld >= 1 ? "watch" : "clear",
    summary: ld ? `Training load is ahead of preparation: ${dataLines(ldEv)}.` : "Training load is in this athlete's usual range.",
    evidence: ldEv.length ? ldEv : [{ kind: "data", ref: "acwr", detail: `ACWR ${f.acwr}, monotony ${f.monotony}` }],
    recommendation: ld >= 2 ? "Cap this week's minutes at last week's level; no new high-intensity blocks." : ld ? "Keep load steady this week and vary hard and easy days." : "Keep training as planned; build gradually toward game day.",
    confidence: 0.7,
  };

  const rcEv: Finding["evidence"] = [];
  let rc = 0;
  if (f.sleep_debt_3d >= 3 || f.sleep_avg_7d < 7) { rc += 2; rcEv.push({ kind: "data", ref: "sleep", detail: `Sleep ${f.sleep_avg_7d} h avg, ${f.sleep_debt_3d} h debt over 3 nights` }, { kind: "literature", ref: "E8", detail: "Under 8 h sleep linked to more injuries in adolescents" }); }
  if (f.hrv_z <= -1.5 || f.rhr_delta >= 5) { rc += 2; rcEv.push({ kind: "data", ref: "wearable", detail: `HRV ${f.hrv_z} SD vs personal baseline, resting HR +${f.rhr_delta} bpm` }, { kind: "literature", ref: "E5", detail: "HRV vs personal baseline reflects incomplete recovery" }); }
  if (f.under_fueled) { rc += 1; rcEv.push({ kind: "data", ref: "meals", detail: "1 or fewer meals on a hard day" }, { kind: "literature", ref: "E11", detail: "Under-fueling impairs recovery" }); }
  const recovery: Finding = {
    agent: "recovery",
    status: rc >= 3 ? "concern" : rc >= 1 ? "watch" : "clear",
    summary: rc ? `Body isn't recovering between sessions: ${dataLines(rcEv)}.` : "Sleep, wearable recovery and fueling look normal for this athlete.",
    evidence: rcEv.length ? rcEv : [{ kind: "data", ref: "features", detail: `Sleep ${f.sleep_avg_7d} h, HRV ${f.hrv_z} SD` }],
    recommendation: rc >= 3 ? "Make today a light session (about a third less, no sprints) and protect 8+ hours of sleep for 3 nights." : rc ? "Prioritize sleep and a full meal before practice." : "No change needed.",
    confidence: a.wearable.recent.length ? 0.75 : 0.55,
  };

  const mvEv: Finding["evidence"] = [];
  let mv = 0;
  if (f.landing_errors >= 3) { mv += 2; mvEv.push({ kind: "data", ref: "landing", detail: `${f.landing_errors} landing errors: ${p.landing?.errors.join(", ")}` }, { kind: "literature", ref: "E2", detail: "LESS-style errors reflect ACL-injury mechanics" }, { kind: "literature", ref: "E3", detail: "Neuromuscular training reduces ACL injuries" }); }
  if (f.soreness_max >= 2) { mv += f.soreness_max >= 3 ? 3 : 1; mvEv.push({ kind: "data", ref: "soreness", detail: `Worst soreness ${f.soreness_max}/3 today${p.today_checkin?.soreness.length ? ` (${p.today_checkin.soreness.map((x) => x.area.replaceAll("_", " ")).join(", ")})` : ""}` }); }
  if (f.soreness_days_3d >= 2) { mv += 1; mvEv.push({ kind: "data", ref: "soreness_days", detail: `Sore ${f.soreness_days_3d} of the last 3 days` }); }
  const movement: Finding = {
    agent: "movement",
    status: mv >= 3 ? "concern" : mv >= 1 ? "watch" : "clear",
    summary: mv ? `Movement risk: ${dataLines(mvEv)}.` : "No movement or soreness concerns in current data.",
    evidence: mvEv.length ? mvEv : [{ kind: "data", ref: "landing", detail: a.landing ? `Last screen: ${a.landing.score.score} errors` : "No landing screen yet" }],
    recommendation: f.soreness_max >= 3 ? "Hold out of jumping and sprinting today; a clinician should look if it persists." : f.landing_errors >= 3 ? "Add the FixPlan warm-up before every practice and re-film a landing in 7 days." : mv ? "Extra warm-up for the sore area; tell the coach if it gets worse." : "Continue normal warm-up.",
    confidence: a.landing ? 0.7 : 0.5,
  };
  return [load, recovery, movement];
}

function offlinePlan(a: Athlete, findings: Finding[]): Plan {
  const first = a.name.split(" ")[0];
  const by = (k: Finding["agent"]) => findings.find((f) => f.agent === k)!;
  const concerns = findings.filter((f) => f.status === "concern");
  const watches = findings.filter((f) => f.status === "watch");
  // The lead writes a short plan: the training-load call first (coaches plan sessions around it), plus the single most urgent other item.
  const actions: Plan["actions"] = [{ owner: "coach", action: by("load").recommendation }];
  const other = [...concerns, ...watches].filter((f) => f.agent !== "load")[0];
  if (other && !/^No change|^Continue/.test(other.recommendation)) actions.push({ owner: other.agent === "movement" && other.recommendation.includes("FixPlan") ? "athlete" : "coach", action: other.recommendation });
  return {
    priority: concerns.length >= 2 ? "today" : concerns.length || watches.length ? "this_week" : "routine",
    headline: concerns.length ? `${first}: ${concerns.map((c) => AGENT_LABEL[c.agent]).join(" + ")} concern${concerns.length > 1 ? "s" : ""}` : watches.length ? `${first}: keep an eye on ${watches.map((w) => AGENT_LABEL[w.agent]).join(", ")}` : `${first}: nothing needs attention`,
    actions,
    disagreements: [],
  };
}

// ---------- debate: each specialist votes on the lead's plan; objections trigger one revision round ----------
const RANK = { routine: 0, this_week: 1, today: 2 } as const;
const NEED: Record<Status, Plan["priority"]> = { concern: "this_week", watch: "routine", clear: "routine" };
const keyWords = (t: string) => t.toLowerCase().match(/[a-z]{6,}/g)?.slice(0, 6) ?? [];
const KEEPS_PUSHING = /keep training as planned|keep load steady|build gradually/i;
function offlineVote(f: Finding, plan: Plan): Vote {
  if (RANK[plan.priority] < RANK[NEED[f.status]]) return { agent: f.agent, vote: "object", reason: `Priority "${plan.priority.replace("_", " ")}" is too low for a ${AGENT_LABEL[f.agent]} concern.` };
  if (f.status === "concern" && f.agent !== "load") {
    const push = plan.actions.find((x) => KEEPS_PUSHING.test(x.action));
    if (push) return { agent: f.agent, vote: "object", reason: f.agent === "recovery" ? `"${push.action}" doesn't fit a body that isn't recovering (${f.summary.replace(/^Body isn't recovering between sessions: /, "").replace(/\.$/, "")}). Today should be lighter.` : `"${push.action}" conflicts with today's pain. ${f.summary} Training should change today, not just get a note.` };
  }
  if (f.status === "concern") {
    const planText = plan.actions.map((x) => x.action).join(" ").toLowerCase();
    if (!keyWords(f.recommendation).some((w) => planText.includes(w))) return { agent: f.agent, vote: "object", reason: `Plan leaves out my recommendation: ${f.recommendation}` };
  }
  return { agent: f.agent, vote: "approve", reason: f.status === "clear" ? "Nothing in my area; no objection." : "My concern is addressed." };
}
function offlineRevise(plan: Plan, findings: Finding[], votes: Vote[]): { plan: Plan; note: string } {
  const p: Plan = JSON.parse(JSON.stringify(plan));
  const changes: string[] = [];
  for (const v of votes.filter((x) => x.vote === "object")) {
    const f = findings.find((x) => x.agent === v.agent)!;
    if (RANK[p.priority] < RANK[NEED[f.status]]) { p.priority = NEED[f.status]; changes.push(`raised priority to ${p.priority.replace("_", " ")}`); }
    const i = p.actions.findIndex((x) => KEEPS_PUSHING.test(x.action));
    if (f.agent !== "load" && i >= 0) {
      p.actions[i] = { owner: "coach", action: `${f.recommendation} ${f.agent === "recovery" ? "Resume the planned build once sleep and HRV are back near normal." : "Resume the planned build once the athlete reports no pain."}` };
      p.actions = p.actions.filter((x, j) => j === i || x.action !== f.recommendation);
      changes.push(`replaced the training-load action with the ${AGENT_LABEL[f.agent]} agent's plan for today`);
      p.disagreements.push(`Training-load agent wanted to keep building; ${AGENT_LABEL[f.agent]} agent objected (${f.agent === "recovery" ? "recovery data below normal" : "pain today"}). Lead sided with ${AGENT_LABEL[f.agent]} for today and kept the build for later in the week.`);
      continue;
    }
    if (!p.actions.some((a) => a.action.startsWith(f.recommendation.slice(0, 30)))) { p.actions.push({ owner: f.agent === "movement" && f.recommendation.includes("FixPlan") ? "athlete" : "coach", action: f.recommendation }); changes.push(`added the ${AGENT_LABEL[f.agent]} agent's action`); }
    p.disagreements.push(`${AGENT_LABEL[f.agent]} agent objected: ${v.reason}`);
  }
  return { plan: p, note: `Lead revised the plan: ${changes.join("; ") || "clarified wording"}.` };
}

/** The safety reviewer always runs in code too, whatever the engine: it can only make the plan more conservative. */
function safetyReview(a: Athlete, findings: Finding[], plan: Plan, llmNotes: SafetyReview["checks"] = []): { plan: Plan; safety: SafetyReview } {
  const checks: SafetyReview["checks"] = [...llmNotes];
  let revised = false;
  const text = JSON.stringify(plan) + JSON.stringify(findings);
  const violations = findViolations(text);
  checks.push({ name: "No diagnosis or clearance language", passed: violations.length === 0, note: violations.length ? `Removed: ${violations.join(", ")}` : "Clean" });
  if (violations.length) revised = true;
  const emergency = a.risk_today.flags.some((x) => x.rule_id === "R8_red_flag");
  const severe = a.risk_today.flags.some((x) => x.rule_id === "R4_severe_soreness");
  const needsClinician = emergency || severe;
  const hasClinician = plan.actions.some((x) => x.owner === "clinician" || /clinician/i.test(x.action));
  checks.push({ name: "Emergency sign or severe pain routed to a clinician", passed: !needsClinician || hasClinician, note: needsClinician ? (hasClinician ? "Present" : "Added clinician referral") : "Not applicable" });
  if (needsClinician && !hasClinician) { plan.actions.unshift({ owner: "clinician", action: emergency ? "Emergency sign reported in today's check-in: contact a parent now and get medical care." : "Have a clinician look at the severe soreness before full practice." }); revised = true; }
  if (needsClinician && plan.priority !== "today") { plan.priority = "today"; revised = true; checks.push({ name: "Priority raised to today", passed: false, note: emergency ? "An emergency sign always means today" : "Severe pain means a person looks today" }); }
  const cited = findings.every((f) => f.evidence.length > 0);
  checks.push({ name: "Every finding cites evidence", passed: cited, note: cited ? "Yes" : "Missing evidence on a finding" });
  checks.push({ name: "Human sign-off required before anyone is contacted", passed: true, note: "Enforced by the approval queue" });
  return { plan: sanitizeDeep(plan), safety: { verdict: revised ? "revised" : "approved", checks } };
}

// ---------- ADK engine ----------
const FINDING_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["concern", "watch", "clear"] },
    summary: { type: "STRING" },
    evidence: { type: "ARRAY", items: { type: "OBJECT", properties: { kind: { type: "STRING", enum: ["data", "literature"] }, ref: { type: "STRING" }, detail: { type: "STRING" } }, required: ["kind", "ref", "detail"] } },
    recommendation: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["status", "summary", "evidence", "recommendation", "confidence"],
};
const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    priority: { type: "STRING", enum: ["today", "this_week", "routine"] },
    headline: { type: "STRING" },
    actions: { type: "ARRAY", items: { type: "OBJECT", properties: { owner: { type: "STRING", enum: ["coach", "athlete", "trainer", "clinician", "parent"] }, action: { type: "STRING" } }, required: ["owner", "action"] } },
    disagreements: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["priority", "headline", "actions", "disagreements"],
};
const SAFETY_SCHEMA = {
  type: "OBJECT",
  properties: { checks: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, passed: { type: "BOOLEAN" }, note: { type: "STRING" } }, required: ["name", "passed", "note"] } } },
  required: ["checks"],
};

const VOTE_SCHEMA = { type: "OBJECT", properties: { vote: { type: "STRING", enum: ["approve", "object"] }, reason: { type: "STRING" } }, required: ["vote", "reason"] };
const RULES = "Rules: you support a high school coach with no athletic trainer. Use only the evidence pack and the evidence library. Cite data fields (kind=data, ref=field name) and library ids (kind=literature, ref like E7). Never diagnose, never say an athlete is cleared, fine or safe to play. Be specific and brief. Return only JSON matching the schema.";

async function runAdk(a: Athlete): Promise<{ findings: Finding[]; plan: Plan; debate: DebateRound[]; llmChecks: SafetyReview["checks"] }> {
  const { LlmAgent, ParallelAgent, SequentialAgent, InMemoryRunner } = await import("@google/adk");
  const spec = (name: Finding["agent"], focus: string, domains: string[]) =>
    new LlmAgent({
      name: `${name}_agent`,
      model: config.geminiModel,
      description: focus,
      instruction: `You are the ${focus} specialist in a sports-medicine case conference.\n${RULES}\nEvidence library:\n${domains.map(libFor).join("\n")}`,
      outputSchema: FINDING_SCHEMA as never,
      outputKey: `${name}_finding`,
      generateContentConfig: { temperature: 0.2 },
    });
  const specialists = new ParallelAgent({
    name: "specialists",
    subAgents: [
      spec("load", "training load (acute:chronic workload, monotony, session minutes); you lean toward building fitness for game day unless data say otherwise", ["load"]),
      spec("recovery", "recovery: sleep, wearable HRV and resting heart rate vs the athlete's own baseline, and fueling", ["recovery"]),
      spec("movement", "movement quality (landing mechanics) and musculoskeletal soreness", ["movement"]),
    ],
  });
  const lead = new LlmAgent({
    name: "lead_trainer_agent",
    model: config.geminiModel,
    instruction: `You are the lead athletic trainer chairing the case conference. Reconcile the three specialist findings into one plan: a priority, a one-line headline, concrete actions with owners, and any disagreements between specialists and how you resolved them (when in doubt, be conservative).\nTraining load: {load_finding}\nRecovery: {recovery_finding}\nMovement: {movement_finding}\n${RULES}`,
    outputSchema: PLAN_SCHEMA as never,
    outputKey: "plan",
    generateContentConfig: { temperature: 0.2 },
  });
  const safety = new LlmAgent({
    name: "safety_reviewer_agent",
    model: config.geminiModel,
    instruction: `You are a clinical safety reviewer. Check the plan for: diagnosis or clearance language, missing clinician referral for any emergency sign or severe pain, actions not supported by cited evidence, and anything a high school coach should not do alone. Report each check.\nPlan: {plan}\nFindings: {load_finding} {recovery_finding} {movement_finding}\n${RULES}`,
    outputSchema: SAFETY_SCHEMA as never,
    outputKey: "safety",
    generateContentConfig: { temperature: 0 },
  });
  const voters = (round: number, planKey: string) =>
    new ParallelAgent({
      name: `vote_round_${round}`,
      subAgents: AGENTS.map((k) =>
        new LlmAgent({
          name: `${k}_voter_${round}`,
          model: config.geminiModel,
          instruction: `You are the ${AGENT_LABEL[k]} specialist. Your finding: {${k}_finding}. The lead's plan: {${planKey}}. Vote "approve" only if the plan's priority and actions adequately handle your finding; otherwise "object" and say exactly what must change. Be strict about safety, not about wording.\n${RULES}`,
          outputSchema: VOTE_SCHEMA as never,
          outputKey: `vote_${round}_${k}`,
          generateContentConfig: { temperature: 0 },
        }),
      ),
    });
  const reviser = new LlmAgent({
    name: "lead_revision_agent",
    model: config.geminiModel,
    instruction: `You are the lead athletic trainer. Specialists voted on your plan {plan}. Votes: training load {vote_1_load}, recovery {vote_1_recovery}, movement {vote_1_movement}. If anyone objected, revise the plan to address every objection (record each in disagreements with how you resolved it). If all approved, return the plan unchanged.\n${RULES}`,
    outputSchema: PLAN_SCHEMA as never,
    outputKey: "plan_revised",
    generateContentConfig: { temperature: 0.2 },
  });
  const run = async (agent: InstanceType<typeof SequentialAgent>, seed: Record<string, unknown>, text: string) => {
    const runner = new InMemoryRunner({ agent, appName: "ragnor" });
    const state: Record<string, unknown> = { ...seed };
    let err = "";
    const ctx = Object.keys(seed).length ? `\nPrior state:\n${JSON.stringify(seed)}` : "";
    for await (const ev of runner.runEphemeral({ userId: a.id, stateDelta: seed, newMessage: { role: "user", parts: [{ text: text + ctx }] } } as never)) {
      const e = ev as { errorCode?: string; errorMessage?: string; actions?: { stateDelta?: Record<string, unknown> } };
      if (e.errorCode || e.errorMessage) err = `${e.errorCode ?? ""} ${e.errorMessage ?? ""}`;
      Object.assign(state, e.actions?.stateDelta ?? {});
    }
    if (err) throw new Error(`ADK: ${err}`);
    return state;
  };
  const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  const pack = `Evidence pack:\n${JSON.stringify(evidencePack(a))}`;
  // Round 1: specialists in parallel -> lead plan -> specialists vote in parallel
  const st = await run(new SequentialAgent({ name: "case_conference", subAgents: [specialists, lead, voters(1, "plan")] }), {}, pack);
  const findings = AGENTS.map((k) => ({ agent: k, ...(parse(st[`${k}_finding`]) as Omit<Finding, "agent">) }));
  if (findings.some((f) => !f.status)) throw new Error("ADK: missing specialist output");
  const votesOf = (r: number, s: Record<string, unknown>): Vote[] => AGENTS.map((k) => ({ agent: k, ...(parse(s[`vote_${r}_${k}`]) as Omit<Vote, "agent">) }));
  const debate: DebateRound[] = [{ round: 1, votes: votesOf(1, st) }];
  let plan = parse(st.plan) as Plan;
  let s2 = st;
  if (debate[0].votes.some((v) => v.vote === "object")) {
    // Round 2: lead revises, specialists vote again
    s2 = await run(new SequentialAgent({ name: "revision", subAgents: [reviser, voters(2, "plan_revised")] }), Object.fromEntries(Object.entries(st).filter(([k]) => /finding|plan|vote_1/.test(k))), pack);
    plan = parse(s2.plan_revised) as Plan;
    debate[0].revision = "Lead revised the plan to address the objections.";
    debate.push({ round: 2, votes: votesOf(2, s2) });
  }
  const s3 = await run(new SequentialAgent({ name: "safety", subAgents: [safety] }), { ...Object.fromEntries(Object.entries(st).filter(([k]) => /finding/.test(k))), plan: JSON.stringify(plan) }, pack);
  return { findings, plan, debate, llmChecks: ((parse(s3.safety) as { checks?: SafetyReview["checks"] })?.checks ?? []).map((c) => ({ ...c, name: `AI reviewer: ${c.name}` })) };
}

export async function runCaseConference(athleteId: string): Promise<CaseReview> {
  const a = getAthlete(athleteId);
  if (!a) throw new Error("athlete not found");
  let engine: CaseReview["engine"] = "offline";
  let findings!: Finding[];
  let plan!: Plan;
  let llmChecks: SafetyReview["checks"] = [];
  let debate: DebateRound[] = [];
  const offline = () => {
    findings = offlineFindings(a);
    plan = offlinePlan(a, findings);
    const v1 = findings.map((f) => offlineVote(f, plan));
    debate = [{ round: 1, votes: v1 }];
    if (v1.some((v) => v.vote === "object")) {
      const r = offlineRevise(plan, findings, v1);
      plan = r.plan;
      debate[0].revision = r.note;
      debate.push({ round: 2, votes: findings.map((f) => offlineVote(f, plan)) });
    }
  };
  if (live.gemini()) {
    try {
      ({ findings, plan, debate, llmChecks } = await runAdk(a));
      engine = "adk";
    } catch (e) {
      console.error("[case] ADK conference failed, using offline reasoning", e);
      offline();
    }
  } else offline();
  const last = debate.at(-1)!;
  const consensus: CaseReview["consensus"] = last.votes.every((v) => v.vote === "approve") ? (debate.length > 1 ? "after_revision" : "unanimous") : "none";
  const clean = sanitizeDeep(findings);
  const reviewed = safetyReview(a, clean, plan, llmChecks);
  const c: CaseReview = { athlete_id: a.id, created_at: new Date().toISOString(), engine, findings: clean, plan: reviewed.plan, debate: sanitizeDeep(debate), consensus, safety: reviewed.safety };
  cases().set(a.id, c);
  audit(engine === "adk" ? "case_conference_adk" : "case_conference", "case_reviewed", `${reviewed.plan.priority}: ${reviewed.plan.headline} (consensus ${consensus}, safety ${reviewed.safety.verdict})`, a.id);
  return c;
}

export function signoff(athleteId: string, by: string, decision: "accepted" | "edited" | "rejected", note?: string) {
  const c = cases().get(athleteId);
  if (!c) throw new Error("no case review to sign");
  c.signoff = { by, at: new Date().toISOString(), decision, note };
  audit(by, `case_${decision}`, note ?? c.plan.headline, athleteId);
  return c;
}

export const evidenceLibrary = () => LIB;

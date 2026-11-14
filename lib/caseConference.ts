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
  agent: "load_recovery" | "movement" | "neuro";
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
    today_checkin: today ? { sleep_h: today.sleep_h, load_min: today.load_min, soreness: today.soreness, meals: today.meals, symptoms: today.symptoms } : null,
    landing: a.landing ? { errors: a.landing.result.items.filter((i) => i.present && i.confidence >= 0.5).map((i) => `${i.id} (${i.side}, ${i.timestamp_s}s)`), band: a.landing.score.band } : null,
    hitwatch: a.hitwatch ? { hit: a.hitwatch.hit_description, calls: a.hitwatch.calls.map((c) => ({ day: c.day, total: Object.values(c.symptoms).reduce((s, v) => s + v, 0), symptoms: c.symptoms })), decision: a.hitwatch.today_decision ? { escalate: a.hitwatch.today_decision.escalate, reasons: a.hitwatch.today_decision.reasons } : null } : null,
  };
}

// ---------- offline reasoning (deterministic, same output shape) ----------
function offlineFindings(a: Athlete): Finding[] {
  const p = evidencePack(a);
  const f = p.features;
  const out: Finding[] = [];

  const loadEv: Finding["evidence"] = [];
  let loadScore = 0;
  if (f.acwr >= 1.3) { loadScore += 2; loadEv.push({ kind: "data", ref: "acwr", detail: `Acute:chronic workload ratio ${f.acwr}` }, { kind: "literature", ref: "E7", detail: "Load spikes relative to preparation raise injury risk" }); }
  if (f.sleep_debt_3d >= 3 || f.sleep_avg_7d < 7) { loadScore += 2; loadEv.push({ kind: "data", ref: "sleep", detail: `Sleep ${f.sleep_avg_7d} h avg, ${f.sleep_debt_3d} h debt over 3 nights` }, { kind: "literature", ref: "E8", detail: "Under 8 h sleep linked to more injuries in adolescents" }); }
  if (f.hrv_z <= -1.5 || f.rhr_delta >= 5) { loadScore += 2; loadEv.push({ kind: "data", ref: "wearable", detail: `HRV z ${f.hrv_z}, resting HR +${f.rhr_delta} bpm vs baseline` }); }
  if (f.under_fueled) { loadScore += 1; loadEv.push({ kind: "data", ref: "meals", detail: "1 or fewer meals on a hard day" }, { kind: "literature", ref: "E11", detail: "Under-fueling impairs recovery" }); }
  if (f.monotony >= 2.5) { loadScore += 1; loadEv.push({ kind: "data", ref: "monotony", detail: `Training monotony ${f.monotony}` }, { kind: "literature", ref: "E10", detail: "High monotony with high load linked to overtraining" }); }
  out.push({
    agent: "load_recovery",
    status: loadScore >= 3 ? "concern" : loadScore >= 1 ? "watch" : "clear",
    summary: loadScore ? `Recovery is behind training: ${loadEv.filter((e) => e.kind === "data").map((e) => e.detail.toLowerCase()).join("; ")}.` : "Load and recovery look in line with this athlete's normal.",
    evidence: loadEv.length ? loadEv : [{ kind: "data", ref: "features", detail: `ACWR ${f.acwr}, sleep ${f.sleep_avg_7d} h, HRV z ${f.hrv_z}` }],
    recommendation: loadScore >= 3 ? "Cut today's volume by about a third and protect sleep (8+ hours) for the next 3 nights." : loadScore ? "Keep load steady this week; no sudden jumps." : "No change needed.",
    confidence: a.wearable.recent.length ? 0.75 : 0.55,
  });

  const mvEv: Finding["evidence"] = [];
  let mv = 0;
  if (f.landing_errors >= 3) { mv += 2; mvEv.push({ kind: "data", ref: "landing", detail: `${f.landing_errors} landing errors: ${p.landing?.errors.join(", ")}` }, { kind: "literature", ref: "E2", detail: "LESS-style errors reflect ACL-injury mechanics" }, { kind: "literature", ref: "E3", detail: "Neuromuscular training reduces ACL injuries" }); }
  if (f.soreness_max >= 2) { mv += f.soreness_max >= 3 ? 2 : 1; mvEv.push({ kind: "data", ref: "soreness", detail: `Worst soreness ${f.soreness_max}/3 today${p.today_checkin?.soreness.length ? ` (${p.today_checkin.soreness.map((s) => s.area).join(", ")})` : ""}` }); }
  if (f.soreness_days_3d >= 2) { mv += 1; mvEv.push({ kind: "data", ref: "soreness_days", detail: `Sore ${f.soreness_days_3d} of the last 3 days` }); }
  out.push({
    agent: "movement",
    status: mv >= 3 ? "concern" : mv >= 1 ? "watch" : "clear",
    summary: mv ? `Movement risk: ${mvEv.filter((e) => e.kind === "data").map((e) => e.detail.toLowerCase()).join("; ")}.` : "No movement or soreness concerns in current data.",
    evidence: mvEv.length ? mvEv : [{ kind: "data", ref: "landing", detail: a.landing ? `Last screen: ${a.landing.score.score} errors` : "No landing screen yet" }],
    recommendation: f.landing_errors >= 3 ? "Add the FixPlan warm-up before every practice and re-film a landing in 7 days." : f.soreness_max >= 3 ? "Hold out of jumping and sprinting today; a clinician should look if it persists." : "Continue normal warm-up.",
    confidence: a.landing ? 0.7 : 0.5,
  });

  const nEv: Finding["evidence"] = [];
  let n: Status = "clear";
  if (p.hitwatch) {
    const last = p.hitwatch.calls.at(-1);
    nEv.push({ kind: "data", ref: "hitwatch", detail: `Hit ${p.hitwatch.hit}; ${p.hitwatch.calls.length} follow-up calls, latest total ${last?.total ?? 0}` });
    if (p.hitwatch.decision?.escalate) {
      n = "concern";
      nEv.push(...p.hitwatch.decision.reasons.map((r) => ({ kind: "data" as const, ref: "hitwatch_rules", detail: r })), { kind: "literature", ref: "E12", detail: "Symptoms can evolve over days; clinician evaluation required" });
      if (p.wearable?.below_baseline) nEv.push({ kind: "literature", ref: "E5", detail: "Wrist HRV tracks recovery after a head impact; it is a recovery signal only" });
    } else n = "watch";
  }
  if (a.risk_today.flags.some((x) => x.rule_id === "R8_red_flag")) { n = "concern"; nEv.push({ kind: "data", ref: "red_flag", detail: "Emergency sign reported in check-in" }); }
  out.push({
    agent: "neuro",
    status: n,
    summary: n === "concern" ? "Post-impact symptoms have changed; this needs a person today." : n === "watch" ? "In the 7-day follow-up window after a hit; no escalation yet." : "No head impacts or neuro symptoms reported.",
    evidence: nEv.length ? nEv : [{ kind: "data", ref: "hitwatch", detail: "No hits logged" }],
    recommendation: n === "concern" ? "Contact a parent today and arrange evaluation by a licensed clinician. No contact practice until a clinician has seen the athlete." : n === "watch" ? "Continue daily HitWatch calls." : "None.",
    confidence: 0.8,
  });
  return out;
}

function offlinePlan(a: Athlete, findings: Finding[]): Plan {
  const first = a.name.split(" ")[0];
  const concerns = findings.filter((f) => f.status === "concern");
  const watches = findings.filter((f) => f.status === "watch");
  const actions: Plan["actions"] = [];
  const neuro = findings.find((f) => f.agent === "neuro")!;
  if (neuro.status === "concern") actions.push({ owner: "parent", action: `Call ${first}'s parent today about the post-hit symptom change.` }, { owner: "clinician", action: "Evaluate post-impact symptoms; return-to-play decisions stay with the clinician." });
  // The lead keeps the plan short (2 non-head actions max); specialists can object if theirs was dropped.
  for (const f of [...concerns, ...watches].filter((x) => x.agent !== "neuro").slice(0, neuro.status === "concern" ? 1 : 2)) if (!f.recommendation.startsWith("No change")) actions.push({ owner: f.agent === "movement" && f.recommendation.includes("FixPlan") ? "athlete" : "coach", action: f.recommendation });
  if (!actions.length) actions.push({ owner: "coach", action: "No action today; keep normal training." });
  const disagreements: string[] = [];
  const lr = findings.find((f) => f.agent === "load_recovery")!;
  if (neuro.status === "concern" && lr.status !== "clear") disagreements.push("Wearable changes could reflect training load or the head impact. Treated conservatively as post-impact until a clinician has evaluated.");
  return {
    priority: neuro.status === "concern" || concerns.length >= 2 ? "today" : concerns.length || watches.length ? "this_week" : "routine",
    headline: concerns.length ? `${first}: ${concerns.map((c) => c.agent.replace("_", " & ")).join(" + ")} concern${concerns.length > 1 ? "s" : ""}` : watches.length ? `${first}: keep an eye on ${watches.map((w) => w.agent.replace("_", " & ")).join(", ")}` : `${first}: nothing needs attention`,
    actions,
    disagreements,
  };
}

// ---------- debate: each specialist votes on the lead's plan; objections trigger one revision round ----------
const RANK = { routine: 0, this_week: 1, today: 2 } as const;
const NEED: Record<Finding["agent"], Record<Status, Plan["priority"]>> = {
  neuro: { concern: "today", watch: "routine", clear: "routine" },
  load_recovery: { concern: "this_week", watch: "routine", clear: "routine" },
  movement: { concern: "this_week", watch: "routine", clear: "routine" },
};
const keyWords = (t: string) => t.toLowerCase().match(/[a-z]{6,}/g)?.slice(0, 6) ?? [];
function offlineVote(f: Finding, plan: Plan): Vote {
  if (RANK[plan.priority] < RANK[NEED[f.agent][f.status]]) return { agent: f.agent, vote: "object", reason: `Priority "${plan.priority.replace("_", " ")}" is too low for a ${f.agent.replace("_", " & ")} concern; needs "${NEED[f.agent][f.status].replace("_", " ")}".` };
  if (f.agent === "neuro" && f.status === "concern") {
    const keepsTraining = plan.actions.find((x) => /volume|load steady|warm-up before every practice/i.test(x.action) && !/no contact|non-contact/i.test(x.action));
    if (keepsTraining) return { agent: f.agent, vote: "object", reason: `"${keepsTraining.action}" keeps the athlete at practice. After a post-hit symptom rise, the athlete should do no contact or high-intensity work until a clinician has evaluated.` };
  }
  if (f.status === "concern") {
    const planText = plan.actions.map((x) => x.action).join(" ").toLowerCase();
    const covered = keyWords(f.recommendation).some((w) => planText.includes(w));
    if (!covered) return { agent: f.agent, vote: "object", reason: `Plan leaves out my recommendation: ${f.recommendation}` };
  }
  return { agent: f.agent, vote: "approve", reason: f.status === "clear" ? "Nothing in my area; no objection." : "My concern is addressed." };
}
function offlineRevise(plan: Plan, findings: Finding[], votes: Vote[]): { plan: Plan; note: string } {
  const p: Plan = JSON.parse(JSON.stringify(plan));
  const changes: string[] = [];
  for (const v of votes.filter((x) => x.vote === "object")) {
    const f = findings.find((x) => x.agent === v.agent)!;
    if (f.agent === "neuro") {
      const i = p.actions.findIndex((x) => /volume|load steady|warm-up before every practice/i.test(x.action));
      if (i >= 0) { p.actions[i] = { owner: "coach", action: "Hold from contact and high-intensity practice; light non-contact recovery only until a clinician has evaluated. Then cut volume by about a third and protect sleep." }; changes.push("replaced the training-load action with a no-contact hold"); }
      p.disagreements.push(`Head-impact agent objected to keeping the athlete at practice; the lead sided with the more cautious plan. Load & recovery agent's volume cut is kept for after clinician evaluation.`);
      continue;
    }
    const need = NEED[f.agent][f.status];
    if (RANK[p.priority] < RANK[need]) { p.priority = need; changes.push(`raised priority to ${need.replace("_", " ")}`); }
    if (!p.actions.some((a) => a.action === f.recommendation)) { p.actions.push({ owner: "coach", action: f.recommendation }); changes.push(`added the ${f.agent.replace("_", " & ")} agent's action`); }
    p.disagreements.push(`${f.agent.replace("_", " & ")} agent objected: ${v.reason}`);
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
  const neuro = findings.find((f) => f.agent === "neuro");
  const needsClinician = neuro?.status === "concern";
  const hasClinician = plan.actions.some((x) => x.owner === "clinician" || /clinician/i.test(x.action));
  checks.push({ name: "Post-impact concern routed to a clinician", passed: !needsClinician || hasClinician, note: needsClinician ? (hasClinician ? "Present" : "Added clinician referral") : "Not applicable" });
  if (needsClinician && !hasClinician) { plan.actions.unshift({ owner: "clinician", action: "Evaluate post-impact symptoms before any return to contact." }); revised = true; }
  if (needsClinician && plan.priority !== "today") { plan.priority = "today"; revised = true; checks.push({ name: "Priority raised", passed: false, note: "Neuro concern always means today" }); }
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
      spec("load_recovery", "training load, sleep, wearable recovery (HRV, resting HR) and fueling", ["load", "recovery"]),
      spec("movement", "movement quality (landing mechanics) and musculoskeletal soreness", ["movement"]),
      spec("neuro", "head impacts and post-impact symptoms (HitWatch)", ["neuro"]),
    ],
  });
  const lead = new LlmAgent({
    name: "lead_trainer_agent",
    model: config.geminiModel,
    instruction: `You are the lead athletic trainer chairing the case conference. Reconcile the three specialist findings into one plan: a priority, a one-line headline, concrete actions with owners, and any disagreements between specialists and how you resolved them (when in doubt, be conservative).\nLoad & recovery: {load_recovery_finding}\nMovement: {movement_finding}\nNeuro: {neuro_finding}\n${RULES}`,
    outputSchema: PLAN_SCHEMA as never,
    outputKey: "plan",
    generateContentConfig: { temperature: 0.2 },
  });
  const safety = new LlmAgent({
    name: "safety_reviewer_agent",
    model: config.geminiModel,
    instruction: `You are a clinical safety reviewer. Check the plan for: diagnosis or clearance language, missing clinician referral for any head-impact concern, actions not supported by cited evidence, and anything a high school coach should not do alone. Report each check.\nPlan: {plan}\nFindings: {load_recovery_finding} {movement_finding} {neuro_finding}\n${RULES}`,
    outputSchema: SAFETY_SCHEMA as never,
    outputKey: "safety",
    generateContentConfig: { temperature: 0 },
  });
  const voters = (round: number, planKey: string) =>
    new ParallelAgent({
      name: `vote_round_${round}`,
      subAgents: (["load_recovery", "movement", "neuro"] as const).map((k) =>
        new LlmAgent({
          name: `${k}_voter_${round}`,
          model: config.geminiModel,
          instruction: `You are the ${k.replace("_", " & ")} specialist. Your finding: {${k}_finding}. The lead's plan: {${planKey}}. Vote "approve" only if the plan's priority and actions adequately handle your finding; otherwise "object" and say exactly what must change. Be strict about safety, not about wording.\n${RULES}`,
          outputSchema: VOTE_SCHEMA as never,
          outputKey: `vote_${round}_${k}`,
          generateContentConfig: { temperature: 0 },
        }),
      ),
    });
  const reviser = new LlmAgent({
    name: "lead_revision_agent",
    model: config.geminiModel,
    instruction: `You are the lead athletic trainer. Specialists voted on your plan {plan}. Votes: load {vote_1_load_recovery}, movement {vote_1_movement}, neuro {vote_1_neuro}. If anyone objected, revise the plan to address every objection (record each in disagreements with how you resolved it). If all approved, return the plan unchanged.\n${RULES}`,
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
  const findings = (["load_recovery", "movement", "neuro"] as const).map((k) => ({ agent: k, ...(parse(st[`${k}_finding`]) as Omit<Finding, "agent">) }));
  if (findings.some((f) => !f.status)) throw new Error("ADK: missing specialist output");
  const votesOf = (r: number, s: Record<string, unknown>): Vote[] => (["load_recovery", "movement", "neuro"] as const).map((k) => ({ agent: k, ...(parse(s[`vote_${r}_${k}`]) as Omit<Vote, "agent">) }));
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

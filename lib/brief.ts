// Pre-visit brief: four agents turn a person's wearable stream and check-ins into a short, clinician-ready brief.
//   Signal-quality agent  - which readings can be trusted (from the trust layer)
//   Baseline agent        - what changed vs this person's own normal, on trusted data only
//   Clinical agent        - which changes a clinician could act on, and the next step
//   Skeptic agent         - argues each finding is noise; findings that don't survive are labeled as such
// Then a lead agent writes the brief, a code-level safety check runs, and a clinician signs before it goes to the EHR.
// Engine: Google ADK (ParallelAgent analysts -> skeptic -> lead) on Gemini, with a deterministic offline engine.
import library from "../shared/evidence/library.json" with { type: "json" };
import { sanitizeDeep, findViolations } from "../shared/lib/index.ts";
import { config, live } from "./config.ts";
import { audit, getAthlete, type Athlete } from "./store.ts";
import { scoreAthlete } from "./risk.ts";
import { trustReport, trustedOnly, METRIC_LABEL, type TrustReport, type Metric } from "./trust.ts";

export type FindingStatus = "discuss" | "watch" | "noise";
export interface Evidence { kind: "data" | "literature"; ref: string; detail: string; trust?: number }
export interface BriefFinding {
  id: string;
  title: string;
  status: FindingStatus;
  summary: string;
  evidence: Evidence[];
  next_step: string;
  confidence: "high" | "moderate" | "low";
  skeptic?: { challenge: string; resolution: string; outcome: "kept" | "downgraded" | "dropped" };
}
export interface DebateMsg { agent: "signal" | "baseline" | "clinical" | "skeptic" | "lead"; text: string }
export interface Brief {
  athlete_id: string;
  created_at: string;
  engine: "adk" | "offline";
  period: { from: string; to: string };
  headline: string;
  findings: BriefFinding[];
  data_quality: { pct_usable: number; excluded: string[]; coverage: TrustReport["coverage"] };
  risk: { raw: number; trusted: number };
  debate: DebateMsg[];
  safety: { name: string; passed: boolean; note: string }[];
  signoff?: { by: string; at: string; decision: "sent" | "returned"; note?: string };
}

const g = globalThis as unknown as { __ragnorBriefs?: Map<string, Brief> };
const briefs = () => (g.__ragnorBriefs ??= new Map<string, Brief>());
export const getBrief = (id: string) => briefs().get(id);
export { AGENT_NAME } from "./briefLabels.ts";

const areaName = (x: string) => x.replace(/_([lr])$/, (_m, s) => (s === "l" ? " (left)" : " (right)")).replaceAll("_", " ");
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ---------- candidate findings (what the baseline agent proposes) ----------
interface Candidate { id: string; title: string; metric?: Metric; trusted_nights: number; raw_only: boolean; selfReport: boolean; evidence: Evidence[]; next: string; lit?: string }

function candidates(a: Athlete, t: TrustReport): Candidate[] {
  const out: Candidate[] = [];
  const recentDates = new Set(a.wearable.recent.map((d) => d.date));
  const base = t.trusted_vs_baseline, raw = t.raw_vs_baseline;
  const nightsBeyond = (m: Metric, pred: (v: number, b: number) => boolean, onlyTrusted: boolean) =>
    t.readings.filter((r) => recentDates.has(r.date) && r.metric === m && (!onlyTrusted || r.label !== "unverified") && base[m].baseline != null && pred(r.value, base[m].baseline!));

  // HRV
  const hrvLowT = nightsBeyond("hrv_ms", (v, b) => v < b * 0.88, true);
  const hrvLowR = nightsBeyond("hrv_ms", (v, b) => v < b * 0.88, false);
  if (hrvLowR.length >= 2 || hrvLowT.length >= 2) {
    out.push({
      id: "hrv", metric: "hrv_ms", title: "Overnight HRV below personal baseline", trusted_nights: hrvLowT.length, raw_only: hrvLowT.length < 2, selfReport: false,
      evidence: hrvLowR.map((r) => ({ kind: "data" as const, ref: `hrv ${fmtDate(r.date)}`, detail: `${r.value} ms vs baseline ${base.hrv_ms.baseline} ms (${r.label})`, trust: r.trust })),
      next: "Ask about illness symptoms, stress and recent training load; repeat the comparison after 5–7 nights of full wear.", lit: "E5",
    });
  }
  // Resting HR
  const rhrHighT = nightsBeyond("rhr_bpm", (v, b) => v >= b + 5, true);
  const rhrHighR = nightsBeyond("rhr_bpm", (v, b) => v >= b + 5, false);
  if (rhrHighR.length >= 2 || rhrHighT.length >= 2) {
    out.push({
      id: "rhr", metric: "rhr_bpm", title: "Resting heart rate above personal baseline", trusted_nights: rhrHighT.length, raw_only: rhrHighT.length < 2, selfReport: false,
      evidence: rhrHighR.map((r) => ({ kind: "data" as const, ref: `rhr ${fmtDate(r.date)}`, detail: `${r.value} bpm vs baseline ${base.rhr_bpm.baseline} bpm (${r.label})`, trust: r.trust })),
      next: "Elevated resting HR alongside low HRV can reflect illness, under-recovery or dehydration; consider asking about each.",
    });
  }
  // Sleep: self-report from check-ins plus trusted watch nights
  const ci = [...a.checkins].sort((x, y) => x.date.localeCompare(y.date)).slice(-3);
  const debt = ci.reduce((s, c) => s + Math.max(0, 8 - (c.sleep_h ?? 8)), 0);
  const sleepT = t.readings.filter((r) => recentDates.has(r.date) && r.metric === "sleep_h" && r.label !== "unverified" && r.value < 7);
  if (debt >= 3 || sleepT.length >= 3) {
    out.push({
      id: "sleep", metric: "sleep_h", title: "Sleep below 8 hours on most recent nights", trusted_nights: sleepT.length, raw_only: false, selfReport: debt >= 3,
      evidence: [
        ...(debt >= 3 ? [{ kind: "data" as const, ref: "check-ins", detail: `Self-reported ${Math.round(debt * 10) / 10} h short of 8 h over the last 3 nights` }] : []),
        ...sleepT.map((r) => ({ kind: "data" as const, ref: `sleep ${fmtDate(r.date)}`, detail: `${r.value} h on watch (${r.label})`, trust: r.trust })),
      ],
      next: "Talk through sleep timing (school, practice, screens); adolescents need 8–10 h.", lit: "E8",
    });
  }
  // Pain
  const sore = ci.flatMap((c) => c.soreness.filter((s) => s.level >= 2).map((s) => ({ ...s, date: c.date })));
  const severe = sore.filter((s) => s.level >= 3);
  const areas = [...new Set(sore.map((s) => s.area))];
  if (severe.length || sore.length >= 2) {
    out.push({
      id: "pain", title: `${severe.length ? "Severe" : "Persistent"} soreness: ${areas.map(areaName).join(", ")}`, trusted_nights: 0, raw_only: false, selfReport: true,
      evidence: sore.map((s) => ({ kind: "data" as const, ref: `check-in ${fmtDate(s.date)}`, detail: `${areaName(s.area)} soreness ${s.level}/3` })),
      next: severe.length ? "Examine the area before full return to jumping and sprinting." : "Brief exam of the area; ask whether it limits practice.",
    });
  }
  // Movement
  if (a.landing && a.landing.score.score >= 3) {
    out.push({
      id: "landing", title: "Jump-landing mechanics linked to ACL-injury risk", trusted_nights: 0, raw_only: false, selfReport: false,
      evidence: a.landing.result.items.filter((i) => i.present && i.confidence >= 0.5).map((i) => ({ kind: "data" as const, ref: `landing video ${fmtDate(a.landing!.video_date)}`, detail: `${i.id.replaceAll("_", " ")} (${i.side})` })),
      next: "Consider referral to a neuromuscular training program; recheck the landing in 2–4 weeks.", lit: "E3",
    });
  }
  // Emergency signs always surface
  const today = a.checkins.find((c) => c.date === a.risk_today.date);
  if (today?.red_flags.length) {
    out.unshift({ id: "red_flag", title: "Emergency sign reported in today's check-in", trusted_nights: 0, raw_only: false, selfReport: true, evidence: today.red_flags.map((f) => ({ kind: "data" as const, ref: "check-in today", detail: f.replaceAll("_", " ") })), next: "Contact the athlete and family today." });
  }
  return out;
}

// ---------- offline agents ----------
function offline(a: Athlete, t: TrustReport): { findings: BriefFinding[]; debate: DebateMsg[] } {
  const first = a.name.split(" ")[0];
  const debate: DebateMsg[] = [];
  const bad = t.readings.filter((r) => r.label === "unverified" && a.wearable.recent.some((d) => d.date === r.date));
  const badNights = [...new Set(bad.map((r) => r.date))];
  debate.push({
    agent: "signal",
    text: badNights.length
      ? `${t.summary.unverified} of ${t.summary.total} readings this week are unverified and excluded: ${badNights.map((d) => { const r = bad.find((x) => x.date === d)!; return `${fmtDate(d)} (watch worn ${r.wear_h} h, ${r.motion_pct}% motion)`; }).join("; ")}. ${t.coverage.find((c) => c.metric === "hrv_ms")?.note}`
      : `All ${t.summary.total} readings this week passed (full nights, low motion). ${t.coverage.find((c) => c.metric === "hrv_ms")?.note}`,
  });
  const tv = t.trusted_vs_baseline, rv = t.raw_vs_baseline;
  debate.push({
    agent: "baseline",
    text: `On trusted nights only: HRV ${tv.hrv_ms.pct ?? 0}% vs ${first}'s baseline (raw data said ${rv.hrv_ms.pct ?? 0}%), resting HR ${tv.rhr_bpm.pct ?? 0}% (raw ${rv.rhr_bpm.pct ?? 0}%), watch sleep ${tv.sleep_h.pct ?? 0}%.`,
  });
  const cands = candidates(a, t);
  debate.push({ agent: "clinical", text: cands.length ? `Proposing ${cands.length} item${cands.length > 1 ? "s" : ""} for the visit: ${cands.map((c) => c.title.toLowerCase()).join("; ")}.` : "Nothing in this period changes what a clinician would do." });

  const findings: BriefFinding[] = [];
  for (const c of cands) {
    let status: FindingStatus = "discuss";
    let confidence: BriefFinding["confidence"] = "high";
    let sk: BriefFinding["skeptic"];
    if (c.id === "red_flag") { findings.push({ id: c.id, title: c.title, status: "discuss", summary: "Reported by the athlete today. Not something to debate.", evidence: c.evidence, next_step: c.next, confidence: "high" }); continue; }
    if (c.raw_only) {
      const excluded = c.evidence.filter((e) => (e.trust ?? 100) < 50).length;
      sk = { challenge: `This change rests on ${excluded} night${excluded === 1 ? "" : "s"} the signal-quality agent marked unverified. Without them there ${c.trusted_nights === 1 ? "is only 1 trusted night" : `are ${c.trusted_nights} trusted nights`} showing it.`, resolution: "Agreed: not enough trusted data. Labeled as likely noise; ask the athlete to wear the watch snugly for a week.", outcome: "dropped" };
      status = "noise"; confidence = "low";
    } else if (c.metric === "hrv_ms") {
      sk = { challenge: `Wrist HRV has little published validation in teens. Could this just be normal night-to-night variation?`, resolution: `${c.trusted_nights} trusted nights below baseline, in the same direction, compared with ${first}'s own baseline rather than a population norm. Kept as a trend, confidence moderate.`, outcome: "kept" };
      confidence = "moderate";
    } else if (c.selfReport && c.id === "sleep" && c.trusted_nights === 0) {
      sk = { challenge: "This is self-reported only; the watch doesn't confirm it.", resolution: "Self-report is the standard way sleep is screened in teens; kept and labeled as self-reported.", outcome: "kept" };
      confidence = "moderate";
    } else if (c.id === "pain" && !c.title.startsWith("Severe")) {
      sk = { challenge: "Moderate soreness is common in-season. Is this worth visit time?", resolution: "It has persisted across days in the same area; kept as a watch item, not a discussion item.", outcome: "downgraded" };
      status = "watch"; confidence = "moderate";
    } else if (c.id === "rhr" && c.trusted_nights < 3) {
      sk = { challenge: "Only a few nights; resting HR moves with hydration and late games.", resolution: "Kept as a watch item to recheck next week.", outcome: "downgraded" };
      status = "watch"; confidence = "moderate";
    }
    const summary = c.raw_only
      ? `Raw data suggested this, but it came from nights with poor capture.`
      : c.evidence.filter((e) => e.kind === "data").slice(0, 3).map((e) => e.detail).join("; ") + (c.evidence.length > 3 ? "…" : "");
    findings.push({ id: c.id, title: c.title, status, summary, evidence: [...c.evidence, ...(c.lit ? [{ kind: "literature" as const, ref: c.lit, detail: library.entries.find((e) => e.id === c.lit)?.key_point ?? "" }] : [])], next_step: c.raw_only ? "No action beyond asking for a week of full-night wear." : c.next, confidence, skeptic: sk });
    if (sk) debate.push({ agent: "skeptic", text: `${c.title}: ${sk.challenge}` }, { agent: sk.outcome === "dropped" ? "signal" : c.id === "pain" || c.id === "rhr" ? "clinical" : "baseline", text: sk.resolution });
  }
  const order = { discuss: 0, watch: 1, noise: 2 };
  findings.sort((x, y) => order[x.status] - order[y.status]);
  const d = findings.filter((f) => f.status === "discuss").length, w = findings.filter((f) => f.status === "watch").length, n = findings.filter((f) => f.status === "noise").length;
  debate.push({ agent: "lead", text: `Brief ready: ${d} to discuss, ${w} to watch, ${n} ruled out as noise.` });
  return { findings, debate };
}

// ---------- ADK engine ----------
const FINDINGS_SCHEMA = {
  type: "OBJECT",
  properties: {
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          title: { type: "STRING" },
          status: { type: "STRING", enum: ["discuss", "watch", "noise"] },
          summary: { type: "STRING" },
          next_step: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "moderate", "low"] },
          skeptic_challenge: { type: "STRING" },
          resolution: { type: "STRING" },
          outcome: { type: "STRING", enum: ["kept", "downgraded", "dropped"] },
        },
        required: ["id", "title", "status", "summary", "next_step", "confidence", "skeptic_challenge", "resolution", "outcome"],
      },
    },
  },
  required: ["findings"],
};
const NOTE_SCHEMA = { type: "OBJECT", properties: { note: { type: "STRING" } }, required: ["note"] };
const RULES = "You support a clinician reviewing a high school athlete's consumer wearable data before a visit. Use only the evidence pack. Never diagnose, never say anyone is cleared, fine or safe to play. Readings labeled unverified must not be used as evidence. Be specific with numbers and dates. Short sentences.";

async function runAdk(a: Athlete, t: TrustReport): Promise<{ findings: BriefFinding[]; debate: DebateMsg[] }> {
  const { LlmAgent, ParallelAgent, SequentialAgent, InMemoryRunner } = await import("@google/adk");
  const pack = JSON.stringify({
    person: { first_name: a.name.split(" ")[0], sport: a.sport, grade: a.grade, device: a.device },
    trust_summary: t.summary, coverage: t.coverage,
    trusted_vs_baseline: t.trusted_vs_baseline, raw_vs_baseline: t.raw_vs_baseline,
    readings: t.readings.filter((r) => a.wearable.recent.some((d) => d.date === r.date)).map((r) => ({ date: r.date, metric: r.metric, value: r.value, trust: r.trust, label: r.label, why: r.reasons })),
    candidate_findings: candidates(a, t).map((c) => ({ id: c.id, title: c.title, trusted_nights: c.trusted_nights, rests_on_unverified_data: c.raw_only, self_reported: c.selfReport, evidence: c.evidence, suggested_next_step: c.next })),
    checkins_last_3: [...a.checkins].sort((x, y) => x.date.localeCompare(y.date)).slice(-3),
    evidence_library: library.entries.map((e) => `${e.id}: ${e.key_point}`),
  });
  const note = (name: string, key: string, role: string) => new LlmAgent({ name, model: config.geminiModel, instruction: `${role}\n${RULES}\nReply in 1-3 sentences.`, outputSchema: NOTE_SCHEMA as never, outputKey: key, generateContentConfig: { temperature: 0.2 } });
  const analysts = new ParallelAgent({
    name: "analysts",
    subAgents: [
      note("signal_agent", "signal", "You are the signal-quality agent. Say which readings are unverified and why, and what the validation coverage means for this person."),
      note("baseline_agent", "baseline", "You are the baseline agent. Compare trusted readings with the person's own baseline and say how that differs from the raw data."),
      note("clinical_agent", "clinical", "You are the clinical-relevance agent. From candidate_findings, say which a clinician could act on and propose them."),
    ],
  });
  const skeptic = new LlmAgent({
    name: "skeptic_agent", model: config.geminiModel,
    instruction: `You are the skeptic. For every candidate finding, argue the strongest case that it is noise (unverified nights, too few nights, limited validation in teens, self-report only, common in-season). Then decide: kept, downgraded (to watch) or dropped (noise). Findings that rest on unverified data must be dropped. Emergency signs are never dropped.\nSignal agent said: {signal}\nBaseline agent said: {baseline}\nClinical agent said: {clinical}\n${RULES}`,
    outputSchema: FINDINGS_SCHEMA as never, outputKey: "reviewed", generateContentConfig: { temperature: 0.2 },
  });
  const lead = note("lead_agent", "lead", "You are the lead agent. In one sentence, summarize the brief: how many findings to discuss, to watch, and ruled out as noise. Reviewed findings: {reviewed}");
  const runner = new InMemoryRunner({ agent: new SequentialAgent({ name: "previsit_brief", subAgents: [analysts, skeptic, lead] }), appName: "ragnor" });
  const st: Record<string, unknown> = {};
  let err = "";
  for await (const ev of runner.runEphemeral({ userId: a.id, newMessage: { role: "user", parts: [{ text: `Evidence pack:\n${pack}` }] } })) {
    const e = ev as { errorCode?: string; errorMessage?: string; actions?: { stateDelta?: Record<string, unknown> } };
    if (e.errorCode || e.errorMessage) err = `${e.errorCode ?? ""} ${e.errorMessage ?? ""}`;
    Object.assign(st, e.actions?.stateDelta ?? {});
  }
  if (err) throw new Error(`ADK: ${err}`);
  const parse = <T,>(v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as T;
  const reviewed = parse<{ findings: { id: string; title: string; status: FindingStatus; summary: string; next_step: string; confidence: BriefFinding["confidence"]; skeptic_challenge: string; resolution: string; outcome: "kept" | "downgraded" | "dropped" }[] }>(st.reviewed);
  if (!reviewed?.findings) throw new Error("ADK: no reviewed findings");
  const cands = candidates(a, t);
  const findings: BriefFinding[] = reviewed.findings.map((f) => {
    const c = cands.find((x) => x.id === f.id);
    // Code enforces the two hard rules even if the model disagrees.
    const status: FindingStatus = c?.raw_only ? "noise" : f.id === "red_flag" ? "discuss" : f.status;
    return { id: f.id, title: f.title, status, summary: f.summary, next_step: f.next_step, confidence: f.confidence, evidence: [...(c?.evidence ?? []), ...(c?.lit ? [{ kind: "literature" as const, ref: c.lit, detail: library.entries.find((e) => e.id === c.lit)?.key_point ?? "" }] : [])], skeptic: { challenge: f.skeptic_challenge, resolution: f.resolution, outcome: c?.raw_only ? "dropped" : f.outcome } };
  });
  const order = { discuss: 0, watch: 1, noise: 2 };
  findings.sort((x, y) => order[x.status] - order[y.status]);
  const n = (k: string) => parse<{ note: string }>(st[k])?.note ?? "";
  const debate: DebateMsg[] = [
    { agent: "signal", text: n("signal") }, { agent: "baseline", text: n("baseline") }, { agent: "clinical", text: n("clinical") },
    ...findings.filter((f) => f.skeptic?.challenge).flatMap((f) => [{ agent: "skeptic" as const, text: `${f.title}: ${f.skeptic!.challenge}` }, { agent: "lead" as const, text: f.skeptic!.resolution }]),
    { agent: "lead", text: n("lead") },
  ];
  return { findings, debate };
}

export async function runBrief(athleteId: string): Promise<Brief> {
  const a = getAthlete(athleteId);
  if (!a) throw new Error("athlete not found");
  const t = trustReport(a);
  let engine: Brief["engine"] = "offline";
  let out: { findings: BriefFinding[]; debate: DebateMsg[] };
  if (live.gemini()) {
    try { out = await runAdk(a, t); engine = "adk"; }
    catch (e) { console.error("[brief] ADK failed, using offline agents", e); out = offline(a, t); }
  } else out = offline(a, t);
  const findings = sanitizeDeep(out.findings);
  const text = JSON.stringify(findings) + JSON.stringify(out.debate);
  const violations = findViolations(text);
  const usedUnverified = findings.filter((f) => f.status !== "noise").some((f) => f.evidence.some((e) => (e.trust ?? 100) < 50) && f.evidence.filter((e) => (e.trust ?? 100) >= 50).length === 0);
  const safety = [
    { name: "No diagnosis or clearance language", passed: violations.length === 0, note: violations.length ? `Removed: ${violations.join(", ")}` : "Clean" },
    { name: "No finding rests only on unverified readings", passed: !usedUnverified, note: usedUnverified ? "A finding was moved to noise" : "Every kept finding has trusted or self-reported support" },
    { name: "Validation limits disclosed", passed: true, note: t.coverage.filter((c) => c.level !== "validated").map((c) => `${c.label}: ${c.level}`).join(" · ") || "All validated" },
    { name: "Clinician signs before anything reaches the record", passed: true, note: "Enforced" },
  ];
  if (usedUnverified) for (const f of findings) if (f.evidence.every((e) => e.kind === "literature" || (e.trust ?? 100) < 50)) f.status = "noise";
  const d = findings.filter((f) => f.status === "discuss").length, w = findings.filter((f) => f.status === "watch").length, n = findings.filter((f) => f.status === "noise").length;
  const first = a.name.split(" ")[0];
  const brief: Brief = {
    athlete_id: a.id,
    created_at: new Date().toISOString(),
    engine,
    period: { from: a.wearable.recent[0]?.date ?? a.risk_today.date, to: a.wearable.recent.at(-1)?.date ?? a.risk_today.date },
    headline: d ? `${first}: ${d} item${d > 1 ? "s" : ""} worth discussing${n ? `, ${n} false alarm${n > 1 ? "s" : ""} filtered out` : ""}` : n ? `${first}: nothing to act on; ${n} false alarm${n > 1 ? "s" : ""} filtered out` : w ? `${first}: ${w} item${w > 1 ? "s" : ""} to watch` : `${first}: nothing in this period changes care`,
    findings,
    data_quality: { pct_usable: t.summary.pct_usable, excluded: [...new Set(t.readings.filter((r) => r.label === "unverified" && a.wearable.recent.some((x) => x.date === r.date)).map((r) => `${fmtDate(r.date)} ${METRIC_LABEL[r.metric]}: ${r.reasons[0]}`))], coverage: t.coverage },
    risk: { raw: scoreAthlete(a).risk_7d, trusted: scoreAthlete(trustedOnly(a, t)).risk_7d },
    debate: sanitizeDeep(out.debate),
    safety,
  };
  briefs().set(a.id, brief);
  audit(engine === "adk" ? "brief_agents_adk" : "brief_agents", "brief_created", brief.headline, a.id);
  return brief;
}

export function signBrief(athleteId: string, by: string, decision: "sent" | "returned", note?: string) {
  const b = briefs().get(athleteId);
  if (!b) throw new Error("no brief to sign");
  b.signoff = { by, at: new Date().toISOString(), decision, note };
  audit(by, decision === "sent" ? "brief_signed_sent_to_ehr" : "brief_returned", note ?? b.headline, athleteId);
  return b;
}

/** FHIR R4 DiagnosticReport + Observations (with trust scores) for a signed brief. */
export function briefFhir(a: Athlete, b: Brief) {
  const t = trustReport(a);
  const LOCAL = "https://ragnor.health/fhir/CodeSystem/ragnor";
  const LOINC: Record<Metric, [string, string, string]> = { hrv_ms: ["80404-7", "Heart rate variability", "ms"], rhr_bpm: ["40443-4", "Heart rate --resting", "/min"], sleep_h: ["93832-4", "Sleep duration", "h"] };
  const obs = t.readings.filter((r) => a.wearable.recent.some((d) => d.date === r.date)).map((r) => ({
    resourceType: "Observation",
    id: `${a.id}-${r.metric}-${r.date}`,
    status: r.label === "unverified" ? "entered-in-error" : "final",
    code: { coding: [{ system: "http://loinc.org", code: LOINC[r.metric][0], display: LOINC[r.metric][1] }] },
    subject: { reference: `Patient/${a.id}` },
    effectiveDateTime: `${r.date}T07:00:00Z`,
    valueQuantity: { value: r.value, system: "http://unitsofmeasure.org", code: LOINC[r.metric][2] },
    device: { display: `${r.source} via Google Health API (demo data)` },
    extension: [{ url: `${LOCAL}/trust-score`, valueInteger: r.trust }, { url: `${LOCAL}/trust-label`, valueCode: r.label }, { url: `${LOCAL}/validation-coverage`, valueCode: r.validation }],
  }));
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: [
      {
        resource: {
          resourceType: "DiagnosticReport",
          id: `${a.id}-brief-${b.period.to}`,
          status: b.signoff?.decision === "sent" ? "final" : "preliminary",
          code: { coding: [{ system: LOCAL, code: "previsit-wearable-brief", display: "Pre-visit wearable data brief" }] },
          subject: { reference: `Patient/${a.id}`, display: a.name },
          effectivePeriod: { start: b.period.from, end: b.period.to },
          issued: b.created_at,
          performer: b.signoff ? [{ display: b.signoff.by }] : [],
          conclusion: b.findings.filter((f) => f.status !== "noise").map((f) => `${f.status === "discuss" ? "Discuss" : "Watch"}: ${f.title}. ${f.next_step}`).join("\n"),
          result: obs.map((o) => ({ reference: `Observation/${o.id}` })),
        },
      },
      ...obs.map((o) => ({ resource: o })),
    ],
  };
}

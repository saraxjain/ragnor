// HitWatch server side: what the voice agent's tools (and the scripted demo) call. The DETERMINISTIC code here, not the model,
// computes the `hitwatch` shape and the rules decide; an escalation becomes a pending alert in the human approval queue.
import { FOLLOWUP_DAYS, addDays, dayDiff, followUpDayNumber, localDateOf } from "../time";
import type { DataAccess } from "../data/types";
import { evaluateAthlete, ValidationError } from "../services";
import { startImpact } from "../ingest";
import { THRESHOLDS } from "../rules/thresholds";
import { ALL_SYMPTOMS, isKnownSymptom, isRedFlagSymptom, symptomLabel } from "../rules/symptoms";
import { findBanned } from "../wording";
import { getWearableProvider } from "../wearables";
import { computeBaseline, computeDeltas, type WearableProvider } from "../wearables/types";
import type { Actor, HitwatchCall, ImpactEvent, Profile, SymptomLog } from "../types";
import { baselineSymptomTotal, computeHitwatch, normalizeSeverities, type HitwatchShape } from "./compute";
import { scanRedFlags } from "./redflag-scan";

const asAthlete = (id: string): Actor => ({ id, role: "athlete" });

export class HitwatchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HitwatchError";
  }
}

/** Code-generated wording only (never model text), checked against the wording rules in tests. */
export const SAY = {
  urgent: "Please get medical help now. What you described needs a clinician right away. I have flagged it for your athletic trainer too.",
  escalate: "Thank you. I have flagged today's answers for your athletic trainer to review. If anything gets worse, tell someone and get medical help.",
  logged: "Thank you. I have logged today's answers and I will check in again tomorrow.",
  confirm: "Before we finish, I need to check one thing with you.",
} as const;

async function load(da: DataAccess, impactId: string, now: Date): Promise<{ impact: ImpactEvent; profile: Profile; actor: Actor; day: number }> {
  const impact = await da.systemFindImpact(impactId);
  if (!impact) throw new HitwatchError(404, "Unknown impact.");
  const actor = asAthlete(impact.athleteId);
  const profile = await da.getProfile(actor, impact.athleteId);
  if (!profile) throw new HitwatchError(404, "Unknown athlete.");
  const day = followUpDayNumber(impact.occurredAt, localDateOf(now, profile.timezone), profile.timezone);
  return { impact, profile, actor, day };
}

async function baselineFor(da: DataAccess, actor: Actor, profile: Profile, impact: ImpactEvent) {
  const start = localDateOf(impact.occurredAt, profile.timezone);
  const checkins = await da.listCheckins(actor, profile.id, addDays(start, -THRESHOLDS.LOOKBACK_DAYS), start);
  return { start, ...baselineSymptomTotal(checkins, start) };
}

const logTotal = (l: SymptomLog): { total: number; severities: Record<string, number> } => {
  const sev = normalizeSeverities(l.symptoms, l.severities);
  return { total: Object.values(sev).reduce((a, b) => a + b, 0), severities: sev };
};

export interface FollowupContext {
  impact_id: string;
  day: number;
  days_remaining: number;
  active: boolean;
  baseline_total: number;
  prior_days: { day: number; total: number; escalate: boolean }[];
  wearable: { hrv_delta_percent: number | null; resting_hr_delta_bpm: number | null; sleep_delta_hours: number | null; baseline_days: number } | null;
  symptoms_to_ask_about: { id: string; label: string }[];
}

/** Tool 1: today's follow-up context for the agent (de-identified: an opaque impact id, numbers, symptom labels). */
export async function getFollowupContext(da: DataAccess, impactId: string, now: Date, provider: WearableProvider | null = getWearableProvider()): Promise<FollowupContext> {
  const { impact, profile, actor, day } = await load(da, impactId, now);
  const base = await baselineFor(da, actor, profile, impact);
  const logs = (await da.listSymptomLogs(actor, profile.id)).filter((l) => l.impactEventId === impactId).sort((a, b) => a.day - b.day);
  const today = localDateOf(now, profile.timezone);
  let wearable: FollowupContext["wearable"] = null;
  if (provider) {
    const days = await provider.getDays(profile.id, addDays(today, -(THRESHOLDS.WEARABLE_BASELINE_DAYS + 1)), today).catch(() => []);
    if (days.length) {
      const b = computeBaseline(days, today, THRESHOLDS.WEARABLE_BASELINE_DAYS, THRESHOLDS.WEARABLE_MIN_BASELINE_DAYS);
      const d = computeDeltas(days.find((x) => x.localDate === today), b);
      wearable = { hrv_delta_percent: d.hrvDeltaPercent, resting_hr_delta_bpm: d.restingHrDeltaBpm, sleep_delta_hours: d.sleepDeltaHours, baseline_days: b.daysUsed };
    }
  }
  return {
    impact_id: impactId,
    day,
    days_remaining: Math.max(0, FOLLOWUP_DAYS - day),
    active: day >= 1 && day <= FOLLOWUP_DAYS,
    baseline_total: base.total,
    prior_days: logs.filter((l) => l.day < day).map((l) => ({ day: l.day, total: logTotal(l).total, escalate: computeHitwatch({ day: l.day, severities: logTotal(l).severities, baselineTotal: base.total }).escalate })),
    wearable,
    symptoms_to_ask_about: ALL_SYMPTOMS.filter((s) => !s.redFlag).map((s) => ({ id: s.id, label: s.label })),
  };
}

export interface LogResult {
  hitwatch: HitwatchShape;
  urgent: boolean;
  escalate: boolean;
  /** Red-flag phrases the keyword scan found that the athlete has not confirmed. The agent must ask about each. */
  confirm_with_athlete: { symptom_id: string; label: string; phrase: string; negated_nearby: boolean }[];
  say: string;
}

/** Tool 2: log today's symptoms (0 to 3 each). The day comes from the clock, never from the model. */
export async function logHitwatchDay(
  da: DataAccess,
  impactId: string,
  input: { severities: Record<string, unknown>; transcript?: string; channel: HitwatchCall["channel"] },
  now: Date,
  opts: { wearables?: WearableProvider | null } = {},
): Promise<LogResult> {
  const { impact, profile, actor, day } = await load(da, impactId, now);
  if (day < 1 || day > FOLLOWUP_DAYS) throw new HitwatchError(409, "This follow-up window is not active.");
  const clean: Record<string, number> = {};
  const errors: string[] = [];
  for (const [id, v] of Object.entries(input.severities)) {
    const n = typeof v === "string" ? Number(v) : v;
    if (!isKnownSymptom(id)) errors.push(`unknown symptom "${id}"`);
    else if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 3) errors.push(`severity for "${id}" must be 0 to 3`);
    else if (n > 0) clean[id] = n;
  }
  if (errors.length) throw new ValidationError(errors.join("; "));
  const base = await baselineFor(da, actor, profile, impact);
  const hitwatch = computeHitwatch({ day, severities: clean, baselineTotal: base.total });

  // Second check: keyword scan of what the athlete actually said. Hits the athlete did not confirm are never dropped.
  const hits = input.transcript ? scanRedFlags(input.transcript.slice(0, 6000)) : [];
  const unconfirmed = hits.filter((h) => !(clean[h.symptomId] > 0));

  await da.upsertSymptomLog(actor, {
    impactEventId: impact.id,
    athleteId: profile.id,
    day,
    symptoms: Object.keys(clean),
    severity: Object.values(clean).length ? Math.max(...Object.values(clean)) : 0,
    severities: clean,
    loggedAt: now.toISOString(),
  });
  await da.recordCall(actor, { impactEventId: impact.id, athleteId: profile.id, day, channel: input.channel, status: "answered", at: now.toISOString(), keywordFlags: unconfirmed.map((h) => h.symptomId) });
  const evaluation = await evaluateAthlete(da, actor, profile.id, now, opts.wearables === undefined ? {} : { wearables: opts.wearables });
  const urgent = evaluation.flags.some((f) => f.level === "urgent");
  return {
    hitwatch,
    urgent,
    escalate: hitwatch.escalate,
    confirm_with_athlete: unconfirmed.map((h) => ({ symptom_id: h.symptomId, label: h.label, phrase: h.phrases[0], negated_nearby: h.negatedNearby })),
    say: urgent ? SAY.urgent : unconfirmed.length ? SAY.confirm : hitwatch.escalate ? SAY.escalate : SAY.logged,
  };
}

/** Tool 3: end-of-call summary. The summary is length-capped and dropped if it breaks the wording rules; only the result is stored. */
export async function endHitwatchCall(da: DataAccess, impactId: string, input: { answered: boolean; summary?: string; channel: HitwatchCall["channel"] }, now: Date): Promise<{ stored_summary: boolean }> {
  const { impact, profile, actor, day } = await load(da, impactId, now);
  if (day < 1 || day > FOLLOWUP_DAYS) throw new HitwatchError(409, "This follow-up window is not active.");
  let summary: string | null = input.summary ? input.summary.trim().slice(0, 300) : null;
  if (summary && findBanned(summary).length) summary = null;
  await da.recordCall(actor, { impactEventId: impact.id, athleteId: profile.id, day, channel: input.channel, status: input.answered ? "answered" : "missed", at: now.toISOString(), summary });
  return { stored_summary: summary !== null };
}

/** Missed-call handling: a day before today with no symptom log and no answered call becomes "missed" (the existing missed-followup rule then fires). */
export async function reconcileMissedCalls(da: DataAccess, athleteId: string, now: Date): Promise<number> {
  const actor = asAthlete(athleteId);
  const profile = await da.getProfile(actor, athleteId);
  if (!profile) return 0;
  const today = localDateOf(now, profile.timezone);
  const [impacts, logs, calls] = await Promise.all([da.listImpacts(actor, athleteId), da.listSymptomLogs(actor, athleteId), da.listCalls(actor, athleteId)]);
  let changed = 0;
  for (const i of impacts) {
    const day = dayDiff(localDateOf(i.occurredAt, profile.timezone), today) + 1;
    if (day < 2 || day > FOLLOWUP_DAYS) continue;
    for (let d = 1; d < day; d++) {
      const answered = logs.some((l) => l.impactEventId === i.id && l.day === d) || calls.some((c) => c.impactEventId === i.id && c.day === d && c.status === "answered");
      const already = calls.some((c) => c.impactEventId === i.id && c.day === d && c.status === "missed");
      if (!answered && !already) {
        await da.recordCall(actor, { impactEventId: i.id, athleteId, day: d, channel: "phone", status: "missed", at: now.toISOString() });
        changed++;
      }
    }
  }
  return changed;
}

export interface TimelineDay {
  day: number;
  date: string;
  status: "answered" | "missed" | "due" | "upcoming";
  channel: HitwatchCall["channel"] | null;
  symptomsTotal: number | null;
  baselineTotal: number;
  escalate: boolean | null;
  hrvDeltaPercent: number | null;
  restingHrDeltaBpm: number | null;
  keywordFlags: string[];
  summary: string | null;
}
export interface Timeline {
  impact: ImpactEvent;
  currentDay: number;
  active: boolean;
  days: TimelineDay[];
}

/** 7-day timeline per impact: called/answered/missed, symptom totals against the athlete's baseline, wearable deltas, escalations. */
export async function getTimelines(da: DataAccess, actor: Actor, athleteId: string, now: Date, provider: WearableProvider | null = getWearableProvider()): Promise<Timeline[]> {
  await reconcileMissedCalls(da, athleteId, now);
  const profile = await da.getProfile(actor, athleteId);
  if (!profile) return [];
  const today = localDateOf(now, profile.timezone);
  const [impacts, logs, calls] = await Promise.all([da.listImpacts(actor, athleteId), da.listSymptomLogs(actor, athleteId), da.listCalls(actor, athleteId)]);
  const out: Timeline[] = [];
  for (const impact of impacts) {
    const start = localDateOf(impact.occurredAt, profile.timezone);
    const currentDay = dayDiff(start, today) + 1;
    if (currentDay < 1 || currentDay > FOLLOWUP_DAYS + 7) continue; // show a week after the window too
    const base = await baselineFor(da, actor, profile, impact);
    const wdays = provider ? await provider.getDays(athleteId, addDays(start, -THRESHOLDS.WEARABLE_BASELINE_DAYS - 1), addDays(start, FOLLOWUP_DAYS)).catch(() => []) : [];
    const days: TimelineDay[] = [];
    for (let d = 1; d <= FOLLOWUP_DAYS; d++) {
      const date = addDays(start, d - 1);
      const log = logs.find((l) => l.impactEventId === impact.id && l.day === d);
      const call = calls.find((c) => c.impactEventId === impact.id && c.day === d);
      const lt = log ? logTotal(log) : null;
      const h = lt ? computeHitwatch({ day: d, severities: lt.severities, baselineTotal: base.total }) : null;
      const wb = wdays.length ? computeBaseline(wdays, date, THRESHOLDS.WEARABLE_BASELINE_DAYS, THRESHOLDS.WEARABLE_MIN_BASELINE_DAYS) : null;
      const wd = wb ? computeDeltas(wdays.find((x) => x.localDate === date), wb) : null;
      days.push({
        day: d,
        date,
        status: log || call?.status === "answered" ? "answered" : call?.status === "missed" ? "missed" : d === currentDay ? "due" : d > currentDay ? "upcoming" : "missed",
        channel: call?.channel ?? null,
        symptomsTotal: lt ? lt.total : null,
        baselineTotal: base.total,
        escalate: h ? h.escalate : null,
        hrvDeltaPercent: wd?.hrvDeltaPercent ?? null,
        restingHrDeltaBpm: wd?.restingHrDeltaBpm ?? null,
        keywordFlags: call?.keywordFlags ?? [],
        summary: call?.summary ?? null,
      });
    }
    out.push({ impact, currentDay, active: currentDay >= 1 && currentDay <= FOLLOWUP_DAYS, days });
  }
  return out.sort((a, b) => b.impact.occurredAt.localeCompare(a.impact.occurredAt));
}

export interface DueRow {
  athleteId: string;
  athleteLabel: string;
  impactId: string;
  day: number;
}

/** Active follow-ups with no answer yet today, for the reviewer. */
export async function getDueToday(da: DataAccess, reviewer: Actor, now: Date): Promise<DueRow[]> {
  const athletes = await da.listTeamAthletes(reviewer);
  const out: DueRow[] = [];
  for (const a of athletes) {
    for (const t of await getTimelines(da, reviewer, a.id, now)) {
      if (!t.active) continue;
      const today = t.days.find((d) => d.day === t.currentDay);
      if (today && today.status === "due") out.push({ athleteId: a.id, athleteLabel: a.displayLabel, impactId: t.impact.id, day: t.currentDay });
    }
  }
  return out;
}

// ---- scripted demo: "simulate day N answers"
export type Scenario = "typical" | "danger" | "missed";
const TYPICAL: Record<number, Record<string, number>> = {
  1: { headache: 1 },
  2: { headache: 2, light_sensitivity: 1 },
  3: { headache: 3, light_sensitivity: 2, foggy: 1 },
  4: { headache: 2, foggy: 1 },
  5: { headache: 1 },
  6: {},
  7: {},
};
export const scriptedAnswers = (scenario: Scenario, day: number): Record<string, number> | null => {
  if (scenario === "missed" && day === 2) return null;
  if (scenario === "danger" && day === 3) return { cdc_worsening_headache: 3, light_sensitivity: 2 };
  return TYPICAL[day] ?? {};
};

/**
 * Demo only: creates a (clearly scripted) impact `throughDay - 1` days ago and plays the answers for days 1..throughDay through the
 * same code path the real agent uses. Labelled as scripted in the call record. Never contacts anyone.
 */
export async function runScriptedHitwatch(da: DataAccess, athleteId: string, throughDay: number, scenario: Scenario, now: Date): Promise<{ impactId: string; days: { day: number; result: LogResult | "missed" }[] }> {
  if (!Number.isInteger(throughDay) || throughDay < 1 || throughDay > FOLLOWUP_DAYS) throw new HitwatchError(422, "Day must be 1 to 7.");
  const startMs = now.getTime() - (throughDay - 1) * 86_400_000;
  const r = await startImpact(da, { athleteId, eventId: `scripted-${scenario}-${startMs}-${Math.round(Math.random() * 1e9)}`, occurredAt: new Date(startMs).toISOString(), source: "demo", context: "Scripted HitWatch demo" }, now);
  if (r.duplicate) throw new HitwatchError(409, "Duplicate scripted run.");
  const days: { day: number; result: LogResult | "missed" }[] = [];
  for (let d = 1; d <= throughDay; d++) {
    const nowD = new Date(startMs + (d - 1) * 86_400_000);
    const answers = scriptedAnswers(scenario, d);
    if (answers === null) {
      days.push({ day: d, result: "missed" });
      continue;
    }
    // The transcript for the scripted danger scenario lets the keyword check run too.
    const transcript = scenario === "danger" && d === 3 ? "My headache keeps getting worse and I threw up." : undefined;
    days.push({ day: d, result: await logHitwatchDay(da, r.impact.id, { severities: answers, channel: "scripted", transcript }, nowD) });
  }
  await reconcileMissedCalls(da, athleteId, now);
  await evaluateAthlete(da, asAthlete(athleteId), athleteId, now);
  return { impactId: r.impact.id, days };
}

export { isRedFlagSymptom, symptomLabel };

// ---- outbound call trigger (ElevenLabs). CODE ONLY: nothing in this repository calls it automatically.
export const ELEVENLABS_OUTBOUND_URL = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";

export function buildOutboundCall(env: Record<string, string | undefined>, input: { toNumber: string; impactId: string; day: number }): { url: string; init: RequestInit } | { error: string } {
  const key = env.ELEVENLABS_API_KEY?.trim();
  const agent = env.ELEVENLABS_AGENT_ID?.trim();
  const phone = env.ELEVENLABS_PHONE_NUMBER_ID?.trim();
  if (!key || !agent || !phone) return { error: "Outbound calls are not set up (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID)." };
  if (!/^\+[1-9]\d{6,14}$/.test(input.toNumber)) return { error: "to_number must be an E.164 phone number like +14155550123." };
  return {
    url: ELEVENLABS_OUTBOUND_URL,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": key },
      body: JSON.stringify({
        agent_id: agent,
        agent_phone_number_id: phone,
        to_number: input.toNumber,
        conversation_initiation_client_data: { dynamic_variables: { impact_id: input.impactId, followup_day: String(input.day) } },
      }),
    },
  };
}

// In-memory store seeded from shared/data/seed.json, mirrored to Firestore when configured.
// Lives on globalThis so it survives hot reloads in dev.
import seed from "../shared/data/seed.json";
import {
  computeBaseline,
  dailyRisk,
  evaluateHitWatch,
  scoreLanding,
  RULES_VERSION,
  type CheckIn,
  type HitWatchDay,
  type HitWatchDecision,
  type LandingResult,
  type LandingScore,
  type RiskResult,
  type Urgency,
  type WearableDay,
  type Baseline,
} from "../shared/lib/index.ts";
import { mirror } from "./firestore.ts";

export const TODAY = seed.generated_for;

export interface HitCall extends HitWatchDay {
  date: string;
  call_completed: boolean;
  athlete_quote?: string;
  transcript?: { role: "agent" | "athlete"; text: string }[];
}

export interface HitCase {
  hit_id: string;
  hit_date: string;
  hit_description: string;
  source: string;
  impact_g?: number;
  baseline_symptoms: Record<string, number>;
  calls: HitCall[];
  today_decision: HitWatchDecision | null;
  next_call?: string;
  status: "active" | "closed";
}

export interface Athlete {
  id: string;
  name: string;
  sport: string;
  grade: number;
  device: string;
  phone?: string;
  wearable: { baseline: Baseline; baseline_days: WearableDay[]; recent: WearableDay[]; source: "seed" | "google_health" };
  checkins: CheckIn[];
  landing: { result: LandingResult; score: LandingScore; video_date: string; fixplan?: FixPlan } | null;
  hitwatch: HitCase | null;
  risk_today: RiskResult;
}

export interface FixPlan {
  focus: string;
  warmup: { name: string; sets: string; reps_or_time: string; cue: string; targets: string[] }[];
  retest_in_days: number;
}

export interface Alert {
  id: string;
  athlete_id: string;
  hit_id?: string;
  urgency: Urgency;
  summary: string;
  reasons: string[];
  recipients_suggested: string[];
  status: "pending_approval" | "approved" | "dismissed";
  created_at: string;
  decided_at?: string;
  decided_by?: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  athlete_id?: string;
  detail: string;
  rules_version: string;
}

export interface Signup {
  id: string;
  ts: string;
  name: string;
  email: string;
  school: string;
  role: string;
  athletes?: number;
}

interface State {
  athletes: Map<string, Athlete>;
  alerts: Alert[];
  audit: AuditEntry[];
  signups: Signup[];
  healthTokens: Map<string, { access_token: string; refresh_token?: string; expires_at: number }>;
}

const g = globalThis as unknown as { __ragnor?: State };

const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

function init(): State {
  const athletes = new Map<string, Athlete>();
  const alerts: Alert[] = [];
  for (const a of seed.athletes as unknown as (Athlete & { scenario: string; hitwatch: (HitCase & { alert_draft?: { urgency: Urgency; summary: string; recipients_suggested: string[] } | null }) | null })[]) {
    const { scenario: _s, ...rest } = a;
    const hit = a.hitwatch
      ? { ...a.hitwatch, status: "active" as const, next_call: "2026-11-15T16:00:00-08:00" }
      : null;
    // Demo arc: start BEFORE Maya's day-2 call, so the alert arrives live during the demo.
    // Set DEMO_START=after_call to start with the day-2 call done and the alert already queued.
    const preCall = process.env.DEMO_START !== "after_call";
    if (hit && preCall) {
      hit.calls = hit.calls.filter((c) => c.day < 2);
      hit.today_decision = null;
    }
    if (a.hitwatch?.alert_draft && !preCall) {
      alerts.push({
        id: "alert_seed_1",
        athlete_id: a.id,
        hit_id: a.hitwatch.hit_id,
        urgency: a.hitwatch.alert_draft.urgency,
        summary: a.hitwatch.alert_draft.summary,
        reasons: a.hitwatch.today_decision?.reasons ?? [],
        recipients_suggested: a.hitwatch.alert_draft.recipients_suggested,
        status: "pending_approval",
        created_at: `${TODAY}T07:42:00-08:00`,
      });
    }
    if (hit) delete (hit as { alert_draft?: unknown }).alert_draft;
    athletes.set(a.id, {
      ...(rest as unknown as Athlete),
      wearable: { ...a.wearable, source: "seed" },
      hitwatch: hit,
    });
  }
  const audit: AuditEntry[] = [
    {
      id: "aud_seed_0",
      ts: "2026-11-12T19:05:00-08:00",
      actor: "mouthguard",
      action: "hit_logged",
      athlete_id: "ath_01",
      detail: "Header collision vs Harbor High (68 g, simulated sensor). HitWatch started: 7 days of follow-up.",
      rules_version: RULES_VERSION,
    },
    {
      id: "aud_seed_1",
      ts: "2026-11-13T16:10:00-08:00",
      actor: "hitwatch_agent",
      action: "symptoms_logged",
      athlete_id: "ath_01",
      detail: "Day 1: symptom total 2. No change worth escalating.",
      rules_version: RULES_VERSION,
    },
  ];
  const s: State = { athletes, alerts, audit, signups: [], healthTokens: new Map() };
  g.__ragnor = s;
  for (const id of athletes.keys()) recomputeRisk(id);
  return s;
}

export function state(): State {
  if (!g.__ragnor) g.__ragnor = init();
  return g.__ragnor;
}

export function resetDemo() {
  g.__ragnor = init();
}

// ---------- reads ----------

export function listAthletes(): Athlete[] {
  const order = { high: 0, moderate: 1, low: 2 } as const;
  return [...state().athletes.values()].sort(
    (a, b) => order[a.risk_today.band] - order[b.risk_today.band] || b.risk_today.flags.length - a.risk_today.flags.length,
  );
}

export function getAthlete(id: string): Athlete | undefined {
  return state().athletes.get(id);
}

export function listAlerts(): Alert[] {
  return [...state().alerts].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function listAudit(athleteId?: string): AuditEntry[] {
  const all = [...state().audit].sort((a, b) => b.ts.localeCompare(a.ts));
  return athleteId ? all.filter((e) => e.athlete_id === athleteId) : all;
}

// ---------- writes ----------

export function audit(actor: string, action: string, detail: string, athlete_id?: string) {
  const e: AuditEntry = { id: uid("aud"), ts: nowIso(), actor, action, athlete_id, detail, rules_version: RULES_VERSION };
  state().audit.push(e);
  mirror("audit", e.id, e);
  return e;
}

export function recomputeRisk(id: string): RiskResult | undefined {
  const a = getAthlete(id);
  if (!a) return;
  const recent = a.wearable.recent;
  a.risk_today = dailyRisk({
    athlete_id: a.id,
    date: TODAY,
    checkins: a.checkins,
    wearable_recent: recent.length ? recent : undefined,
    wearable_baseline: recent.length ? a.wearable.baseline : undefined,
    latest_landing: a.landing?.score,
    active_hitwatch: a.hitwatch?.status === "active" ? a.hitwatch.today_decision : null,
  });
  mirror("athletes", a.id, { risk_today: a.risk_today });
  return a.risk_today;
}

export function addCheckin(id: string, c: CheckIn) {
  const a = getAthlete(id);
  if (!a) throw new Error("athlete not found");
  a.checkins = [...a.checkins.filter((x) => x.date !== c.date), c];
  mirror(`athletes/${id}/checkins`, c.date, c);
  audit("athlete", "checkin_logged", `Sleep ${c.sleep_h ?? "?"} h, load ${c.load_min ?? "?"} min, ${c.soreness.length} sore areas`, id);
  return recomputeRisk(id);
}

export function setLanding(id: string, result: LandingResult) {
  const a = getAthlete(id);
  if (!a) throw new Error("athlete not found");
  const score = scoreLanding(result);
  a.landing = { result, score, video_date: TODAY };
  mirror(`athletes/${id}/landing`, nowIso(), a.landing);
  audit("landingcheck", "landing_scored", `${score.score} landing errors, band ${score.band}`, id);
  recomputeRisk(id);
  return score;
}

export function setFixPlan(id: string, plan: FixPlan) {
  const a = getAthlete(id);
  if (!a?.landing) return;
  a.landing.fixplan = plan;
}

export function setWearable(id: string, days: WearableDay[], baselineDays: WearableDay[]) {
  const a = getAthlete(id);
  if (!a) throw new Error("athlete not found");
  a.wearable = { baseline: computeBaseline(baselineDays), baseline_days: baselineDays, recent: days, source: "google_health" };
  audit("google_health", "wearable_synced", `${days.length + baselineDays.length} days synced`, id);
  recomputeRisk(id);
}

export function createHit(id: string, opts: { description: string; source: string; impact_g?: number }): HitCase {
  const a = getAthlete(id);
  if (!a) throw new Error("athlete not found");
  const hit: HitCase = {
    hit_id: uid("hit"),
    hit_date: TODAY,
    hit_description: opts.description,
    source: opts.source,
    impact_g: opts.impact_g,
    baseline_symptoms: a.hitwatch?.baseline_symptoms ?? { fatigue: 1 },
    calls: [],
    today_decision: null,
    next_call: new Date(Date.now() + 2 * 3600_000).toISOString(),
    status: "active",
  };
  a.hitwatch = hit;
  mirror(`athletes/${id}/hits`, hit.hit_id, hit);
  audit(opts.source.startsWith("mouthguard") ? "mouthguard" : "coach", "hit_logged", `${opts.description}${opts.impact_g ? ` (${opts.impact_g} g)` : ""}. HitWatch started: 7 days of follow-up.`, id);
  recomputeRisk(id);
  return hit;
}

export function logHitWatch(args: {
  athlete_id: string;
  hit_id?: string;
  day: number;
  symptoms: Record<string, number>;
  red_flags: string[];
  worse_than_yesterday?: boolean;
  athlete_quote?: string;
  transcript?: HitCall["transcript"];
}) {
  const a = getAthlete(args.athlete_id);
  if (!a?.hitwatch) throw new Error("no active HitWatch case for athlete");
  const call: HitCall = {
    day: args.day,
    date: TODAY,
    call_completed: true,
    symptoms: args.symptoms,
    red_flags: args.red_flags,
    worse_than_yesterday: args.worse_than_yesterday,
    athlete_quote: args.athlete_quote,
    transcript: args.transcript,
  };
  a.hitwatch.calls = [...a.hitwatch.calls.filter((c) => c.day !== args.day), call].sort((x, y) => x.day - y.day);
  mirror(`athletes/${a.id}/hits`, a.hitwatch.hit_id, a.hitwatch);
  audit("hitwatch_agent", "symptoms_logged", `Day ${args.day}: symptom total ${Object.values(args.symptoms).reduce((s, v) => s + v, 0)}${args.red_flags.length ? `, red flags: ${args.red_flags.join(", ")}` : ""}`, a.id);
  return call;
}

export function compareHitWatch(athlete_id: string, day: number): HitWatchDecision {
  const a = getAthlete(athlete_id);
  if (!a?.hitwatch) throw new Error("no active HitWatch case for athlete");
  const today = a.hitwatch.calls.find((c) => c.day === day) ?? { day, symptoms: {}, red_flags: [] };
  const yesterday = a.hitwatch.calls.find((c) => c.day === day - 1);
  const decision = evaluateHitWatch({
    today,
    yesterday,
    baseline_symptoms: a.hitwatch.baseline_symptoms,
    wearable_recent: a.wearable.recent.length ? a.wearable.recent : undefined,
    wearable_baseline: a.wearable.recent.length ? a.wearable.baseline : undefined,
  });
  a.hitwatch.today_decision = decision;
  recomputeRisk(a.id);
  return decision;
}

export function draftAlert(args: { athlete_id: string; hit_id?: string; urgency: Urgency; summary: string; recipients_suggested: string[]; reasons?: string[] }): Alert {
  const existing = state().alerts.find((x) => x.athlete_id === args.athlete_id && x.status === "pending_approval");
  const alert: Alert = {
    id: existing?.id ?? uid("alert"),
    athlete_id: args.athlete_id,
    hit_id: args.hit_id,
    urgency: args.urgency,
    summary: args.summary,
    reasons: args.reasons ?? getAthlete(args.athlete_id)?.hitwatch?.today_decision?.reasons ?? [],
    recipients_suggested: args.recipients_suggested,
    status: "pending_approval",
    created_at: nowIso(),
  };
  state().alerts = [...state().alerts.filter((x) => x.id !== alert.id), alert];
  mirror("alerts", alert.id, alert);
  audit("hitwatch_agent", "alert_drafted", `${args.urgency.replace("_", "-")} alert queued for staff approval`, args.athlete_id);
  return alert;
}

export function decideAlert(id: string, decision: "approved" | "dismissed", by: string): Alert | undefined {
  const alert = state().alerts.find((x) => x.id === id);
  if (!alert) return;
  alert.status = decision;
  alert.decided_at = nowIso();
  alert.decided_by = by;
  mirror("alerts", alert.id, alert);
  audit(by, decision === "approved" ? "alert_approved" : "alert_dismissed", decision === "approved" ? `Approved: notify ${alert.recipients_suggested.join(", ")}` : "Dismissed by staff", alert.athlete_id);
  return alert;
}

export function addSignup(s: Omit<Signup, "id" | "ts">): Signup {
  const signup = { ...s, id: uid("signup"), ts: nowIso() };
  state().signups.push(signup);
  mirror("signups", signup.id, signup);
  return signup;
}

export function seasonReport() {
  const s = state();
  const athletes = [...s.athletes.values()];
  const hits = athletes.filter((a) => a.hitwatch);
  return {
    ...seed.season_report,
    athletes_enrolled: athletes.length,
    landing_screens_completed: athletes.filter((a) => a.landing).length,
    athletes_flagged_for_landing_work: athletes.filter((a) => a.landing && a.landing.score.band !== "low").length,
    hits_followed_up: hits.length,
    hitwatch_calls_completed: hits.reduce((n, a) => n + (a.hitwatch?.calls.filter((c) => c.call_completed).length ?? 0), 0),
    alerts_drafted: s.alerts.length,
    alerts_approved_by_staff: s.alerts.filter((x) => x.status === "approved").length,
    pilot_signups: s.signups.length,
    bands: {
      high: athletes.filter((a) => a.risk_today.band === "high").length,
      moderate: athletes.filter((a) => a.risk_today.band === "moderate").length,
      low: athletes.filter((a) => a.risk_today.band === "low").length,
    },
  };
}

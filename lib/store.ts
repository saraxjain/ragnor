// In-memory store seeded from shared/data/seed.json, mirrored to Firestore when configured.
// Lives on globalThis so it survives hot reloads in dev.
import { trustedOnly } from "./trust.ts";
import seed from "../shared/data/seed.json" with { type: "json" };
import {
  computeBaseline,
  dailyRisk,
  scoreLanding,
  RULES_VERSION,
  type CheckIn,
  type LandingResult,
  type LandingScore,
  type RiskResult,
  type Urgency,
  type WearableDay,
  type Baseline,
} from "../shared/lib/index.ts";
import { mirror } from "./firestore.ts";

export const TODAY = seed.generated_for;

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
  plan?: string;
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
  for (const a of seed.athletes as unknown as (Athlete & { scenario: string })[]) {
    const { scenario: _s, ...rest } = a;
    athletes.set(a.id, {
      ...(rest as unknown as Athlete),
      wearable: { ...a.wearable, source: "seed" },
    });
  }
  const audit: AuditEntry[] = [];
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
  // The rules engine only sees readings that passed the trust layer (lib/trust.ts).
  const recent = trustedOnly(a).wearable.recent;
  a.risk_today = dailyRisk({
    athlete_id: a.id,
    date: TODAY,
    checkins: a.checkins,
    wearable_recent: recent.length ? recent : undefined,
    wearable_baseline: recent.length ? a.wearable.baseline : undefined,
    latest_landing: a.landing?.score,
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

export const PROFILE_SPORTS = ["Girls Soccer", "Boys Soccer", "Girls Basketball", "Boys Basketball", "Girls Volleyball", "Football", "Gymnastics", "Track & Field", "Lacrosse", "Wrestling", "Other"] as const;
export const PROFILE_DEVICES = ["none", "Fitbit Charge", "Fitbit Inspire", "Fitbit Sense", "Pixel Watch"] as const;
export const USER_ID_RE = /^ath_u_[a-z0-9]{5,12}$/;

export interface NewAthlete {
  name: string;
  sport: string;
  grade: number;
  device: string;
}

/** Cleans and checks a self-created profile. Returns an error message, or the cleaned profile. */
export function parseNewAthlete(b: unknown): { error: string } | { value: NewAthlete } {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const name = String(o.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) return { error: "Enter your name (2 to 40 characters)." };
  if (!/^[\p{L}][\p{L} .'-]*$/u.test(name)) return { error: "Use only letters, spaces, apostrophes, periods and hyphens in your name." };
  const sport = PROFILE_SPORTS.find((x) => x === o.sport);
  if (!sport) return { error: "Choose a sport from the list." };
  const grade = Number(o.grade);
  if (!Number.isInteger(grade) || grade < 9 || grade > 12) return { error: "Choose a grade from 9 to 12." };
  const device = PROFILE_DEVICES.find((x) => x === o.device) ?? "none";
  return { value: { name, sport, grade, device } };
}

/**
 * Adds a self-created athlete with no history: no watch data, no check-ins, no landing screen.
 * `id` lets a browser restore its own profile after the demo server restarts (the store is in memory).
 */
export function createAthlete(p: NewAthlete, id?: string): Athlete {
  const s = state();
  const existing = id ? s.athletes.get(id) : undefined;
  if (existing) return existing;
  let newId = id && USER_ID_RE.test(id) ? id : uid("ath_u");
  while (s.athletes.has(newId)) newId = uid("ath_u");
  const a: Athlete = {
    id: newId,
    name: p.name,
    sport: p.sport,
    grade: p.grade,
    device: p.device,
    wearable: { baseline: { hrv_ms: null, rhr_bpm: null, sleep_h: null, days_used: 0 }, baseline_days: [], recent: [], source: "seed" },
    checkins: [],
    landing: null,
    risk_today: { athlete_id: newId, date: TODAY, band: "low", flags: [] } as unknown as RiskResult, // replaced by recomputeRisk below
  };
  s.athletes.set(newId, a);
  recomputeRisk(newId);
  mirror("athletes", newId, { id: newId, name: a.name, sport: a.sport, grade: a.grade, device: a.device });
  audit("athlete", "profile_created", `${a.sport}, grade ${a.grade}, ${a.device === "none" ? "no watch" : a.device}`, newId);
  return a;
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

export function draftAlert(args: { athlete_id: string; urgency: Urgency; summary: string; recipients_suggested: string[]; reasons?: string[] }): Alert {
  const existing = state().alerts.find((x) => x.athlete_id === args.athlete_id && x.status === "pending_approval");
  const alert: Alert = {
    id: existing?.id ?? uid("alert"),
    athlete_id: args.athlete_id,
    urgency: args.urgency,
    summary: args.summary,
    reasons: args.reasons ?? [],
    recipients_suggested: args.recipients_suggested,
    status: "pending_approval",
    created_at: nowIso(),
  };
  state().alerts = [...state().alerts.filter((x) => x.id !== alert.id), alert];
  mirror("alerts", alert.id, alert);
  audit("athlete", "alert_drafted", `${args.urgency.replace("_", "-")} alert queued for staff approval`, args.athlete_id);
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
  return {
    ...seed.season_report,
    athletes_enrolled: athletes.length,
    landing_screens_completed: athletes.filter((a) => a.landing).length,
    athletes_flagged_for_landing_work: athletes.filter((a) => a.landing && a.landing.score.band !== "low").length,
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

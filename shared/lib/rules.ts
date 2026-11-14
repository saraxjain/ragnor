// Ragnor rules engine. Plain, versioned if-then rules. Gemini extracts and explains; THIS decides the band.
// Every flag records its rule_id and RULES_VERSION for the audit log.
// Thresholds are starting points for the demo, to be reviewed with a sports-medicine advisor.

import { compareToBaseline } from "./baseline.ts";
import type {
  Band,
  Baseline,
  CheckIn,
  Flag,
  HitWatchDay,
  HitWatchDecision,
  LandingResult,
  RiskResult,
  Urgency,
  WearableDay,
} from "./types.ts";

export const RULES_VERSION = "2026-11-14.1";

const BAND_ORDER: Band[] = ["low", "moderate", "high"];
const maxBand = (a: Band, b: Band): Band => (BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b) ? a : b);

// ---------- LandingCheck ----------

export const LANDING_MIN_CONFIDENCE = 0.5;
const KNEE_ITEMS = new Set(["knee_valgus_contact", "knee_valgus_max", "knee_flexion_contact", "stiff_landing_overall"]);

export interface LandingScore {
  score: number; // count of confident errors (out of 10)
  band: Band;
  knee_errors: number;
  errors: string[];
  rules_version: string;
}

/** LESS-style band: 0-2 errors low, 3-4 moderate, 5+ high, and two or more knee errors is at least moderate. */
export function scoreLanding(result: LandingResult): LandingScore {
  const confident = result.video_ok
    ? result.items.filter((i) => i.present && i.confidence >= LANDING_MIN_CONFIDENCE)
    : [];
  const score = confident.length;
  const knee_errors = confident.filter((i) => KNEE_ITEMS.has(i.id)).length;
  let band: Band = score >= 5 ? "high" : score >= 3 ? "moderate" : "low";
  if (knee_errors >= 2) band = maxBand(band, "moderate");
  return { score, band, knee_errors, errors: confident.map((i) => i.id), rules_version: RULES_VERSION };
}

// ---------- Daily risk ----------

export interface DailyRiskInput {
  athlete_id: string;
  date: string;
  checkins: CheckIn[]; // last 14 days, any order
  wearable_recent?: WearableDay[];
  wearable_baseline?: Baseline;
  latest_landing?: LandingScore;
  active_hitwatch?: HitWatchDecision | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function dailyRisk(input: DailyRiskInput): RiskResult {
  const flags: Flag[] = [];
  const sorted = [...input.checkins].sort((a, b) => a.date.localeCompare(b.date));
  const thisWeek = sorted.filter((c) => {
    const d = daysBetween(c.date, input.date);
    return d >= 0 && d < 7;
  });
  const lastWeek = sorted.filter((c) => {
    const d = daysBetween(c.date, input.date);
    return d >= 7 && d < 14;
  });
  const last3 = sorted.filter((c) => {
    const d = daysBetween(c.date, input.date);
    return d >= 0 && d < 3;
  });

  // R1: short sleep 3 nights running + load jump > 25% week over week
  const shortSleepNights = last3.filter((c) => c.sleep_h != null && c.sleep_h < 6).length;
  const loadThis = sum(thisWeek.map((c) => c.load_min ?? 0));
  const loadLast = sum(lastWeek.map((c) => c.load_min ?? 0));
  const loadJumpPct = loadLast > 0 ? Math.round(((loadThis - loadLast) / loadLast) * 100) : null;
  if (shortSleepNights >= 3 && loadJumpPct != null && loadJumpPct > 25) {
    flags.push({
      rule_id: "R1_sleep_load",
      band: "moderate",
      reason: `Under 6 hours of sleep for 3 nights while practice load rose ${loadJumpPct}% from last week`,
    });
  } else if (loadJumpPct != null && loadJumpPct > 50) {
    // R2: big load spike on its own
    flags.push({
      rule_id: "R2_load_spike",
      band: "moderate",
      reason: `Practice load is up ${loadJumpPct}% from last week`,
    });
  }

  // R3: same area sore (>=2) on 2+ of the last 3 days; R4: any area at 3 today
  const areaDays = new Map<string, number>();
  for (const c of last3) for (const s of c.soreness) if (s.level >= 2) areaDays.set(s.area, (areaDays.get(s.area) ?? 0) + 1);
  for (const [area, n] of areaDays) {
    if (n >= 2) flags.push({ rule_id: "R3_persistent_soreness", band: "moderate", area, reason: `${prettyArea(area)} sore for ${n} of the last 3 days` });
  }
  const today = sorted.find((c) => c.date === input.date);
  for (const s of today?.soreness ?? []) {
    if (s.level >= 3) flags.push({ rule_id: "R4_severe_soreness", band: "high", area: s.area, reason: `${prettyArea(s.area)} soreness is severe today (3 of 3)` });
  }

  // R5: wearable below the athlete's own baseline
  if (input.wearable_recent && input.wearable_baseline) {
    const cmp = compareToBaseline(input.wearable_recent, input.wearable_baseline);
    if (cmp.below_baseline) flags.push({ rule_id: "R5_wearable_below_baseline", band: "moderate", reason: cmp.reasons.join("; ") });
  }

  // R6: latest landing screen
  if (input.latest_landing && input.latest_landing.band !== "low") {
    flags.push({
      rule_id: "R6_landing",
      band: input.latest_landing.band,
      area: "knee",
      reason: `Last landing screen showed ${input.latest_landing.score} landing errors (${input.latest_landing.knee_errors} at the knee)`,
    });
  }

  // R7: active HitWatch escalation always surfaces
  if (input.active_hitwatch?.escalate) {
    flags.push({
      rule_id: "R7_hitwatch",
      band: input.active_hitwatch.urgency === "routine" ? "moderate" : "high",
      area: "head",
      reason: `HitWatch: ${input.active_hitwatch.reasons.join("; ")}`,
    });
  }

  // R8: red flags in today's check-in are always high
  if (today && today.red_flags.length > 0) {
    flags.push({ rule_id: "R8_red_flag", band: "high", area: "head", reason: `Emergency sign reported: ${today.red_flags.join(", ")}` });
  }

  let band: Band = flags.reduce<Band>((b, f) => maxBand(b, f.band), "low");
  // Two or more independent moderate flags -> high
  if (band === "moderate" && new Set(flags.filter((f) => f.band === "moderate").map((f) => f.rule_id)).size >= 2) band = "high";

  // Highest-band flags first, so the coach sees the most important reason at the top.
  flags.sort((a, b) => BAND_ORDER.indexOf(b.band) - BAND_ORDER.indexOf(a.band));

  const low_confidence = !today || (today.sleep_h == null && today.load_min == null && !input.wearable_recent?.length);
  return { athlete_id: input.athlete_id, date: input.date, band, flags, low_confidence, rules_version: RULES_VERSION };
}

// ---------- HitWatch ----------

export const SYMPTOM_RISE_THRESHOLD = 3; // total rise over the athlete's own baseline
export const NEW_SYMPTOM_SEVERITY = 3; // any one symptom >= 3 that wasn't there at baseline

export function evaluateHitWatch(args: {
  today: HitWatchDay;
  yesterday?: HitWatchDay;
  baseline_symptoms: Record<string, number>; // preseason symptom checklist (0-6 each)
  wearable_recent?: WearableDay[];
  wearable_baseline?: Baseline;
}): HitWatchDecision {
  const { today, yesterday, baseline_symptoms } = args;
  const totalToday = sum(Object.values(today.symptoms));
  const totalBase = sum(Object.values(baseline_symptoms));
  const reasons: string[] = [];
  let urgency: Urgency = "routine";
  let escalate = false;

  const raise = (u: Urgency) => {
    escalate = true;
    if (["routine", "same_day", "urgent"].indexOf(u) > ["routine", "same_day", "urgent"].indexOf(urgency)) urgency = u;
  };

  if (today.red_flags.length > 0) {
    reasons.push(`Emergency sign reported: ${today.red_flags.map((r) => r.replaceAll("_", " ")).join(", ")}`);
    raise("urgent");
  }

  const rise = totalToday - totalBase;
  if (rise >= SYMPTOM_RISE_THRESHOLD) {
    reasons.push(`Symptom score is ${totalToday}, up ${rise} from their preseason ${totalBase}`);
    raise("same_day");
  }

  const newOnes = Object.entries(today.symptoms)
    .filter(([name, sev]) => sev >= NEW_SYMPTOM_SEVERITY && (baseline_symptoms[name] ?? 0) < NEW_SYMPTOM_SEVERITY)
    .map(([name, sev]) => `${name.replaceAll("_", " ")} (${sev}/6)`);
  if (newOnes.length) {
    reasons.push(`New or stronger symptoms: ${newOnes.join(", ")}`);
    raise("same_day");
  }

  const yTotal = yesterday ? sum(Object.values(yesterday.symptoms)) : null;
  const scoreRose = yTotal != null && totalToday > yTotal;
  if (scoreRose || today.worse_than_yesterday) {
    reasons.push(scoreRose ? `Worse than yesterday (${yTotal} to ${totalToday})` : "Athlete says it's worse than yesterday");
    raise("same_day");
  }

  const wearable =
    args.wearable_recent && args.wearable_baseline
      ? compareToBaseline(args.wearable_recent, args.wearable_baseline)
      : { data_available: false, hrv_pct_vs_baseline: null, rhr_delta_bpm: null, sleep_h_avg_3d: null, below_baseline: false, reasons: [] };

  if (wearable.below_baseline) {
    reasons.push(`Body not back to baseline yet: ${wearable.reasons.join("; ")}`);
    raise("routine"); // wearable alone never jumps the queue; it asks a human to look
  }

  return {
    escalate,
    urgency: escalate ? urgency : "routine",
    reasons,
    symptom_total_today: totalToday,
    symptom_total_baseline: totalBase,
    wearable,
    rules_version: RULES_VERSION,
  };
}

function prettyArea(area: string): string {
  const side = area.endsWith("_l") ? "Left " : area.endsWith("_r") ? "Right " : "";
  const base = area.replace(/_(l|r)$/, "").replaceAll("_", " ");
  const s = side + base;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

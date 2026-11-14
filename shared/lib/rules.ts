// Ragnor rules engine. Plain, versioned if-then rules. Gemini extracts and explains; THIS decides the band.
// Every flag records its rule_id and RULES_VERSION for the audit log.
// Thresholds are starting points for the demo, to be reviewed with a sports-medicine advisor.

import { compareToBaseline } from "./baseline.ts";
import type {
  Band,
  Baseline,
  CheckIn,
  Flag,
  LandingResult,
  RiskResult,
  WearableDay,
} from "./types.ts";

export const RULES_VERSION = "2026-11-14.3";

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

  // R9: under-fueled on a hard day (meals come from the tap check-in)
  if (today && today.meals != null && today.meals <= 1 && (today.intensity === "hard" || (today.effort ?? 0) >= 8 || (today.load_min ?? 0) >= 90)) {
    flags.push({ rule_id: "R9_fuel", band: "moderate", reason: `Only ${today.meals} meal${today.meals === 1 ? "" : "s"} logged on a hard practice day` });
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

function prettyArea(area: string): string {
  const side = area.endsWith("_l") ? "Left " : area.endsWith("_r") ? "Right " : "";
  const base = area.replace(/_(l|r)$/, "").replaceAll("_", " ");
  const s = side + base;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

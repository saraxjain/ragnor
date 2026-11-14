import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBaseline,
  compareToBaseline,
  dailyRisk,
  evaluateHitWatch,
  scoreLanding,
  sanitize,
  sanitizeDeep,
  findViolations,
  SAFE_REPLACEMENT,
  type CheckIn,
  type LandingResult,
  type WearableDay,
} from "./index.ts";

const day = (date: string, hrv: number | null, rhr: number | null, sleep: number | null): WearableDay => ({
  date,
  hrv_ms: hrv,
  rhr_bpm: rhr,
  sleep_h: sleep,
});

const baselineDays = Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, 70, 55, 8));

// ---------- baseline ----------

test("baseline averages and needs 3+ days", () => {
  assert.equal(computeBaseline(baselineDays.slice(0, 2)).hrv_ms, null);
  const b = computeBaseline(baselineDays);
  assert.deepEqual(b, { hrv_ms: 70, rhr_bpm: 55, sleep_h: 8, days_used: 10 });
});

test("compareToBaseline flags HRV drop, RHR rise and short sleep", () => {
  const b = computeBaseline(baselineDays);
  const recent = [day("2026-11-12", 56, 61, 5.5), day("2026-11-13", 57, 61, 5.5), day("2026-11-14", 55, 61, 5.5)];
  const c = compareToBaseline(recent, b);
  assert.equal(c.below_baseline, true);
  assert.equal(c.hrv_pct_vs_baseline, -20);
  assert.equal(c.rhr_delta_bpm, 6);
  assert.equal(c.reasons.length, 3);
});

test("compareToBaseline is quiet when the athlete is at their normal", () => {
  const b = computeBaseline(baselineDays);
  const c = compareToBaseline([day("2026-11-14", 69, 56, 7.8)], b);
  assert.equal(c.below_baseline, false);
});

test("compareToBaseline reports missing data instead of guessing", () => {
  const b = computeBaseline(baselineDays);
  const c = compareToBaseline([day("2026-11-14", null, null, null)], b);
  assert.equal(c.data_available, false);
  assert.equal(c.below_baseline, false);
});

// ---------- landing ----------

const item = (id: string, present: boolean, confidence = 0.8) => ({
  id,
  present,
  side: "left" as const,
  timestamp_s: 1.4,
  confidence,
  plain_language: "x",
});

test("landing: two confident knee errors is at least moderate; low-confidence items are ignored", () => {
  const r: LandingResult = {
    video_ok: true,
    view: "front",
    summary: "",
    items: [item("knee_valgus_contact", true), item("knee_valgus_max", true), item("foot_rotation", true, 0.3)],
  };
  const s = scoreLanding(r);
  assert.equal(s.score, 2);
  assert.equal(s.band, "moderate");
});

test("landing: 5+ errors is high; bad video scores nothing", () => {
  const ids = ["knee_valgus_contact", "knee_flexion_contact", "trunk_flexion_contact", "stance_width", "heel_first_landing"];
  const r: LandingResult = { video_ok: true, view: "front_and_side", summary: "", items: ids.map((i) => item(i, true)) };
  assert.equal(scoreLanding(r).band, "high");
  assert.equal(scoreLanding({ ...r, video_ok: false }).score, 0);
});

// ---------- daily risk ----------

function checkin(date: string, sleep: number, load: number, soreness: CheckIn["soreness"] = []): CheckIn {
  return { date, sleep_h: sleep, load_min: load, intensity: "hard", soreness, took_hit: false, symptoms: [], red_flags: [] };
}

test("daily: short sleep 3 nights + >25% load jump -> moderate (R1)", () => {
  const last = ["2026-11-04", "2026-11-05", "2026-11-06"].map((d) => checkin(d, 8, 90));
  const now = ["2026-11-12", "2026-11-13", "2026-11-14"].map((d) => checkin(d, 5.5, 120));
  const r = dailyRisk({ athlete_id: "a1", date: "2026-11-14", checkins: [...last, ...now] });
  assert.equal(r.band, "moderate");
  assert.equal(r.flags[0].rule_id, "R1_sleep_load");
  assert.match(r.flags[0].reason, /33%/);
});

test("daily: severe soreness today -> high (R4)", () => {
  const r = dailyRisk({
    athlete_id: "a1",
    date: "2026-11-14",
    checkins: [checkin("2026-11-14", 8, 60, [{ area: "hamstring_l", level: 3 }])],
  });
  assert.equal(r.band, "high");
  assert.equal(r.flags[0].reason, "Left hamstring soreness is severe today (3 of 3)");
});

test("daily: two independent moderate flags -> high", () => {
  const sore = [{ area: "knee_r", level: 2 }];
  const checkins = [checkin("2026-11-13", 8, 60, sore), checkin("2026-11-14", 8, 60, sore)];
  const landing = { score: 3, band: "moderate" as const, knee_errors: 2, errors: [], rules_version: "" };
  const r = dailyRisk({ athlete_id: "a1", date: "2026-11-14", checkins, latest_landing: landing });
  assert.equal(r.band, "high");
});

test("daily: nothing going on -> low, and missing check-in marks low confidence", () => {
  const r = dailyRisk({ athlete_id: "a1", date: "2026-11-14", checkins: [] });
  assert.equal(r.band, "low");
  assert.equal(r.low_confidence, true);
});

test("daily: one meal on a hard day -> moderate (R9)", () => {
  const c = { ...checkin("2026-11-14", 8, 100), meals: 1, effort: 9 };
  const r = dailyRisk({ athlete_id: "a1", date: "2026-11-14", checkins: [c] });
  assert.equal(r.band, "moderate");
  assert.equal(r.flags[0].rule_id, "R9_fuel");
  assert.equal(r.flags[0].reason, "Only 1 meal logged on a hard practice day");
});

// ---------- HitWatch ----------

test("hitwatch: any red flag is urgent", () => {
  const d = evaluateHitWatch({
    today: { day: 2, symptoms: { headache: 1 }, red_flags: ["repeated_vomiting"] },
    baseline_symptoms: {},
  });
  assert.equal(d.escalate, true);
  assert.equal(d.urgency, "urgent");
});

test("hitwatch: delayed headache + HRV below baseline -> same-day escalation with both reasons", () => {
  const b = computeBaseline(baselineDays);
  const d = evaluateHitWatch({
    today: { day: 2, symptoms: { headache: 3, light_sensitivity: 2, feeling_in_a_fog: 1 }, red_flags: [] },
    yesterday: { day: 1, symptoms: { headache: 1 }, red_flags: [] },
    baseline_symptoms: { fatigue: 1 },
    wearable_recent: [day("2026-11-13", 58, 58, 6.5), day("2026-11-14", 56, 58, 6.2)],
    wearable_baseline: b,
  });
  assert.equal(d.escalate, true);
  assert.equal(d.urgency, "same_day");
  assert.equal(d.symptom_total_today, 6);
  assert.ok(d.reasons.some((r) => r.startsWith("Symptom score is 6, up 5")));
  assert.ok(d.reasons.some((r) => r.includes("headache (3/6)")));
  assert.ok(d.reasons.some((r) => r.startsWith("Worse than yesterday (1 to 6)")));
  assert.ok(d.reasons.some((r) => r.startsWith("Body not back to baseline yet")));
});

test("hitwatch: no change from baseline -> no escalation", () => {
  const d = evaluateHitWatch({
    today: { day: 3, symptoms: { fatigue: 1 }, red_flags: [] },
    baseline_symptoms: { fatigue: 1 },
  });
  assert.equal(d.escalate, false);
  assert.equal(d.reasons.length, 0);
});

test("hitwatch: wearable-only change asks for a routine human look, never urgent", () => {
  const b = computeBaseline(baselineDays);
  const d = evaluateHitWatch({
    today: { day: 4, symptoms: {}, red_flags: [] },
    baseline_symptoms: {},
    wearable_recent: [day("2026-11-14", 50, 55, 8)],
    wearable_baseline: b,
  });
  assert.equal(d.escalate, true);
  assert.equal(d.urgency, "routine");
});

// ---------- guardrails ----------

test("guardrail blocks clearance and diagnosis language", () => {
  const bad = [
    "You're fine to play tomorrow.",
    "You are cleared to return.",
    "This looks like a diagnosis of concussion.",
    "It is safe to play.",
    "You don't have a concussion.",
    "She has a concussion.",
    "You can return to play on Monday.",
    "This warm-up prevents ACL injuries.",
  ];
  for (const s of bad) assert.ok(findViolations(s).length > 0, s);
});

test("guardrail keeps safe text and replaces only the offending sentence", () => {
  const r = sanitize("Your left knee caves in as you land. You're fine to play though. Try soft landings.");
  assert.equal(r.changed, true);
  assert.equal(r.text, `Your left knee caves in as you land. ${SAFE_REPLACEMENT} Try soft landings.`);
  assert.equal(sanitize("Lower risk right now. Keep landing softly.").changed, false);
  assert.equal(findViolations(SAFE_REPLACEMENT).length, 0);
});

test("sanitizeDeep cleans every string in a Gemini JSON response", () => {
  const blocked: string[] = [];
  const out = sanitizeDeep({ summary: "You are cleared.", items: [{ plain_language: "Knees in." }] }, blocked);
  assert.equal(out.summary, SAFE_REPLACEMENT);
  assert.equal(out.items[0].plain_language, "Knees in.");
  assert.deepEqual(blocked, ["cleared"]);
});

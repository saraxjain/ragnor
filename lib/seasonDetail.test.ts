import { test } from "node:test";
import assert from "node:assert/strict";
import { athleteSeason, issuesFromFlag, lastDates, seasonDetail } from "./seasonDetail.ts";
import type { Athlete } from "./store.ts";
import type { CheckIn, RiskResult } from "../shared/lib/index.ts";

const TODAY = "2026-11-14";
const dates = lastDates(TODAY);

function checkin(date: string, over: Partial<CheckIn> = {}): CheckIn {
  return { date, sleep_h: 8, soreness: [], load_min: 60, intensity: "moderate", took_hit: false, symptoms: [], red_flags: [], ...over };
}
function athlete(id: string, checkins: CheckIn[], risk: Partial<RiskResult> = {}, over: Partial<Athlete> = {}): Athlete {
  return {
    id, name: `Athlete ${id}`, sport: "Girls Soccer", grade: 10, device: "none",
    wearable: { baseline: { hrv_ms: null, rhr_bpm: null, sleep_h: null, days_used: 0 }, baseline_days: [], recent: [], source: "seed" },
    checkins, landing: null,
    risk_today: { athlete_id: id, date: TODAY, band: "low", flags: [], low_confidence: false, rules_version: "t", ...risk },
    ...over,
  };
}

test("lastDates: 14 days in order, ending today", () => {
  assert.equal(dates.length, 14);
  assert.equal(dates[0], "2026-11-01");
  assert.equal(dates.at(-1), TODAY);
});

test("a steady athlete has no issues and a full check-in record", () => {
  const r = athleteSeason(athlete("a", dates.map((d) => checkin(d))), [], TODAY);
  assert.deepEqual(r.issues, []);
  assert.equal(r.checkins.done_14, 14);
  assert.equal(r.trend, "steady");
  assert.ok(r.days.every((d) => d.status === "low"));
  assert.equal(r.sleep.avg_7, 8);
});

test("missed days are marked and raised as an issue; days before the first check-in are not counted", () => {
  const some = dates.filter((_, i) => i >= 4 && ![9, 11, 12].includes(i)).map((d) => checkin(d));
  const r = athleteSeason(athlete("b", some), [], TODAY);
  assert.deepEqual(r.days.slice(0, 4).map((d) => d.status), ["none", "none", "none", "none"]);
  assert.equal(r.days[9].status, "missed");
  assert.equal(r.checkins.expected_14, 10);
  assert.equal(r.checkins.done_14, 7);
  const missed = r.issues.find((i) => i.key === "missed");
  assert.match(missed?.text ?? "", /Missed 3 of the last 7/);
});

test("a brand-new profile has no history, no missed-check-in issue and a 'new' trend", () => {
  const r = athleteSeason(athlete("c", []), [], TODAY);
  assert.ok(r.days.every((d) => d.status === "none"));
  assert.equal(r.trend, "new");
  assert.deepEqual(r.issues, []);
});

test("slow patterns are raised even when today's rules are quiet: short sleep and a lingering sore area", () => {
  const cs = dates.map((d, i) => checkin(d, { sleep_h: [8, 10, 12].includes(i) ? 5 : 8, soreness: [1, 3, 5, 7].includes(i) ? [{ area: "quad_l", level: 2 }] : [] }));
  const r = athleteSeason(athlete("d", cs), [], TODAY);
  assert.match(r.issues.find((i) => i.key === "sleep")?.text ?? "", /3 of the last 7 nights/);
  assert.match(r.issues.find((i) => i.key === "soreness")?.text ?? "", /Left quad sore on 4 of the last 14 days/);
  assert.equal(r.sore_areas[0].name, "Left quad");
});

test("today's flags come first, in the rules engine's own words, grouped for coaches", () => {
  assert.deepEqual(issuesFromFlag({ rule_id: "R5_wearable_below_baseline", band: "moderate", reason: "HRV is 20% below this athlete's normal; Averaging 5.5 hours of sleep over the last 3 nights" }).map((i) => i.key), ["recovery", "sleep"]);
  const flags = [{ rule_id: "R4_severe_soreness", band: "high" as const, area: "knee_r", reason: "Right knee soreness is severe today (3 of 3)" }];
  const r = athleteSeason(athlete("e", dates.map((d) => checkin(d)), { band: "high", flags }), [], TODAY);
  assert.equal(r.band, "high");
  assert.equal(r.days.at(-1)?.status, "high");
  assert.deepEqual(r.issues[0], { key: "soreness", level: "high", text: flags[0].reason });
});

test("team roll-up: worst athletes first, issues counted once per athlete, new profiles left out of the daily counts", () => {
  const flags = [{ rule_id: "R2_load_spike", band: "moderate" as const, reason: "Practice load is up 60% from last week" }];
  const d = seasonDetail([
    athlete("ok", dates.map((x) => checkin(x))),
    athlete("flagged", dates.map((x) => checkin(x)), { band: "moderate", flags }),
    athlete("new", []),
  ], [], TODAY);
  assert.equal(d.athletes[0].id, "flagged");
  assert.equal(d.team.need_look, 1);
  assert.equal(d.team.checkin_pct_14, 100);
  assert.deepEqual(d.team.issues.map((i) => [i.key, i.athletes.length]), [["load", 1]]);
  const last = d.team.by_day.at(-1)!;
  assert.deepEqual([last.high, last.moderate, last.low, last.missed], [0, 1, 1, 0]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_SCENARIOS, isSampleScenario, sampleWearable, type SampleScenario } from "./sampleWearable.ts";
import { compareToBaseline, computeBaseline, dailyRisk } from "../shared/lib/index.ts";

const END = "2026-11-14";
const SEEDS = ["ath_01", "ath_07", "ath_u_abc123", "x", "another-athlete"];
const scenarios = Object.keys(SAMPLE_SCENARIOS) as SampleScenario[];

test("shape: 21 baseline nights then 7 recent nights, in date order, ending on the given day", () => {
  for (const s of scenarios) {
    const w = sampleWearable(s, "ath_01", END);
    assert.equal(w.baseline_days.length, 21);
    assert.equal(w.recent.length, 7);
    const dates = [...w.baseline_days, ...w.recent].map((d) => d.date);
    assert.deepEqual(dates, [...dates].sort());
    assert.equal(new Set(dates).size, 28);
    assert.equal(dates.at(-1), END);
    assert.equal(dates[0], "2026-10-18");
  }
});

test("repeatable: same athlete and scenario give the same numbers; different athletes differ", () => {
  assert.deepEqual(sampleWearable("hrv_drop", "ath_01", END), sampleWearable("hrv_drop", "ath_01", END));
  assert.notDeepEqual(sampleWearable("steady", "ath_01", END).baseline_days, sampleWearable("steady", "ath_02", END).baseline_days);
});

test("values stay in a believable range for a teenage athlete", () => {
  for (const s of scenarios) for (const seed of SEEDS) {
    const w = sampleWearable(s, seed, END);
    for (const d of [...w.baseline_days, ...w.recent]) {
      if (d.hrv_ms != null) assert.ok(d.hrv_ms > 25 && d.hrv_ms < 90, `hrv ${d.hrv_ms}`);
      if (d.rhr_bpm != null) assert.ok(d.rhr_bpm > 45 && d.rhr_bpm < 80, `rhr ${d.rhr_bpm}`);
      if (d.sleep_h != null) assert.ok(d.sleep_h >= 3 && d.sleep_h < 10, `sleep ${d.sleep_h}`);
    }
  }
});

test("each scenario flags, or does not flag, exactly as labelled, for every athlete", () => {
  for (const s of scenarios) for (const seed of SEEDS) {
    const w = sampleWearable(s, seed, END);
    const baseline = computeBaseline(w.baseline_days);
    const cmp = compareToBaseline(w.recent, baseline);
    assert.equal(cmp.data_available, true, `${s}/${seed} has data`);
    assert.equal(cmp.below_baseline, SAMPLE_SCENARIOS[s].expectFlag, `${s}/${seed}: ${cmp.reasons.join("; ") || "no reasons"}`);
    const risk = dailyRisk({ athlete_id: seed, date: END, checkins: [], wearable_recent: w.recent, wearable_baseline: baseline });
    assert.equal(risk.flags.some((f) => f.rule_id === "R5_wearable_below_baseline"), SAMPLE_SCENARIOS[s].expectFlag, `${s}/${seed} rule R5`);
  }
});

test("each scenario trips the signal it is named for", () => {
  const reasons = (s: SampleScenario) => { const w = sampleWearable(s, "ath_01", END); return compareToBaseline(w.recent, computeBaseline(w.baseline_days)).reasons.join(" | "); };
  assert.match(reasons("hrv_drop"), /HRV is/);
  assert.doesNotMatch(reasons("hrv_drop"), /Resting heart rate/);
  assert.match(reasons("rhr_up"), /Resting heart rate/);
  assert.doesNotMatch(reasons("rhr_up"), /HRV is/);
  assert.match(reasons("short_sleep"), /hours of sleep/);
  const all = reasons("overreached");
  assert.match(all, /HRV is/); assert.match(all, /Resting heart rate/); assert.match(all, /hours of sleep/);
});

test("patchy wear has missing nights but still compares against the baseline", () => {
  const w = sampleWearable("patchy", "ath_01", END);
  assert.equal(w.recent.filter((d) => d.hrv_ms == null).length, 2);
  assert.equal(compareToBaseline(w.recent, computeBaseline(w.baseline_days)).data_available, true);
});

test("scenario names are validated", () => {
  assert.equal(isSampleScenario("steady"), true);
  assert.equal(isSampleScenario("constructor"), false);
  assert.equal(isSampleScenario(42), false);
});

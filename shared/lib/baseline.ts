// Personal wearable baselines and comparisons.
// Evidence note: HRV tends to drop after concussion and recover with symptoms, but it lags and can't diagnose.
// So this module only ever says "below / not below the athlete's own baseline."

import type { Baseline, WearableComparison, WearableDay } from "./types.ts";

export const HRV_DROP_PCT = 15; // flag if 3-day HRV avg is >= 15% below baseline
export const RHR_RISE_BPM = 5; // flag if 3-day resting HR avg is >= 5 bpm above baseline
export const SHORT_SLEEP_H = 6;

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Baseline = average of the given days (use preseason / pre-hit days). Needs at least 3 days. */
export function computeBaseline(days: WearableDay[]): Baseline {
  const used = days.filter((d) => d.hrv_ms != null || d.rhr_bpm != null || d.sleep_h != null);
  if (used.length < 3) return { hrv_ms: null, rhr_bpm: null, sleep_h: null, days_used: used.length };
  const hrv = mean(used.map((d) => d.hrv_ms));
  const rhr = mean(used.map((d) => d.rhr_bpm));
  const sleep = mean(used.map((d) => d.sleep_h));
  return {
    hrv_ms: hrv == null ? null : round1(hrv),
    rhr_bpm: rhr == null ? null : round1(rhr),
    sleep_h: sleep == null ? null : round1(sleep),
    days_used: used.length,
  };
}

/** Compare the most recent 3 days to the baseline. */
export function compareToBaseline(recent: WearableDay[], baseline: Baseline): WearableComparison {
  const last3 = [...recent].sort((a, b) => a.date.localeCompare(b.date)).slice(-3);
  const hrv = mean(last3.map((d) => d.hrv_ms));
  const rhr = mean(last3.map((d) => d.rhr_bpm));
  const sleep = mean(last3.map((d) => d.sleep_h));

  const data_available = last3.length > 0 && (hrv != null || rhr != null || sleep != null) && baseline.days_used >= 3;
  const reasons: string[] = [];

  const hrv_pct =
    hrv != null && baseline.hrv_ms ? round1(((hrv - baseline.hrv_ms) / baseline.hrv_ms) * 100) : null;
  const rhr_delta = rhr != null && baseline.rhr_bpm != null ? round1(rhr - baseline.rhr_bpm) : null;

  if (data_available) {
    if (hrv_pct != null && hrv_pct <= -HRV_DROP_PCT) {
      reasons.push(`HRV is ${Math.abs(hrv_pct)}% below this athlete's normal over the last 3 nights`);
    }
    if (rhr_delta != null && rhr_delta >= RHR_RISE_BPM) {
      reasons.push(`Resting heart rate is ${rhr_delta} bpm above normal`);
    }
    if (sleep != null && sleep < SHORT_SLEEP_H) {
      reasons.push(`Averaging ${round1(sleep)} hours of sleep over the last 3 nights`);
    }
  }

  return {
    data_available,
    hrv_pct_vs_baseline: hrv_pct,
    rhr_delta_bpm: rhr_delta,
    sleep_h_avg_3d: sleep == null ? null : round1(sleep),
    below_baseline: reasons.length > 0,
    reasons,
  };
}

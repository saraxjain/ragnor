// Feature pipeline: raw athlete data -> model-ready risk features.
// Uses established sports-science load metrics: acute:chronic workload ratio (ACWR), training monotony and strain
// (Foster), plus wearable deviations from the athlete's own baseline.

import type { CheckIn, WearableDay, Baseline } from "./types.ts";

export const FEATURE_NAMES = [
  "acwr", // 7-day avg load / 28-day avg load
  "monotony", // 7-day mean load / sd (Foster)
  "sleep_avg_7d", // hours
  "sleep_debt_3d", // hours below 8 over last 3 nights
  "hrv_z", // (3-day HRV - baseline) / baseline sd proxy (negative = suppressed)
  "rhr_delta", // bpm above baseline
  "soreness_max", // 0-3 today
  "soreness_days_3d", // days with any area >= 2 in last 3
  "landing_errors", // LandingCheck confident errors (0-10)
  "under_fueled", // 1 if <=1 meal on a hard day
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Record<FeatureName, number>;

export const FEATURE_LABELS: Record<FeatureName, string> = {
  acwr: "Acute:chronic workload ratio",
  monotony: "Training monotony",
  sleep_avg_7d: "Average sleep (7 nights)",
  sleep_debt_3d: "Sleep debt (3 nights)",
  hrv_z: "HRV vs personal baseline",
  rhr_delta: "Resting HR above baseline",
  soreness_max: "Worst soreness today",
  soreness_days_3d: "Days sore (last 3)",
  landing_errors: "Landing errors (LandingCheck)",
  under_fueled: "Under-fueled on a hard day",
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

export function computeFeatures(args: {
  date: string;
  checkins: CheckIn[];
  wearable_recent?: WearableDay[];
  wearable_baseline_days?: WearableDay[];
  baseline?: Baseline;
  landing_errors?: number;
}): FeatureVector {
  const byDate = [...args.checkins].sort((a, b) => a.date.localeCompare(b.date)).filter((c) => c.date <= args.date);
  const last = (n: number) => byDate.slice(-n);
  const loads7 = last(7).map((c) => c.load_min ?? 0);
  const loads28 = last(28).map((c) => c.load_min ?? 0);
  const chronic = mean(loads28);
  const acwr = chronic > 0 ? mean(loads7) / chronic : 1;
  const monotony = sd(loads7) > 0 ? mean(loads7) / sd(loads7) : loads7.length ? 4 : 0;
  const sleeps = last(7).map((c) => c.sleep_h).filter((x): x is number => x != null);
  const sleep3 = last(3).map((c) => c.sleep_h).filter((x): x is number => x != null);
  const today = byDate.at(-1);

  let hrv_z = 0;
  let rhr_delta = 0;
  const recent = (args.wearable_recent ?? []).filter((d) => d.date <= args.date).slice(-3);
  const baseDays = args.wearable_baseline_days ?? [];
  const baseHrv = baseDays.map((d) => d.hrv_ms).filter((x): x is number => x != null);
  const recHrv = recent.map((d) => d.hrv_ms).filter((x): x is number => x != null);
  if (baseHrv.length >= 3 && recHrv.length) {
    const s = Math.max(sd(baseHrv), mean(baseHrv) * 0.06); // floor avoids exploding z on very stable baselines
    hrv_z = (mean(recHrv) - mean(baseHrv)) / s;
  }
  const recRhr = recent.map((d) => d.rhr_bpm).filter((x): x is number => x != null);
  if (args.baseline?.rhr_bpm != null && recRhr.length) rhr_delta = mean(recRhr) - args.baseline.rhr_bpm;

  const sorenessDays = last(3).filter((c) => c.soreness.some((s) => s.level >= 2)).length;
  const hard = today ? today.intensity === "hard" || (today.effort ?? 0) >= 8 || (today.load_min ?? 0) >= 90 : false;

  const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    acwr: r(acwr),
    monotony: r(Math.min(monotony, 6)),
    sleep_avg_7d: r(sleeps.length ? mean(sleeps) : 8),
    sleep_debt_3d: r(sleep3.reduce((s, h) => s + Math.max(0, 8 - h), 0)),
    hrv_z: r(Math.max(-5, Math.min(5, hrv_z))),
    rhr_delta: r(rhr_delta),
    soreness_max: Math.max(0, ...(today?.soreness.map((s) => s.level) ?? [0])),
    soreness_days_3d: sorenessDays,
    landing_errors: args.landing_errors ?? 0,
    under_fueled: today && today.meals != null && today.meals <= 1 && hard ? 1 : 0,
  };
}

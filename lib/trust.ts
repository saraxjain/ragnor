// Trust layer: every wearable reading gets a trust score before any model or agent sees it.
//   signal quality  - how long the watch was actually worn that night, motion artifact, missing data
//   agreement       - when two devices overlap (Google Health "reconciled stream"), do they agree?
//   validation      - has this metric on this device been validated for someone like this person?
// Readings under 50 are excluded from analysis and shown as "unverified" instead of silently used.
import type { WearableDay } from "../shared/lib/index.ts";
import type { Athlete } from "./store.ts";

export type Metric = "hrv_ms" | "rhr_bpm" | "sleep_h";
export type TrustLabel = "trusted" | "caution" | "unverified";
export interface Reading {
  date: string;
  metric: Metric;
  value: number;
  source: string;
  wear_h: number;
  motion_pct: number;
  second_source?: { device: string; value: number };
  quality: number;
  agreement: number;
  validation: "validated" | "limited" | "unknown";
  trust: number;
  label: TrustLabel;
  reasons: string[];
}
export interface TrustReport {
  athlete_id: string;
  readings: Reading[];
  summary: { total: number; trusted: number; caution: number; unverified: number; pct_usable: number };
  coverage: { metric: Metric; label: string; level: Reading["validation"]; note: string }[];
  trusted_vs_baseline: Record<Metric, { recent: number | null; baseline: number | null; pct: number | null; n_recent: number }>;
  raw_vs_baseline: Record<Metric, { recent: number | null; pct: number | null }>;
}

export const METRIC_LABEL: Record<Metric, string> = { hrv_ms: "Overnight HRV", rhr_bpm: "Resting heart rate", sleep_h: "Sleep" };
export const METRIC_UNIT: Record<Metric, string> = { hrv_ms: "ms", rhr_bpm: "bpm", sleep_h: "h" };

// Evidence coverage for consumer wrist devices (PPG). Adolescents and darker skin tones are under-represented in
// validation studies, so coverage is lower for minors and "unknown" where nothing has been published.
function validationFor(metric: Metric, device: string, minor: boolean): { level: Reading["validation"]; note: string } {
  const wrist = /watch|fitbit|charge|sense|versa|garmin|whoop/i.test(device);
  if (!wrist) return { level: "unknown", note: "No published validation for this device." };
  if (metric === "rhr_bpm") return { level: minor ? "limited" : "validated", note: minor ? "Resting HR is well validated in adults; fewer studies include teens." : "Resting HR from wrist PPG is well validated at rest." };
  if (metric === "sleep_h") return { level: "limited", note: "Total sleep time is reasonable; wrist devices tend to overestimate sleep and stages are less reliable." };
  return { level: minor ? "unknown" : "limited", note: minor ? "Overnight HRV from wrist PPG has little published validation in adolescents; trends vs the athlete's own baseline are more meaningful than absolute values." : "Overnight HRV trends are useful; absolute values vary by device." };
}
const V_WEIGHT = { validated: 1, limited: 0.88, unknown: 0.75 } as const;

// Deterministic pseudo-random per athlete/date so the demo is stable.
function rand(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Night-level capture metadata. Real deployments read this from the Google Health API (wear time, sources). */
function capture(a: Athlete, d: WearableDay, idx: number, recent: WearableDay[]) {
  const r = rand(`${a.id}:${d.date}`);
  let wear = Math.max(7.2 + r * 1.6, (d.sleep_h ?? 0) + 0.4 + r * 0.5);
  let motion = 3 + r * 6;
  // Scenario: on the athlete's lowest-HRV recent night the watch was loose / taken off early.
  const lowest = recent.filter((x) => x.hrv_ms != null).sort((x, y) => (x.hrv_ms ?? 0) - (y.hrv_ms ?? 0))[0];
  if ((a.id === "ath_01" || a.id === "ath_03") && lowest && d.date === lowest.date) { wear = 3.4; motion = 27; }
  // Scenario: Ava's last two nights look alarming, but the band was loose and the watch was off half the night.
  if (a.id === "ath_04" && recent.slice(-2).some((x) => x.date === d.date)) { wear = 3.1 + r * 0.6; motion = 31; }
  if (a.id === "ath_05" && idx % 3 === 0) { wear = 5.1; motion = 14; } // loose band, recurring
  const hasSecond = a.id === "ath_01" || r > 0.7;
  return { wear: Math.round(wear * 10) / 10, motion: Math.round(motion), hasSecond, r };
}

export function trustReport(a: Athlete): TrustReport {
  const minor = a.grade <= 12;
  const device = a.device || "Pixel Watch";
  const recent = a.wearable.recent;
  const recentDates = new Set(recent.map((d) => d.date));
  const all = [...a.wearable.baseline_days, ...recent];
  const readings: Reading[] = [];
  all.forEach((d, idx) => {
    const cap = capture(a, d, idx, recent);
    for (const metric of ["hrv_ms", "rhr_bpm", "sleep_h"] as Metric[]) {
      const value = d[metric];
      if (value == null) continue;
      const reasons: string[] = [];
      // signal quality
      let quality = 100;
      const needed = metric === "sleep_h" ? 0 : 5; // HRV/RHR need most of the night captured
      if (cap.wear < 6) { quality -= (6 - cap.wear) * (metric === "sleep_h" ? 12 : 18); reasons.push(`Watch worn ${cap.wear} h of the night`); }
      if (cap.motion > 12) { quality -= (cap.motion - 12) * 1.6; reasons.push(`${cap.motion}% of samples had motion artifact`); }
      if (metric === "sleep_h" && cap.wear < value - 0.5) { quality -= 25; reasons.push("Reported sleep is longer than the watch was worn"); }
      quality = Math.max(0, Math.min(100, quality - needed * 0));
      // cross-device agreement (reconciled stream)
      let agreement = 1;
      let second: Reading["second_source"];
      if (cap.hasSecond && metric !== "sleep_h") {
        const drift = metric === "hrv_ms" ? (cap.wear < 6 ? 0.35 : 0.06) : cap.wear < 6 ? 0.12 : 0.03;
        const v2 = Math.round(value * (1 + (cap.r > 0.5 ? drift : -drift)) * 10) / 10;
        second = { device: "Phone camera spot check", value: v2 };
        const diff = Math.abs(v2 - value) / value;
        agreement = diff > 0.2 ? 0.7 : diff > 0.1 ? 0.88 : 1;
        if (diff > 0.2) reasons.push(`Second source disagrees by ${Math.round(diff * 100)}%`);
      }
      const v = validationFor(metric, device, minor);
      if (v.level !== "validated") reasons.push(v.level === "unknown" ? "No published validation for this metric in teens" : "Limited validation for this metric");
      const trust = Math.round(quality * agreement * V_WEIGHT[v.level]);
      readings.push({
        date: d.date, metric, value, source: device, wear_h: cap.wear, motion_pct: cap.motion, second_source: second,
        quality: Math.round(quality), agreement, validation: v.level, trust,
        label: trust >= 75 ? "trusted" : trust >= 50 ? "caution" : "unverified",
        reasons: reasons.length ? reasons : ["Full night captured, low motion"],
      });
    }
  });
  const recentR = readings.filter((r) => recentDates.has(r.date));
  const usable = (r: Reading) => r.label !== "unverified";
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const tvb = {} as TrustReport["trusted_vs_baseline"];
  for (const m of ["hrv_ms", "rhr_bpm", "sleep_h"] as Metric[]) {
    const rec = recentR.filter((r) => r.metric === m && usable(r)).map((r) => r.value);
    const base = readings.filter((r) => r.metric === m && !recentDates.has(r.date) && usable(r)).map((r) => r.value);
    const rm = mean(rec), bm = mean(base);
    tvb[m] = { recent: rm == null ? null : Math.round(rm * 10) / 10, baseline: bm == null ? null : Math.round(bm * 10) / 10, pct: rm != null && bm ? Math.round(((rm - bm) / bm) * 100) : null, n_recent: rec.length };
  }
  const raw = {} as TrustReport["raw_vs_baseline"];
  for (const m of ["hrv_ms", "rhr_bpm", "sleep_h"] as Metric[]) {
    const rm = mean(recentR.filter((r) => r.metric === m).map((r) => r.value));
    const bm = tvb[m].baseline;
    raw[m] = { recent: rm == null ? null : Math.round(rm * 10) / 10, pct: rm != null && bm ? Math.round(((rm - bm) / bm) * 100) : null };
  }
  return {
    athlete_id: a.id,
    raw_vs_baseline: raw,
    readings,
    summary: {
      total: recentR.length,
      trusted: recentR.filter((r) => r.label === "trusted").length,
      caution: recentR.filter((r) => r.label === "caution").length,
      unverified: recentR.filter((r) => r.label === "unverified").length,
      pct_usable: recentR.length ? Math.round((recentR.filter(usable).length / recentR.length) * 100) : 0,
    },
    coverage: (["hrv_ms", "rhr_bpm", "sleep_h"] as Metric[]).map((m) => ({ metric: m, label: METRIC_LABEL[m], ...validationFor(m, device, minor) })),
    trusted_vs_baseline: tvb,
  };
}

/** A copy of the athlete whose wearable readings below the trust bar are removed (set to null). */
export function trustedOnly(a: Athlete, report = trustReport(a)): Athlete {
  const bad = new Set(report.readings.filter((r) => r.label === "unverified").map((r) => `${r.date}:${r.metric}`));
  const clean = (d: WearableDay): WearableDay => ({
    date: d.date,
    hrv_ms: bad.has(`${d.date}:hrv_ms`) ? null : d.hrv_ms,
    rhr_bpm: bad.has(`${d.date}:rhr_bpm`) ? null : d.rhr_bpm,
    sleep_h: bad.has(`${d.date}:sleep_h`) ? null : d.sleep_h,
  });
  return { ...a, wearable: { ...a.wearable, recent: a.wearable.recent.map(clean), baseline_days: a.wearable.baseline_days.map(clean) } };
}

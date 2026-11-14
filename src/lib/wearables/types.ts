import { addDays } from "../time";

export interface WearableDay {
  localDate: string;
  restingHr: number | null; // beats per minute
  hrvMs: number | null; // heart-rate variability, milliseconds
  sleepHours: number | null;
}

/** Wearable data behind an interface: a mock for the demo and a real Google Health API provider. */
export interface WearableProvider {
  readonly name: "mock" | "google-health";
  /** Daily values for the athlete between two local dates, inclusive. Missing days are simply absent. */
  getDays(athleteId: string, fromDate: string, toDate: string): Promise<WearableDay[]>;
}

export interface WearableBaseline {
  restingHr: number | null;
  hrvMs: number | null;
  sleepHours: number | null;
  /** The largest number of baseline days any metric used. */
  daysUsed: number;
  windowDays: number;
}

export interface WearableDeltas {
  hrvDeltaPercent: number | null;
  restingHrDeltaBpm: number | null;
  sleepDeltaHours: number | null;
}

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Personal baseline = MEDIAN of each metric over the `windowDays` days before `today` (today excluded), needing at least
 * `minDays` days with that metric; otherwise that metric's baseline is null (never guessed).
 * The window and minimum are unvalidated placeholders (THRESHOLDS.WEARABLE_*).
 */
export function computeBaseline(days: WearableDay[], today: string, windowDays: number, minDays: number): WearableBaseline {
  const from = addDays(today, -windowDays);
  const window = days.filter((d) => d.localDate >= from && d.localDate < today);
  const pick = (f: (d: WearableDay) => number | null) => {
    const xs = window.map(f).filter((x): x is number => x !== null);
    return { value: xs.length >= minDays ? median(xs) : null, n: xs.length };
  };
  const hr = pick((d) => d.restingHr);
  const hrv = pick((d) => d.hrvMs);
  const sl = pick((d) => d.sleepHours);
  return { restingHr: hr.value, hrvMs: hrv.value, sleepHours: sl.value, daysUsed: Math.max(hr.n, hrv.n, sl.n), windowDays };
}

export function computeDeltas(today: WearableDay | undefined, b: WearableBaseline): WearableDeltas {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    hrvDeltaPercent: today?.hrvMs != null && b.hrvMs ? round1(((today.hrvMs - b.hrvMs) / b.hrvMs) * 100) : null,
    restingHrDeltaBpm: today?.restingHr != null && b.restingHr != null ? round1(today.restingHr - b.restingHr) : null,
    sleepDeltaHours: today?.sleepHours != null && b.sleepHours != null ? round1(today.sleepHours - b.sleepHours) : null,
  };
}

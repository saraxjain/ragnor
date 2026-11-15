// Sample watch data for demos and tests: 21 baseline nights + the last 7 nights, shaped like what the
// Google Health API gives us (overnight HRV, resting heart rate, sleep). Deterministic: the same athlete
// and scenario always produce the same numbers, so demos and tests are repeatable.
import type { WearableDay } from "../shared/lib/index.ts";

export const SAMPLE_SCENARIOS = {
  steady: { label: "Well recovered", blurb: "A normal week. Everything sits at this athlete's usual level.", expectFlag: false },
  short_sleep: { label: "Short on sleep", blurb: "Under 6 hours a night for the last four nights.", expectFlag: true },
  hrv_drop: { label: "Run down", blurb: "HRV about 22% below normal for three nights.", expectFlag: true },
  rhr_up: { label: "Resting heart rate up", blurb: "Resting heart rate about 7 bpm above normal, as when fighting something off.", expectFlag: true },
  overreached: { label: "Everything off", blurb: "HRV down, resting heart rate up and short sleep together.", expectFlag: true },
  bouncing_back: { label: "Bouncing back", blurb: "A rough start to the week, back to normal for the last three nights.", expectFlag: false },
  patchy: { label: "Patchy wear", blurb: "Normal numbers, but the watch was left off on some nights.", expectFlag: false },
} as const;
export type SampleScenario = keyof typeof SAMPLE_SCENARIOS;
export const isSampleScenario = (s: unknown): s is SampleScenario => typeof s === "string" && Object.hasOwn(SAMPLE_SCENARIOS, s);

const BASELINE_NIGHTS = 21;
const RECENT_NIGHTS = 7;

/** Small seeded random generator (mulberry32) so output is repeatable. */
function rng(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
function dayBefore(end: string, n: number): string {
  const d = new Date(`${end}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** What changes on each of the last 7 nights (index 0 = 6 nights ago, 6 = last night): HRV multiplier, RHR added, sleep hours added. */
function shift(scenario: SampleScenario, i: number): { hrv: number; rhr: number; sleep: number } {
  const last = (n: number) => i >= RECENT_NIGHTS - n;
  switch (scenario) {
    case "short_sleep": return last(4) ? { hrv: 0.93, rhr: 2, sleep: -2.4 } : { hrv: 1, rhr: 0, sleep: 0 };
    case "hrv_drop": return last(3) ? { hrv: 0.78, rhr: 2, sleep: -0.4 } : { hrv: 0.97, rhr: 0, sleep: 0 };
    case "rhr_up": return last(3) ? { hrv: 0.91, rhr: 7, sleep: 0 } : { hrv: 1, rhr: 1, sleep: 0 };
    case "overreached": return last(4) ? { hrv: 0.75, rhr: 7, sleep: -2.5 } : { hrv: 0.95, rhr: 2, sleep: -0.5 };
    case "bouncing_back": return last(3) ? { hrv: 1, rhr: 0, sleep: 0 } : { hrv: 0.8, rhr: 6, sleep: -1.8 };
    default: return { hrv: 1, rhr: 0, sleep: 0 };
  }
}

export interface SampleWearable {
  scenario: SampleScenario;
  baseline_days: WearableDay[];
  recent: WearableDay[];
}

/**
 * @param seed  anything stable per athlete (their id), so each athlete gets their own "normal"
 * @param end   the last night's date, YYYY-MM-DD
 */
export function sampleWearable(scenario: SampleScenario, seed: string, end: string): SampleWearable {
  const rand = rng(`${seed}:${scenario}`);
  const person = rng(seed); // the athlete's own normal does not change with the scenario
  const normal = { hrv: 46 + person() * 30, rhr: 52 + person() * 12, sleep: 7.6 + person() * 0.9 };
  // Night-to-night wobble kept small (HRV +-3%, RHR +-1 bpm, sleep +-15 min) so a scenario lands on the side of the thresholds it is meant to.
  const night = (date: string, s: { hrv: number; rhr: number; sleep: number }): WearableDay => ({
    date,
    hrv_ms: r1(normal.hrv * s.hrv * (1 + (rand() - 0.5) * 0.06)),
    rhr_bpm: r1(normal.rhr + s.rhr + (rand() - 0.5) * 2),
    sleep_h: r1(Math.max(3, normal.sleep + s.sleep + (rand() - 0.5) * 0.5)),
  });
  const baseline_days = Array.from({ length: BASELINE_NIGHTS }, (_, k) => night(dayBefore(end, RECENT_NIGHTS + BASELINE_NIGHTS - 1 - k), { hrv: 1, rhr: 0, sleep: 0 }));
  const recent = Array.from({ length: RECENT_NIGHTS }, (_, i) => {
    const d = night(dayBefore(end, RECENT_NIGHTS - 1 - i), shift(scenario, i));
    // Watch left off two nights ago and five nights ago.
    return scenario === "patchy" && (i === 1 || i === 4) ? { date: d.date, hrv_ms: null, rhr_bpm: null, sleep_h: null } : d;
  });
  return { scenario, baseline_days, recent };
}

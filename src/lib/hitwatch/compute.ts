// HitWatch maths: deterministic, pure. The deterministic code (not the model) computes the `hitwatch` shape.
// Thresholds are unvalidated placeholders (see THRESHOLDS).
import { THRESHOLDS as T } from "../rules/thresholds";
import { isRedFlagSymptom } from "../rules/symptoms";
import { addDays } from "../time";

export interface HitwatchShape {
  day: number;
  symptoms: Record<string, number>;
  baseline_total: number;
  today_total: number;
  escalate: boolean;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The athlete's own pre-impact baseline: median daily symptom count (each ticked symptom counts 1) over the days before the impact. */
export function baselineSymptomTotal(checkins: { localDate: string; symptoms: string[] }[], impactLocalDate: string): { total: number; daysUsed: number } {
  const from = addDays(impactLocalDate, -T.LOOKBACK_DAYS);
  const days = checkins.filter((c) => c.localDate >= from && c.localDate < impactLocalDate);
  return { total: Math.round(median(days.map((d) => d.symptoms.length))), daysUsed: days.length };
}

/** Severities are 0 to 3 per symptom. Anything outside is clamped; unknown severities for a listed symptom count as 1. */
export function normalizeSeverities(symptoms: string[], severities?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (severities) {
    for (const [id, v] of Object.entries(severities)) {
      const n = Math.max(0, Math.min(3, Math.round(Number(v))));
      if (n > 0) out[id] = n;
    }
  } else {
    for (const id of symptoms) out[id] = 1;
  }
  return out;
}

export function computeHitwatch(input: { day: number; severities: Record<string, number>; baselineTotal: number }): HitwatchShape {
  const symptoms = Object.fromEntries(Object.entries(input.severities).filter(([, v]) => v > 0));
  const today = Object.values(symptoms).reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...Object.values(symptoms));
  const redFlag = Object.keys(symptoms).some(isRedFlagSymptom);
  const escalate = redFlag || today - input.baselineTotal >= T.HITWATCH_ESCALATE_DELTA || max >= T.HITWATCH_SINGLE_SYMPTOM_SEVERE;
  return { day: input.day, symptoms, baseline_total: input.baselineTotal, today_total: today, escalate };
}

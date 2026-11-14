// Pure helpers for the check-in result view (app/athlete/checkin/CheckinResult.tsx). Deterministic: every sentence is built from the
// extracted check-in, the athlete's own history, the shared rules' output and fixed copy. No model text is invented here.
import { SHORT_SLEEP_H, compareToBaseline, type Baseline, type CheckIn, type WearableDay } from "../shared/lib/index.ts";

const r1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const MIN_HISTORY_DAYS = 3;

export interface Comparison {
  key: string;
  title: string;
  /** null when there is not enough history: only the sentence is shown, no bar */
  bar: { value: number; reference: number; unit: string; labels?: [string, string] } | null;
  sentence: string;
}

const notEnough = (key: string, title: string, what: string): Comparison => ({ key, title, bar: null, sentence: `Not enough history yet to compare ${what}. Keep checking in and this will fill in.` });

/** Sleep last night against the athlete's own recent average (the previous days, today excluded). */
export function compareSleep(today: CheckIn, history: CheckIn[]): Comparison {
  const prev = history.filter((c) => c.date < today.date && c.sleep_h != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map((c) => c.sleep_h as number);
  if (today.sleep_h == null) return { key: "sleep", title: "Sleep", bar: null, sentence: "You didn't mention sleep, so there is nothing to compare yet." };
  if (prev.length < MIN_HISTORY_DAYS) return notEnough("sleep", "Sleep", "your sleep");
  const a = r1(avg(prev));
  const d = r1(today.sleep_h - a);
  const sentence = d === 0 ? `${today.sleep_h} h, the same as your recent average of ${a} h.` : `${today.sleep_h} h, ${Math.abs(d)} h ${d < 0 ? "under" : "over"} your recent average of ${a} h.`;
  return { key: "sleep", title: "Sleep", bar: { value: today.sleep_h, reference: a, unit: "h" }, sentence: today.sleep_h < SHORT_SLEEP_H ? `${sentence} Under ${SHORT_SLEEP_H} h counts as a short night.` : sentence };
}

/** Practice minutes this week against last week: the same 7-day windows the shared rules use. */
export function compareLoad(today: CheckIn, history: CheckIn[]): Comparison {
  const all = [...history.filter((c) => c.date !== today.date), today];
  const mins = (from: number, to: number) => all.filter((c) => { const d = daysBetween(c.date, today.date); return d >= from && d < to; }).reduce((s, c) => s + (c.load_min ?? 0), 0);
  const last = mins(7, 14);
  const lastDays = all.filter((c) => { const d = daysBetween(c.date, today.date); return d >= 7 && d < 14 && c.load_min != null; }).length;
  if (lastDays < MIN_HISTORY_DAYS || last <= 0) return notEnough("load", "Practice this week", "this week's practice with last week's");
  const thisWk = mins(0, 7);
  const pct = Math.round(((thisWk - last) / last) * 100);
  const sentence = pct === 0 ? `${thisWk} min this week, the same as last week (${last} min).` : `${thisWk} min this week, ${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than last week (${last} min).`;
  return { key: "load", title: "Practice this week", bar: { value: thisWk, reference: last, unit: "min", labels: ["This week", "Last week"] }, sentence };
}

export interface Streak {
  area: string;
  days: number;
  level: number;
}

/** Areas rated 2 or more on consecutive days ending today (2+ days). */
export function sorenessStreaks(today: CheckIn, history: CheckIn[]): Streak[] {
  const byDate = new Map<string, CheckIn>([...history.filter((c) => c.date !== today.date), today].map((c) => [c.date, c]));
  const out: Streak[] = [];
  for (const s of today.soreness) {
    if (s.level < 2) continue;
    let days = 1;
    for (let i = 1; i < 14; i++) {
      const d = new Date(`${today.date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const c = byDate.get(d.toISOString().slice(0, 10));
      if ((c?.soreness.find((x) => x.area === s.area)?.level ?? 0) >= 2) days++;
      else break;
    }
    if (days >= 2) out.push({ area: s.area, days, level: s.level });
  }
  return out.sort((a, b) => b.days - a.days);
}

export function streakSentence(s: Streak, areaName: string): string {
  return `${areaName} has been sore (2 or more of 3) for ${plural(s.days, "day")} in a row.`;
}

export function compareWearable(recent: WearableDay[], baseline: Baseline): Comparison[] {
  if (!recent.length || baseline.days_used < MIN_HISTORY_DAYS) return [];
  const c = compareToBaseline(recent, baseline);
  if (!c.data_available) return [];
  const rows: Comparison[] = [];
  if (c.hrv_pct_vs_baseline != null && baseline.hrv_ms) {
    const p = c.hrv_pct_vs_baseline;
    rows.push({ key: "hrv", title: "Heart-rate variability", bar: { value: r1(baseline.hrv_ms * (1 + p / 100)), reference: baseline.hrv_ms, unit: "ms", labels: ["Last 3 nights", "Normal"] }, sentence: p === 0 ? "Your HRV over the last 3 nights matches your own normal." : `Your HRV over the last 3 nights is ${Math.abs(p)}% ${p < 0 ? "below" : "above"} your own normal of ${baseline.hrv_ms} ms.` });
  }
  if (c.rhr_delta_bpm != null && baseline.rhr_bpm != null) {
    const d = c.rhr_delta_bpm;
    rows.push({ key: "rhr", title: "Resting heart rate", bar: { value: r1(baseline.rhr_bpm + d), reference: baseline.rhr_bpm, unit: "bpm", labels: ["Last 3 nights", "Normal"] }, sentence: d === 0 ? "Your resting heart rate matches your own normal." : `Your resting heart rate is ${Math.abs(d)} bpm ${d > 0 ? "above" : "below"} your own normal of ${baseline.rhr_bpm} bpm.` });
  }
  return rows;
}

// ---------------------------------------------------------------- editing
export interface Editable {
  sleep_h: number | null;
  load_min: number | null;
  intensity: CheckIn["intensity"];
  soreness: Record<string, number>;
  symptoms: string[];
  red_flags: string[];
  took_hit: boolean;
}

export function toEditable(c: CheckIn): Editable {
  return { sleep_h: c.sleep_h, load_min: c.load_min, intensity: c.intensity, soreness: Object.fromEntries(c.soreness.filter((s) => s.level > 0).map((s) => [s.area, s.level])), symptoms: [...c.symptoms], red_flags: [...c.red_flags], took_hit: c.took_hit };
}

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** Names of the fields that differ (empty means nothing changed, so no Update button). */
export function changedFields(a: Editable, b: Editable): string[] {
  const out: string[] = [];
  if (a.sleep_h !== b.sleep_h) out.push("sleep");
  if (a.load_min !== b.load_min) out.push("practice minutes");
  if (a.intensity !== b.intensity) out.push("intensity");
  const ka = Object.keys(a.soreness), kb = Object.keys(b.soreness);
  if (!same(ka, kb) || ka.some((k) => a.soreness[k] !== b.soreness[k])) out.push("soreness");
  if (!same(a.symptoms, b.symptoms)) out.push("symptoms");
  if (!same(a.red_flags, b.red_flags)) out.push("emergency signs");
  if (a.took_hit !== b.took_hit) out.push("hit");
  return out;
}

/** Emergency signs can be added but never removed from this screen. */
export function mergeRedFlags(original: string[], edited: string[]): string[] {
  return [...new Set([...original, ...edited])];
}

/**
 * The payload for the existing structured (tap) path of /api/checkin, so an update makes no Gemini call. Values the athlete never gave stay
 * null (never guessed). Meals, effort and activities are carried over from the saved check-in.
 */
export function buildStructured(e: Editable, original: CheckIn) {
  return {
    sleep_h: e.sleep_h,
    soreness: e.soreness,
    load_min: e.load_min,
    intensity: e.intensity,
    effort: original.effort ?? null,
    activities: original.activities ?? [],
    meals: original.meals ?? null,
    took_hit: e.took_hit,
    symptoms: e.symptoms,
    red_flags: mergeRedFlags(original.red_flags, e.red_flags),
  };
}

// ---------------------------------------------------------------- errors and timeouts
export const FRIENDLY_ERROR = "The AI model didn't answer. Your check-in was not saved. Try again, or use Tap.";

/** A short sentence for the main message; the raw text goes in a collapsed "details". Never a JSON blob as the main message. */
export function friendlyCheckinError(raw: string): { message: string; detail: string | null } {
  const text = (raw ?? "").trim();
  const looksTechnical = /[{}]|"error"|"code"|UNAVAILABLE|NOT_FOUND|RESOURCE_EXHAUSTED|API key|timed out|Timed out|ECONN|fetch failed|status \d{3}|\b[45]\d\d\b/.test(text);
  if (!text) return { message: FRIENDLY_ERROR, detail: null };
  if (looksTechnical) return { message: FRIENDLY_ERROR, detail: text };
  return { message: text, detail: null };
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${Math.round(ms / 1000)} s waiting for the AI model`);
    this.name = "TimeoutError";
  }
}

/** Wrap a call so a hung model produces an error instead of spinning forever. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** What to say aloud: fixed or already-sanitised strings only (the caller passes the sanitised summary and flag reasons). */
export function speechText(parts: { summary: string; band: string; firstAction: string | null; redFlag: string | null }): string {
  const band = parts.band === "high" ? "High risk today" : parts.band === "moderate" ? "Moderate risk today" : "Lower risk right now";
  return [parts.redFlag, parts.summary ? `Here is what I heard. ${parts.summary}` : null, `${band}.`, parts.firstAction ? `First thing to do: ${parts.firstAction}` : "No rule fired today."].filter(Boolean).join(" ");
}

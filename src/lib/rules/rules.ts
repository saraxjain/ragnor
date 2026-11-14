// RULES: UNVALIDATED PLACEHOLDERS.
// Every threshold below comes from the founders' design doc and is pending clinician review.
// None of them is derived from or backed by a study; no citations are given on purpose.
// Rules are pure functions of a RuleContext: no I/O, no clock, no randomness, no ML, no LLM.
// Wording rule: copy produced here must never say or imply an athlete is cleared, fine, safe or healthy.

import { FOLLOWUP_DAYS, addDays, dayDiff, localDateOf } from "../time";
import { BODY_AREAS, BODY_AREA_LABELS, type BodyArea } from "../types";
import { THRESHOLDS as T } from "./thresholds";
import { RED_FLAG_SYMPTOMS, isRedFlagSymptom, symptomLabel } from "./symptoms";
import { baselineSymptomTotal, computeHitwatch, normalizeSeverities } from "../hitwatch/compute";
import type { CheckinInput, Rule, RuleContext, RuleOutput } from "./types";

// ---------- helpers (pure) ----------

const checkinOn = (ctx: RuleContext, date: string): CheckinInput | undefined => {
  // If a caller passes duplicates for a day, the last one wins (same policy as the data layer).
  let found: CheckinInput | undefined;
  for (const c of ctx.checkins) if (c.localDate === date) found = c;
  return found;
};

const lastNDates = (today: string, n: number, offset = 0): string[] =>
  Array.from({ length: n }, (_, i) => addDays(today, -(offset + i)));

const dayLoad = (c: CheckinInput | undefined): number | null => {
  if (!c || c.workloadMinutes === null) return null;
  if (c.workloadMinutes === 0) return 0;
  if (c.workloadIntensity === null) return null;
  return c.workloadMinutes * c.workloadIntensity;
};

interface LoadStats {
  thisSum: number;
  thisDays: number;
  priorSum: number;
  priorDays: number;
  /** Percent change of average daily load vs the prior week; null when it cannot be computed. */
  percent: number | null;
  /** Strictly more than the threshold above the prior week; null when it cannot be computed. */
  increased: boolean | null;
}

export function loadStats(ctx: RuleContext): LoadStats {
  const sum = (dates: string[]) => {
    let total = 0;
    let days = 0;
    for (const d of dates) {
      const l = dayLoad(checkinOn(ctx, d));
      if (l !== null) {
        total += l;
        days += 1;
      }
    }
    return { total, days };
  };
  const cur = sum(lastNDates(ctx.today, T.WINDOW_DAYS));
  const prev = sum(lastNDates(ctx.today, T.WINDOW_DAYS, T.WINDOW_DAYS));
  const enough =
    cur.days >= T.MIN_LOAD_DAYS_PER_WEEK && prev.days >= T.MIN_LOAD_DAYS_PER_WEEK && prev.total > 0;
  let percent: number | null = null;
  let increased: boolean | null = null;
  if (enough) {
    // Compare average daily load so a missing day is never counted as a zero-load day.
    // Integer arithmetic keeps "exactly 25%" exact: cur/curDays > prev/prevDays * 1.25.
    increased = cur.total * prev.days * 100 > prev.total * cur.days * (100 + T.LOAD_INCREASE_PERCENT);
    percent = Math.round(((cur.total * prev.days) / (prev.total * cur.days) - 1) * 100);
  }
  return { thisSum: cur.total, thisDays: cur.days, priorSum: prev.total, priorDays: prev.days, percent, increased };
}

interface SleepStats {
  reported: number;
  short: number;
}

export function sleepStats(ctx: RuleContext): SleepStats {
  let reported = 0;
  let short = 0;
  for (const d of lastNDates(ctx.today, T.WINDOW_DAYS)) {
    const s = checkinOn(ctx, d)?.sleepHours;
    if (s === null || s === undefined) continue;
    reported += 1;
    if (s < T.SHORT_SLEEP_HOURS) short += 1;
  }
  return { reported, short };
}

/** What is missing for the data-dependent rules (sleep-load, soreness-persisting). Empty when nothing is. */
export function missingInputs(ctx: RuleContext): string[] {
  const missing: string[] = [];
  const sleep = sleepStats(ctx);
  if (sleep.reported < T.MIN_SLEEP_NIGHTS_REPORTED) {
    missing.push(`sleep hours for ${T.WINDOW_DAYS - sleep.reported} of the last ${T.WINDOW_DAYS} nights`);
  }
  const load = loadStats(ctx);
  if (load.thisDays < T.MIN_LOAD_DAYS_PER_WEEK) {
    missing.push(`training load for ${T.WINDOW_DAYS - load.thisDays} of the last ${T.WINDOW_DAYS} days`);
  }
  if (load.priorDays < T.MIN_LOAD_DAYS_PER_WEEK) {
    missing.push(`training load for ${T.WINDOW_DAYS - load.priorDays} of the ${T.WINDOW_DAYS} days before that`);
  } else if (load.priorSum === 0) {
    missing.push("a non-zero training load in the prior week to compare against");
  }
  const noCheckin = lastNDates(ctx.today, T.SORENESS_PERSISTING_DAYS).filter((d) => !checkinOn(ctx, d));
  if (noCheckin.length > 0) {
    missing.push(`check-ins for ${noCheckin.reverse().join(", ")} (needed to track soreness)`);
  }
  return missing;
}

const areaName = (a: BodyArea): string => BODY_AREA_LABELS[a].toLowerCase();
const soreAt = (c: CheckinInput | undefined, a: BodyArea): number => c?.soreness[a] ?? 0;

// ---------- rules ----------

const sleepLoad: Rule = {
  id: "sleep-load",
  description: `Sleep under ${T.SHORT_SLEEP_HOURS} h on ${T.SHORT_SLEEP_NIGHTS} or more of the last ${T.WINDOW_DAYS} nights AND this week's load (minutes x intensity) more than ${T.LOAD_INCREASE_PERCENT}% above the prior week => moderate, general.`,
  evaluate(ctx) {
    const sleep = sleepStats(ctx);
    const load = loadStats(ctx);
    if (sleep.reported < T.MIN_SLEEP_NIGHTS_REPORTED || load.increased === null) return [];
    if (sleep.short >= T.SHORT_SLEEP_NIGHTS && load.increased) {
      return [
        {
          level: "moderate",
          bodyArea: null,
          reason: `Sleep was under ${T.SHORT_SLEEP_HOURS} hours on ${sleep.short} of the last ${T.WINDOW_DAYS} nights while training load rose ${load.percent}%.`,
          action: "Plan a lighter training session today and aim for more sleep tonight.",
          confidence: "normal",
          trainerAlert: false,
        },
      ];
    }
    return [];
  },
};

const sorenessPersisting: Rule = {
  id: "soreness-persisting",
  description: `Soreness >= ${T.SORENESS_PERSISTING_LEVEL} in the same body area on ${T.SORENESS_PERSISTING_DAYS} consecutive days => moderate; with the load increase above, or soreness ${T.SORENESS_SEVERE_LEVEL} on ${T.SORENESS_SEVERE_DAYS} consecutive days => high.`,
  evaluate(ctx) {
    const out: RuleOutput[] = [];
    const load = loadStats(ctx);
    const persistDates = lastNDates(ctx.today, T.SORENESS_PERSISTING_DAYS); // today first
    const severeDates = lastNDates(ctx.today, T.SORENESS_SEVERE_DAYS);
    for (const area of BODY_AREAS) {
      const persistDays = persistDates.map((d) => checkinOn(ctx, d));
      const severeDays = severeDates.map((d) => checkinOn(ctx, d));
      const persisting =
        persistDays.every((c) => c !== undefined) &&
        persistDays.every((c) => soreAt(c, area) >= T.SORENESS_PERSISTING_LEVEL);
      const severe =
        severeDays.every((c) => c !== undefined) &&
        severeDays.every((c) => soreAt(c, area) >= T.SORENESS_SEVERE_LEVEL);
      if (!persisting && !severe) continue;

      const side = checkinOn(ctx, ctx.today)?.sorenessSides?.[area];
      const name = side ? `${side} ${areaName(area)}` : areaName(area);
      if (severe) {
        out.push({
          level: "high",
          bodyArea: area,
          reason: `${cap(name)} soreness was ${T.SORENESS_SEVERE_LEVEL} (the top of the 0 to 3 scale) on ${T.SORENESS_SEVERE_DAYS} days in a row.`,
          action: `Hold off on hard training that loads your ${name} and tell your athletic trainer today.`,
          confidence: "normal",
          trainerAlert: false,
        });
      } else if (load.increased === true) {
        const levels = [...persistDays].reverse().map((c) => soreAt(c, area)).join(", ");
        out.push({
          level: "high",
          bodyArea: area,
          reason: `${cap(name)} soreness was ${T.SORENESS_PERSISTING_LEVEL} or higher on ${T.SORENESS_PERSISTING_DAYS} days in a row (${levels}) while training load rose ${load.percent}%.`,
          action: `Hold off on hard training that loads your ${name} and tell your athletic trainer today.`,
          confidence: "normal",
          trainerAlert: false,
        });
      } else {
        const levels = [...persistDays].reverse().map((c) => soreAt(c, area)).join(", ");
        out.push({
          level: "moderate",
          bodyArea: area,
          reason: `${cap(name)} soreness was ${T.SORENESS_PERSISTING_LEVEL} or higher on ${T.SORENESS_PERSISTING_DAYS} days in a row (${levels}).`,
          action: `Ease off training that loads your ${name} today and check in again tomorrow.`,
          confidence: "normal",
          trainerAlert: false,
        });
      }
    }
    return out;
  },
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const listWords = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Symptoms recorded on each follow-up day (1..7) up to today, from symptom logs and check-ins. */
function followUpSymptoms(ctx: RuleContext, impactAt: string, logs: { day: number; symptoms: string[] }[]) {
  const start = localDateOf(impactAt, ctx.timezone);
  const dayToday = dayDiff(start, ctx.today) + 1;
  const lastDay = Math.min(7, dayToday);
  const byDay = new Map<number, Set<string>>();
  for (let d = 1; d <= lastDay; d++) {
    const set = new Set<string>();
    for (const l of logs) if (l.day === d) l.symptoms.forEach((s) => set.add(s));
    const c = checkinOn(ctx, addDays(start, d - 1));
    c?.symptoms.forEach((s) => set.add(s));
    if (set.size > 0) byDay.set(d, set);
  }
  return { dayToday, byDay };
}

const postImpactSymptom: Rule = {
  id: "post-impact-symptom",
  description: `Any symptom logged in the ${FOLLOWUP_DAYS}-day window after an impact => high + trainer alert; first appearing on day 2 or later is labelled a delayed symptom.`,
  evaluate(ctx) {
    const out: RuleOutput[] = [];
    for (const imp of ctx.impacts) {
      const { dayToday, byDay } = followUpSymptoms(ctx, imp.occurredAt, imp.symptomLogs);
      if (dayToday < 1 || byDay.size === 0) continue;
      const days = [...byDay.keys()].sort((a, b) => a - b);
      const firstDay = days[0];
      const all = new Set<string>();
      byDay.forEach((s) => s.forEach((x) => all.add(x)));
      const labels = [...all].map((s) => symptomLabel(s).toLowerCase());
      const delayed = firstDay >= 2;
      out.push({
        level: "high",
        bodyArea: "head_neck",
        reason: `${delayed ? "Delayed symptom: " : ""}${listWords(labels)} first reported on day ${firstDay} of the 7-day follow-up after a head impact.`,
        action: "Pause training today and tell your athletic trainer.",
        confidence: "normal",
        trainerAlert: true,
      });
    }
    return out;
  },
};

const redFlag: Rule = {
  id: "red-flag",
  description: `Any red-flag symptom, at any time in the last ${T.LOOKBACK_DAYS} days => urgent, see a clinician now, trainer alert.`,
  evaluate(ctx) {
    // Latest report date per red-flag symptom, from check-ins and follow-up logs.
    const latest = new Map<string, string>();
    const note = (id: string, date: string) => {
      if (!isRedFlagSymptom(id)) return;
      const prev = latest.get(id);
      if (!prev || date > prev) latest.set(id, date);
    };
    for (const c of ctx.checkins) c.symptoms.forEach((s) => note(s, c.localDate));
    for (const imp of ctx.impacts) {
      const start = localDateOf(imp.occurredAt, ctx.timezone);
      for (const l of imp.symptomLogs) l.symptoms.forEach((s) => note(s, addDays(start, l.day - 1)));
    }
    const out: RuleOutput[] = [];
    for (const def of RED_FLAG_SYMPTOMS) {
      const date = latest.get(def.id);
      if (!date) continue;
      out.push({
        level: "urgent",
        bodyArea: def.source === "cdc-heads-up" ? "head_neck" : null,
        reason: `Red-flag symptom reported on ${date}: ${def.label.charAt(0).toLowerCase()}${def.label.slice(1)}.`,
        action: "Urgent: see a clinician now.",
        confidence: "normal",
        trainerAlert: true,
      });
    }
    return out;
  },
};

const missedFollowup: Rule = {
  id: "missed-followup",
  description: `A missed day in an active ${FOLLOWUP_DAYS}-day follow-up => prompt to the athlete and a note on the trainer view (the risk level is unchanged).`,
  evaluate(ctx) {
    const out: RuleOutput[] = [];
    for (const imp of ctx.impacts) {
      const dayToday = dayDiff(localDateOf(imp.occurredAt, ctx.timezone), ctx.today) + 1;
      if (dayToday < 2 || dayToday > 7) continue; // not active, or nothing can be missed yet
      const logged = new Set(imp.symptomLogs.map((l) => l.day));
      const missed: number[] = [];
      for (let d = 1; d < dayToday; d++) if (!logged.has(d)) missed.push(d);
      if (missed.length === 0) continue;
      out.push({
        level: "low",
        bodyArea: "head_neck",
        reason: `No symptom log for ${missed.length === 1 ? "day" : "days"} ${listWords(missed.map(String))} of the 7-day follow-up after a head impact.`,
        action: "Log today's symptoms now.",
        confidence: "normal",
        trainerAlert: false,
      });
    }
    return out;
  },
};

const insufficientData: Rule = {
  id: "insufficient-data",
  description: `Too little data for the data-dependent rules (needs sleep on ${T.MIN_SLEEP_NIGHTS_REPORTED} of ${T.WINDOW_DAYS} nights and load on ${T.MIN_LOAD_DAYS_PER_WEEK} of ${T.WINDOW_DAYS} days in each week) => no moderate/high from them; emit a low-confidence note naming what is missing.`,
  evaluate(ctx) {
    const missing = missingInputs(ctx);
    if (missing.length === 0) return [];
    return [
      {
        level: "low",
        bodyArea: null,
        reason: `Not enough data yet for trend rules: missing ${missing.join("; ")}.`,
        action: "Complete today's check-in so trends can be calculated.",
        confidence: "low",
        trainerAlert: false,
      },
    ];
  },
};

const AREA_FOR_LANDING_ITEM: Record<string, BodyArea> = { knee_valgus: "knee" };

const landingBand: Rule = {
  id: "landing-band",
  description: "A landing check (video pipeline) in the moderate or high band becomes a flag at that level. UNVALIDATED placeholder mapping.",
  evaluate(ctx) {
    const l = ctx.landing;
    if (!l || l.band === "low") return [];
    const present = l.items.filter((i) => i.present);
    const what = present.length
      ? present.map((i) => `${i.id.replace(/_/g, " ")}${i.side ? ` (${i.side})` : ""}${i.timestampS !== null ? ` at ${i.timestampS} s` : ""}`).join(", ")
      : "no specific landing error was listed";
    const area = present.map((i) => AREA_FOR_LANDING_ITEM[i.id]).find(Boolean) ?? "other";
    return [
      {
        level: l.band === "high" ? "high" : "moderate",
        bodyArea: area,
        reason: `The landing check scored ${l.score} (${l.band} band, ${l.daysAgo === 0 ? "today" : `${l.daysAgo} days ago`}): ${what}.`,
        action: "Ask your trainer to watch your landing before the next jump session.",
        confidence: "normal",
        trainerAlert: false,
      },
    ];
  },
};

const hrvSleep: Rule = {
  id: "hrv-sleep",
  description: `Heart-rate variability ${T.HRV_DROP_PERCENT}% or more below the athlete's own ${T.WEARABLE_BASELINE_DAYS}-day median baseline AND sleep under ${T.SHORT_SLEEP_HOURS} hours => moderate, general. UNVALIDATED placeholder.`,
  evaluate(ctx) {
    const w = ctx.wearables;
    if (!w || w.baselineDaysUsed < T.WEARABLE_MIN_BASELINE_DAYS || w.hrvDeltaPercent === null) return [];
    const sleep = w.sleepHours ?? checkinOn(ctx, ctx.today)?.sleepHours ?? null;
    if (sleep === null) return [];
    if (w.hrvDeltaPercent <= -T.HRV_DROP_PERCENT && sleep < T.SHORT_SLEEP_HOURS) {
      return [
        {
          level: "moderate",
          bodyArea: null,
          reason: `Heart-rate variability was ${Math.abs(Math.round(w.hrvDeltaPercent))}% below the athlete's own baseline while sleep was ${sleep} hours.`,
          action: "Plan a lighter training session today and aim for more sleep tonight.",
          confidence: "normal",
          trainerAlert: false,
        },
      ];
    }
    return [];
  },
};

const hitwatchEscalation: Rule = {
  id: "hitwatch-escalation",
  description: `On a HitWatch follow-up day, today's symptom total is ${T.HITWATCH_ESCALATE_DELTA} or more points above the personal baseline, or one symptom is rated ${T.HITWATCH_SINGLE_SYMPTOM_SEVERE} => high + reviewer alert.`,
  evaluate(ctx) {
    const out: RuleOutput[] = [];
    for (const imp of ctx.impacts) {
      const start = localDateOf(imp.occurredAt, ctx.timezone);
      const dayToday = dayDiff(start, ctx.today) + 1;
      if (dayToday < 1 || dayToday > FOLLOWUP_DAYS) continue;
      const log = imp.symptomLogs.filter((l) => l.severities && l.day <= dayToday).sort((a, b) => b.day - a.day)[0];
      if (!log) continue;
      const base = baselineSymptomTotal(ctx.checkins, start);
      const h = computeHitwatch({ day: log.day, severities: normalizeSeverities(log.symptoms, log.severities), baselineTotal: base.total });
      if (!h.escalate) continue;
      out.push({
        level: "high",
        bodyArea: "head_neck",
        reason: `On follow-up day ${h.day} the symptom total was ${h.today_total} against the athlete's own baseline of ${h.baseline_total}.`,
        action: "Pause training today and tell your athletic trainer.",
        confidence: base.daysUsed >= 3 ? "normal" : "low",
        trainerAlert: true,
      });
    }
    return out;
  },
};

const unconfirmedRedFlag: Rule = {
  id: "unconfirmed-red-flag",
  description: "A follow-up conversation mentioned a red-flag phrase the athlete did not confirm => high, so a human asks the athlete directly.",
  evaluate(ctx) {
    const out: RuleOutput[] = [];
    const seen = new Set<string>();
    for (const imp of ctx.impacts) {
      for (const id of imp.callFlags ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          level: "high",
          bodyArea: "head_neck",
          reason: `A follow-up conversation mentioned "${symptomLabel(id).toLowerCase()}" but the athlete did not confirm it, so someone needs to ask directly.`,
          action: "Contact the athlete today and ask about this symptom.",
          confidence: "low",
          trainerAlert: true,
        });
      }
    }
    return out;
  },
};

export const RULES: Rule[] = [
  redFlag,
  postImpactSymptom,
  hitwatchEscalation,
  unconfirmedRedFlag,
  missedFollowup,
  sleepLoad,
  sorenessPersisting,
  hrvSleep,
  landingBand,
  insufficientData,
];

// De-identified case brief. Pure: builds the ONLY data that is ever sent to a model.
// Sent: age group (adult / under 18), sleep hours and load per day, soreness by area, symptom labels, impact follow-up
// day numbers, and which rules fired with their thresholds. Dates become "days ago".
// NEVER sent: names, initials, ids, date of birth, free-text notes or impact descriptions, school, team, time zone,
// calendar dates.
import { THRESHOLDS } from "../rules/thresholds";
import { RULES_VERSION, runRules, type FlagDraft, type RuleContext } from "../rules";
import { symptomLabel } from "../rules/symptoms";
import { buildContext, type ContextExtras } from "../services";
import { FOLLOWUP_DAYS, addDays, dayDiff, isMinorOn, localDateOf } from "../time";
import { BODY_AREA_LABELS, type Checkin, type ImpactEvent, type Profile, type SymptomLog } from "../types";
import { loadStats, sleepStats } from "../rules/rules";

export interface CaseBrief {
  athlete: "adult athlete" | "athlete under 18";
  rulesVersion: string;
  /** Per day, most recent first. daysAgo 0 is today. */
  days: { daysAgo: number; checkedIn: boolean; sleepHours: number | null; loadMinutesTimesIntensity: number | null; soreness: Record<string, number>; symptoms: string[] }[];
  weekly: {
    nightsReportedOfLast7: number;
    nightsUnderSleepThreshold: number;
    avgDailyLoadThisWeek: number | null;
    avgDailyLoadPriorWeek: number | null;
    loadChangePercent: number | null;
  };
  impacts: { daysSinceImpact: number; followUpDay: number | null; followUpActive: boolean; symptomsByFollowUpDay: { day: number; symptoms: string[] }[] }[];
  rulesFired: { ruleId: string; level: string; bodyArea: string | null; confidence: string; trainerAlert: boolean; summary: string }[];
  /** Wearable deltas against the athlete's own baseline (numbers only), when a provider supplied them. */
  wearables?: { hrvDeltaPercent: number | null; restingHrDeltaBpm: number | null; sleepDeltaHours: number | null; baselineDaysUsed: number } | null;
  thresholds: typeof THRESHOLDS;
  thresholdsStatus: "unvalidated placeholders pending clinician review";
}

/** Replace calendar dates in rule text with relative days so no real date leaves the server. */
export function relativizeDates(text: string, today: string): string {
  return text.replace(/(\bon )?\b(\d{4}-\d{2}-\d{2})\b/g, (_m, _on, d: string) => {
    const n = dayDiff(d, today);
    return n === 0 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`;
  });
}

export interface BriefInput {
  profile: Profile;
  checkins: Checkin[];
  impacts: ImpactEvent[];
  logs: SymptomLog[];
  now: Date;
  extras?: ContextExtras;
}

export function buildCaseBrief(input: BriefInput): { brief: CaseBrief; ctx: RuleContext; flags: FlagDraft[] } {
  const { profile, now } = input;
  const ctx = buildContext(profile, now, input.checkins, input.impacts, input.logs, input.extras);
  const flags = runRules(ctx, RULES_VERSION);
  const today = ctx.today;
  const adult = !isMinorOn(profile.dateOfBirth, localDateOf(now, profile.timezone));

  const days = Array.from({ length: THRESHOLDS.LOOKBACK_DAYS }, (_, daysAgo) => {
    const date = addDays(today, -daysAgo);
    const c = ctx.checkins.find((x) => x.localDate === date);
    const load =
      !c || c.workloadMinutes === null ? null : c.workloadMinutes === 0 ? 0 : c.workloadIntensity === null ? null : c.workloadMinutes * c.workloadIntensity;
    const soreness: Record<string, number> = {};
    for (const [area, lvl] of Object.entries(c?.soreness ?? {})) soreness[BODY_AREA_LABELS[area as keyof typeof BODY_AREA_LABELS]] = lvl as number;
    return {
      daysAgo,
      checkedIn: !!c,
      sleepHours: c?.sleepHours ?? null,
      loadMinutesTimesIntensity: load,
      soreness,
      symptoms: (c?.symptoms ?? []).map(symptomLabel),
    };
  });

  const load = loadStats(ctx);
  const sleep = sleepStats(ctx);
  const mean = (sum: number, n: number) => (n > 0 ? Math.round((sum / n) * 10) / 10 : null);

  const impacts = ctx.impacts.map((imp) => {
    const start = localDateOf(imp.occurredAt, ctx.timezone);
    const day = dayDiff(start, today) + 1;
    return {
      daysSinceImpact: day - 1,
      followUpDay: day >= 1 && day <= FOLLOWUP_DAYS ? day : null,
      followUpActive: day >= 1 && day <= FOLLOWUP_DAYS,
      symptomsByFollowUpDay: imp.symptomLogs
        .filter((l) => l.symptoms.length > 0)
        .map((l) => ({ day: l.day, symptoms: l.symptoms.map(symptomLabel) }))
        .sort((a, b) => a.day - b.day),
    };
  });

  const brief: CaseBrief = {
    athlete: adult ? "adult athlete" : "athlete under 18",
    rulesVersion: RULES_VERSION,
    days,
    weekly: {
      nightsReportedOfLast7: sleep.reported,
      nightsUnderSleepThreshold: sleep.short,
      avgDailyLoadThisWeek: mean(load.thisSum, load.thisDays),
      avgDailyLoadPriorWeek: mean(load.priorSum, load.priorDays),
      loadChangePercent: load.percent,
    },
    impacts,
    wearables: ctx.wearables
      ? { hrvDeltaPercent: ctx.wearables.hrvDeltaPercent, restingHrDeltaBpm: ctx.wearables.restingHrDeltaBpm, sleepDeltaHours: ctx.wearables.sleepDeltaHours, baselineDaysUsed: ctx.wearables.baselineDaysUsed }
      : null,
    rulesFired: flags.map((f) => ({
      ruleId: f.ruleId,
      level: f.level,
      bodyArea: f.bodyArea ? BODY_AREA_LABELS[f.bodyArea] : null,
      confidence: f.confidence,
      trainerAlert: f.trainerAlert,
      summary: relativizeDates(f.reason, today),
    })),
    thresholds: THRESHOLDS,
    thresholdsStatus: "unvalidated placeholders pending clinician review",
  };
  return { brief, ctx, flags };
}

// Application services: glue between the data layer (DataAccess) and the pure rules engine.
import { RULES_VERSION, runRules, type RuleContext } from "./rules";
import { FOLLOWUP_DAYS, addDays, dayDiff, followUpDayNumber, localDateOf } from "./time";
import { levelRank, type Actor, type Availability, type CoachAlertRow, type Checkin, type ConsentStatus, type Evaluation, type Flag, type ImpactEvent, type Level, type Outcome, type Profile, type SymptomLog } from "./types";
import { THRESHOLDS } from "./rules/thresholds";
import type { DataAccess } from "./data/types";
import type { CheckinForm } from "./validation";
import { computeBaseline, computeDeltas, type WearableProvider } from "./wearables/types";
import { getWearableProvider } from "./wearables";
import type { LandingInput, WearableInput } from "./rules/types";

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly errors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

async function requireProfile(da: DataAccess, actor: Actor, id: string): Promise<Profile> {
  const p = await da.getProfile(actor, id);
  if (!p) throw new ValidationError("Unknown athlete");
  return p;
}

/** Build the rules input from stored rows. The returned object is what gets snapshotted onto every flag. */
export interface ContextExtras {
  wearables?: WearableInput | null;
  landing?: LandingInput | null;
  /** Unconfirmed red-flag ids per impact id (from follow-up conversations). */
  callFlags?: Record<string, string[]>;
}

export function buildContext(
  profile: Pick<Profile, "timezone">,
  now: Date,
  checkins: Checkin[],
  impacts: ImpactEvent[],
  logs: SymptomLog[],
  extras: ContextExtras = {},
): RuleContext {
  const today = localDateOf(now, profile.timezone);
  const from = addDays(today, -(THRESHOLDS.LOOKBACK_DAYS - 1));
  return {
    today,
    timezone: profile.timezone,
    checkins: checkins
      .filter((c) => c.localDate >= from && c.localDate <= today)
      .map((c) => ({
        localDate: c.localDate,
        sleepHours: c.sleepHours,
        workloadMinutes: c.workloadMinutes,
        workloadIntensity: c.workloadIntensity,
        soreness: c.soreness,
        symptoms: c.symptoms,
        sorenessSides: c.sorenessSides,
      })),
    impacts: impacts
      .filter((i) => localDateOf(i.occurredAt, profile.timezone) >= from)
      .map((i) => ({
        id: i.id,
        occurredAt: i.occurredAt,
        symptomLogs: logs.filter((l) => l.impactEventId === i.id).map((l) => ({ day: l.day, symptoms: l.symptoms, severity: l.severity, severities: l.severities })),
        callFlags: extras.callFlags?.[i.id],
      })),
    wearables: extras.wearables ?? null,
    landing: extras.landing ?? null,
  };
}

/** Wearable numbers vs the athlete's own baseline (median of the previous N days), for the rules and the timeline. */
export async function wearableInput(provider: WearableProvider, athleteId: string, today: string): Promise<WearableInput | null> {
  const from = addDays(today, -THRESHOLDS.WEARABLE_BASELINE_DAYS);
  let days;
  try {
    days = await provider.getDays(athleteId, from, today);
  } catch {
    return null; // a failed provider means "no wearable data", never a guess
  }
  const todayRow = days.find((d) => d.localDate === today);
  if (days.length === 0) return null;
  const baseline = computeBaseline(days, today, THRESHOLDS.WEARABLE_BASELINE_DAYS, THRESHOLDS.WEARABLE_MIN_BASELINE_DAYS);
  return { ...computeDeltas(todayRow, baseline), sleepHours: todayRow?.sleepHours ?? null, baselineDaysUsed: baseline.daysUsed };
}

/** Everything beyond check-ins and impacts that the rules look at. */
export async function gatherExtras(da: DataAccess, actor: Actor, athleteId: string, timezone: string, now: Date, wearables?: WearableProvider | null): Promise<ContextExtras> {
  const today = localDateOf(now, timezone);
  const provider = wearables === undefined ? getWearableProvider() : wearables;
  const [landing, calls] = await Promise.all([da.getLatestLanding(actor, athleteId), da.listCalls(actor, athleteId)]);
  const callFlags: Record<string, string[]> = {};
  for (const c of calls) if (c.keywordFlags.length) callFlags[c.impactEventId] = [...new Set([...(callFlags[c.impactEventId] ?? []), ...c.keywordFlags])];
  const daysAgo = landing ? dayDiff(landing.localDate, today) : null;
  return {
    wearables: provider ? await wearableInput(provider, athleteId, today) : null,
    landing: landing && daysAgo !== null && daysAgo >= 0 && daysAgo < THRESHOLDS.LOOKBACK_DAYS ? { daysAgo, band: landing.band, score: landing.score, items: landing.items.map((i) => ({ id: i.id, present: i.present, side: i.side, timestampS: i.timestampS })) } : null,
    callFlags,
  };
}

/** Run the rules for an athlete and persist the evaluation (which writes the audit entries). */
export async function evaluateAthlete(da: DataAccess, actor: Actor, athleteId: string, now: Date, opts: { wearables?: WearableProvider | null } = {}): Promise<Evaluation> {
  const profile = await requireProfile(da, actor, athleteId);
  const today = localDateOf(now, profile.timezone);
  const from = addDays(today, -(THRESHOLDS.LOOKBACK_DAYS - 1));
  const [checkins, impacts, logs, extras] = await Promise.all([
    da.listCheckins(actor, athleteId, from, today),
    da.listImpacts(actor, athleteId),
    da.listSymptomLogs(actor, athleteId),
    gatherExtras(da, actor, athleteId, profile.timezone, now, opts.wearables),
  ]);
  const ctx = buildContext(profile, now, checkins, impacts, logs, extras);
  const drafts = runRules(ctx, RULES_VERSION);
  const evaluation = await da.saveEvaluation(actor, athleteId, today, RULES_VERSION, drafts);
  // Rules create pending alerts; a human reviewer must approve before anything reaches a coach or parent.
  await da.queueAlerts(actor, athleteId, evaluation);
  return evaluation;
}

export async function submitCheckin(da: DataAccess, actor: Actor, form: CheckinForm, now: Date) {
  const profile = await requireProfile(da, actor, actor.id);
  const localDate = localDateOf(now, profile.timezone);
  const { replacedPrevious } = await da.upsertCheckin(actor, {
    athleteId: actor.id,
    localDate,
    ...form,
    submittedAt: now.toISOString(),
  });
  const evaluation = await evaluateAthlete(da, actor, actor.id, now);
  return { evaluation, replacedPrevious };
}

export async function reportImpact(da: DataAccess, actor: Actor, athleteId: string, context: string | null, now: Date) {
  const impact = await da.createImpact(actor, { athleteId, occurredAt: now.toISOString(), context });
  const evaluation = await evaluateAthlete(da, actor, athleteId, now);
  return { impact, evaluation };
}

export async function logFollowUp(
  da: DataAccess,
  actor: Actor,
  impactId: string,
  form: { symptoms: string[]; severity: number | null },
  now: Date,
) {
  const profile = await requireProfile(da, actor, actor.id);
  const impact = (await da.listImpacts(actor, actor.id)).find((i) => i.id === impactId);
  if (!impact) throw new ValidationError("Unknown impact report");
  const today = localDateOf(now, profile.timezone);
  const day = followUpDayNumber(impact.occurredAt, today, profile.timezone);
  if (day < 1 || day > FOLLOWUP_DAYS) throw new ValidationError("This follow-up window is not active");
  await da.upsertSymptomLog(actor, {
    impactEventId: impactId,
    athleteId: actor.id,
    day,
    symptoms: form.symptoms,
    severity: form.severity,
    loggedAt: now.toISOString(),
  });
  return evaluateAthlete(da, actor, actor.id, now);
}

export interface FollowUpStatus {
  impact: ImpactEvent;
  /** 1-based follow-up day today. */
  day: number;
  active: boolean;
  loggedDays: number[];
  missedDays: number[];
  todayLogged: boolean;
}

/** Computed live from stored rows (never persisted), so a missed day shows up the moment it happens. */
export async function getFollowUps(da: DataAccess, actor: Actor, athleteId: string, now: Date): Promise<FollowUpStatus[]> {
  const profile = await requireProfile(da, actor, athleteId);
  const today = localDateOf(now, profile.timezone);
  const [impacts, logs] = await Promise.all([da.listImpacts(actor, athleteId), da.listSymptomLogs(actor, athleteId)]);
  return impacts
    .map((impact) => {
      const day = dayDiff(localDateOf(impact.occurredAt, profile.timezone), today) + 1;
      const loggedDays = logs.filter((l) => l.impactEventId === impact.id).map((l) => l.day).sort((a, b) => a - b);
      const missedDays: number[] = [];
      for (let d = 1; d < Math.min(day, FOLLOWUP_DAYS + 1); d++) if (!loggedDays.includes(d)) missedDays.push(d);
      return { impact, day, active: day >= 1 && day <= FOLLOWUP_DAYS, loggedDays, missedDays, todayLogged: loggedDays.includes(day) };
    })
    .filter((f) => f.active);
}

export const topLevel = (flags: Pick<Flag, "level">[]): Level =>
  flags.reduce<Level>((top, f) => (levelRank(f.level) > levelRank(top) ? f.level : top), "low");

export interface RosterRow {
  athlete: Profile;
  evaluation: Evaluation | null;
  level: Level;
  trainerAlert: boolean;
  lowConfidence: boolean;
  followUps: FollowUpStatus[];
  availability: Availability;
  checkedAt: string | null;
  consent: ConsentStatus;
}

export async function getRoster(da: DataAccess, actor: Actor, now: Date): Promise<RosterRow[]> {
  const athletes = await da.listTeamAthletes(actor);
  const rows = await Promise.all(
    athletes.map(async (athlete): Promise<RosterRow> => {
      const today = localDateOf(now, athlete.timezone);
      const [evaluation, followUps, outcomes, availability, consent] = await Promise.all([
        da.getLatestEvaluation(actor, athlete.id),
        getFollowUps(da, actor, athlete.id, now),
        da.listOutcomes(actor, athlete.id),
        da.listAvailability(actor, athlete.id, today),
        da.getConsentStatus(actor, athlete.id, today),
      ]);
      const flags = evaluation?.flags ?? [];
      const flagIds = new Set(flags.map((f) => f.id));
      const checked = outcomes.filter((o: Outcome) => o.kind === "trainer_checked" && flagIds.has(o.flagId));
      return {
        athlete,
        evaluation,
        level: topLevel(flags),
        trainerAlert: flags.some((f) => f.trainerAlert),
        lowConfidence: flags.some((f) => f.confidence === "low"),
        followUps,
        availability,
        checkedAt: checked.length ? checked[checked.length - 1].createdAt : null,
        consent,
      };
    }),
  );
  return rows.sort(
    (a, b) =>
      levelRank(b.level) - levelRank(a.level) ||
      Number(b.trainerAlert) - Number(a.trainerAlert) ||
      a.athlete.displayLabel.localeCompare(b.athlete.displayLabel),
  );
}

export async function markChecked(da: DataAccess, actor: Actor, athleteId: string) {
  const evaluation = await da.getLatestEvaluation(actor, athleteId);
  for (const f of evaluation?.flags ?? []) {
    await da.recordOutcome(actor, {
      flagId: f.id,
      athleteId,
      kind: "trainer_checked",
      adviceFollowed: null,
      laterSymptomOrInjury: null,
      missedTraining: null,
    });
  }
}

export type CoachRow = CoachAlertRow;

/** Coach screen model ("who to look at today"). Built only from listCoachAlerts: approved alerts, reason + source. */
export async function getCoachView(da: DataAccess, actor: Actor, now: Date, timezone: string): Promise<CoachRow[]> {
  return da.listCoachAlerts(actor, localDateOf(now, timezone));
}

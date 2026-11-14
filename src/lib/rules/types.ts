import type { BodyArea, Confidence, Level, Soreness } from "../types";

/** Input slice of one daily check-in, as the rules see it. */
export interface CheckinInput {
  localDate: string;
  sleepHours: number | null;
  workloadMinutes: number | null;
  workloadIntensity: number | null;
  soreness: Soreness;
  symptoms: string[];
  sorenessSides?: Partial<Record<BodyArea, "left" | "right" | "both">>;
}

export interface ImpactInput {
  id: string;
  /** UTC ISO instant. */
  occurredAt: string;
  symptomLogs: { day: number; symptoms: string[]; severity: number | null; severities?: Record<string, number> }[];
  /** Red-flag symptom ids a conversation's keyword scan found that the athlete did not confirm. */
  callFlags?: string[];
}

/** Wearable numbers against the athlete's own baseline (see src/lib/wearables). Optional: absent means no wearable data. */
export interface WearableInput {
  hrvDeltaPercent: number | null;
  restingHrDeltaBpm: number | null;
  sleepDeltaHours: number | null;
  sleepHours: number | null;
  baselineDaysUsed: number;
}

/** Latest landing check (video pipeline), placeholder inputs. */
export interface LandingInput {
  daysAgo: number;
  band: "low" | "moderate" | "high";
  score: number;
  items: { id: string; present: boolean; side: "left" | "right" | null; timestampS: number | null }[];
}

/** Everything a rule may look at. Rules are pure functions of this object. */
export interface RuleContext {
  /** The athlete's local "today" (YYYY-MM-DD). */
  today: string;
  /** The athlete's IANA time zone, used to compute follow-up days. */
  timezone: string;
  checkins: CheckinInput[];
  impacts: ImpactInput[];
  wearables?: WearableInput | null;
  landing?: LandingInput | null;
}

export interface RuleOutput {
  level: Level;
  bodyArea: BodyArea | null;
  /** One plain-language sentence naming the actual numbers. */
  reason: string;
  /** One reversible action. */
  action: string;
  confidence: Confidence;
  trainerAlert: boolean;
}

export interface Rule {
  id: string;
  description: string;
  evaluate(ctx: RuleContext): RuleOutput[];
}

export interface FlagDraft extends RuleOutput {
  ruleId: string;
  rulesVersion: string;
  /** Deep copy of the context that produced this flag, so it can be replayed. */
  inputs: RuleContext;
}

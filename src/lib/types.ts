// Shared domain types. Dates named `localDate` are YYYY-MM-DD in the athlete's own time zone;
// every instant (`occurredAt`, `createdAt`, ...) is an ISO-8601 UTC string.

export const ROLES = ["athlete", "trainer", "coach", "parent"] as const;
export type Role = (typeof ROLES)[number];

export const BODY_AREAS = [
  "head_neck",
  "shoulder",
  "back",
  "lower_back",
  "hip",
  "hamstring",
  "quad",
  "knee",
  "calf_shin",
  "ankle_foot",
  "wrist_hand",
  "other",
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const BODY_AREA_LABELS: Record<BodyArea, string> = {
  head_neck: "Head / neck",
  shoulder: "Shoulder",
  back: "Back",
  lower_back: "Lower back",
  hip: "Hip",
  hamstring: "Hamstring",
  quad: "Quad",
  knee: "Knee",
  calf_shin: "Calf / shin",
  ankle_foot: "Ankle / foot",
  wrist_hand: "Wrist / hand",
  other: "Other",
};

export const LEVELS = ["low", "moderate", "high", "urgent"] as const;
export type Level = (typeof LEVELS)[number];
export const levelRank = (l: Level): number => LEVELS.indexOf(l);

export type Confidence = "normal" | "low";
export type Side = "left" | "right" | "both";
export type SorenessLevel = 0 | 1 | 2 | 3;
export type Soreness = Partial<Record<BodyArea, SorenessLevel>>;

export type Availability = "available" | "limited" | "out" | "not_set";
export const AVAILABILITY_VALUES = ["available", "limited", "out"] as const;

export interface Actor {
  id: string;
  role: Role;
}

export interface Profile {
  id: string;
  role: Role;
  /** Initials only, e.g. "J.M." */
  displayLabel: string;
  dateOfBirth: string | null;
  timezone: string;
  schoolId: string | null;
}

export interface Checkin {
  id: string;
  athleteId: string;
  localDate: string;
  sleepHours: number | null;
  workloadMinutes: number | null;
  workloadIntensity: number | null;
  soreness: Soreness;
  symptoms: string[];
  note: string | null;
  /** Optional side for sided body areas (e.g. hamstring_l from the shared shape). Internal rules key on the area only. */
  sorenessSides?: Partial<Record<BodyArea, Side>>;
  submittedAt: string;
}

export interface ImpactEvent {
  id: string;
  athleteId: string;
  occurredAt: string;
  context: string | null;
  reportedBy: string;
  /** Id from an external source (e.g. the mouthguard webhook) used for idempotency. */
  externalId?: string | null;
  source?: "athlete" | "trainer" | "mouthguard_webhook" | "demo";
}

export interface SymptomLog {
  id: string;
  impactEventId: string;
  athleteId: string;
  day: number;
  symptoms: string[];
  severity: number | null;
  /** Per-symptom severity 0-3 (HitWatch). Absent for older logs, where each listed symptom counts as 1. */
  severities?: Record<string, number>;
  loggedAt: string;
}

export interface Flag {
  id: string;
  athleteId: string;
  localDate: string;
  bodyArea: BodyArea | null;
  level: Level;
  confidence: Confidence;
  reason: string;
  action: string;
  ruleId: string;
  rulesVersion: string;
  /** Snapshot of the inputs that produced this flag (a RuleContext). */
  inputs: unknown;
  trainerAlert: boolean;
  evaluationId: string;
  createdAt: string;
}

export type OutcomeKind = "did_this" | "tell_trainer" | "trainer_checked";

export interface Outcome {
  id: string;
  flagId: string;
  athleteId: string;
  kind: OutcomeKind;
  adviceFollowed: boolean | null;
  laterSymptomOrInjury: boolean | null;
  missedTraining: boolean | null;
  notedBy: string;
  createdAt: string;
}

export interface ConsentStatus {
  /** True when the athlete is under 18 and so needs a guardian consent record. */
  required: boolean;
  active: boolean;
  grantedAt: string | null;
  withdrawnAt: string | null;
  guardianId: string | null;
}

export interface AuditEntry {
  id: number;
  occurredAt: string;
  eventType:
    | "flag_created"
    | "escalation"
    | "checkin_replaced"
    | "alert_created"
    | "alert_approved"
    | "alert_dismissed"
    | "impact_webhook"
    | "hitwatch_call";
  athleteId: string;
  actorId: string | null;
  flagId: string | null;
  payload: unknown;
}

export type AlertStatus = "pending" | "approved" | "dismissed";

export interface AlertSource {
  ruleId: string;
  rulesVersion: string;
  /** Set only when Google Search grounding is live and returned a citation. */
  grounding: { title: string; url: string } | null;
}

/**
 * An alert is created by the rules engine and waits for a human reviewer (the trainer role in the demo).
 * Only approved alerts are ever visible to a coach or a parent.
 */
export interface Alert {
  id: string;
  athleteId: string;
  flagId: string;
  evaluationId: string;
  localDate: string;
  ruleId: string;
  rulesVersion: string;
  level: Level;
  bodyArea: BodyArea | null;
  reason: string;
  action: string;
  confidence: Confidence;
  /** Snapshot of the inputs that produced the flag (reviewer only). */
  inputs: unknown;
  /** Higher first. Red-flag alerts are always on top. */
  priority: number;
  status: AlertStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  source: AlertSource;
}

/** The only shape a coach can ever read: an approved alert (reason + source) and the reviewer-set availability. */
export interface CoachAlertRow {
  alertId: string;
  athleteId: string;
  athleteLabel: string;
  level: Level;
  reason: string;
  source: AlertSource;
  approvedAt: string;
  availability: Availability;
}

/** What a parent may read about their linked minor: approved alerts only. */
export interface ParentAlertRow {
  alertId: string;
  level: Level;
  reason: string;
  action: string;
  source: AlertSource;
  approvedAt: string;
}

export interface Evaluation {
  id: string;
  athleteId: string;
  localDate: string;
  rulesVersion: string;
  createdAt: string;
  flags: Flag[];
}

/** A landing-check result as ingested from the video pipeline (shape drafted in docs/PLAN.md). */
export interface LandingResult {
  id: string;
  athleteId: string;
  receivedAt: string;
  localDate: string;
  items: { id: string; present: boolean; side: "left" | "right" | null; timestampS: number | null; confidence: number | null }[];
  score: number;
  band: "low" | "moderate" | "high";
}

export type CallChannel = "phone" | "browser" | "scripted" | "tool";
export type CallStatus = "scheduled" | "answered" | "missed";

/** One HitWatch follow-up call (or browser/scripted conversation) for one day of a 7-day follow-up. */
export interface HitwatchCall {
  id: string;
  impactEventId: string;
  athleteId: string;
  day: number;
  channel: CallChannel;
  status: CallStatus;
  at: string;
  /** Code-filtered short summary, or null. Never raw audio; never a full transcript. */
  summary: string | null;
  /** Red-flag symptom ids that the keyword scan found in the transcript and the athlete did not confirm. */
  keywordFlags: string[];
}

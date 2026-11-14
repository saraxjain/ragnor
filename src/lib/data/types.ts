import type {
  Actor,
  Availability,
  Alert,
  AlertStatus,
  CallChannel,
  CallStatus,
  HitwatchCall,
  LandingResult,
  AuditEntry,
  BodyArea,
  Checkin,
  CoachAlertRow,
  ParentAlertRow,
  Confidence,
  ConsentStatus,
  Evaluation,
  ImpactEvent,
  Level,
  Outcome,
  OutcomeKind,
  Profile,
  Soreness,
  SymptomLog,
} from "../types";

export class ForbiddenError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConsentRequiredError extends Error {
  constructor(message = "A parent or guardian consent record is required before an athlete under 18 can submit health data.") {
    super(message);
    this.name = "ConsentRequiredError";
  }
}

export interface CheckinWrite {
  athleteId: string;
  localDate: string;
  sleepHours: number | null;
  workloadMinutes: number | null;
  workloadIntensity: number | null;
  soreness: Soreness;
  sorenessSides?: Checkin["sorenessSides"];
  symptoms: string[];
  note: string | null;
  /** UTC ISO instant of submission. */
  submittedAt: string;
}

export interface ImpactWrite {
  athleteId: string;
  occurredAt: string;
  context: string | null;
  externalId?: string | null;
  source?: ImpactEvent["source"];
}

export interface SymptomLogWrite {
  impactEventId: string;
  athleteId: string;
  day: number;
  symptoms: string[];
  severity: number | null;
  severities?: Record<string, number>;
  loggedAt: string;
}

export interface CallWrite {
  impactEventId: string;
  athleteId: string;
  day: number;
  channel: CallChannel;
  status: CallStatus;
  at: string;
  summary?: string | null;
  keywordFlags?: string[];
}

export interface LandingWrite {
  athleteId: string;
  localDate: string;
  receivedAt: string;
  items: LandingResult["items"];
  score: number;
  band: LandingResult["band"];
}

export interface FlagWrite {
  bodyArea: BodyArea | null;
  level: Level;
  confidence: Confidence;
  reason: string;
  action: string;
  ruleId: string;
  rulesVersion: string;
  inputs: unknown;
  trainerAlert: boolean;
}

export interface OutcomeWrite {
  flagId: string;
  athleteId: string;
  kind: OutcomeKind;
  adviceFollowed: boolean | null;
  laterSymptomOrInjury: boolean | null;
  missedTraining: boolean | null;
}

/**
 * The one interface the app talks to. Every method takes the acting user, because who is asking decides
 * what may be read or written. `GuardedDataAccess` enforces the role, team, coach and consent rules for any
 * implementation; Firestore is only reachable through the server (firestore.rules deny client access).
 */
export interface DataAccess {
  readonly mode: "demo" | "firestore";

  // identity and relationships
  listDemoProfiles(): Promise<Profile[]>;
  getProfile(actor: Actor, profileId: string): Promise<Profile | null>;
  /** Athletes on the actor's teams (trainers). */
  listTeamAthletes(actor: Actor): Promise<Profile[]>;
  /** Minors linked to the actor as parent/guardian. */
  listLinkedMinors(actor: Actor): Promise<Profile[]>;

  // consent
  getConsentStatus(actor: Actor, athleteId: string, onDate: string): Promise<ConsentStatus>;
  grantConsent(actor: Actor, athleteId: string, at: string): Promise<void>;
  withdrawConsent(actor: Actor, athleteId: string, at: string): Promise<void>;

  // health data (athlete / trainer only; never coach)
  upsertCheckin(actor: Actor, input: CheckinWrite): Promise<{ checkin: Checkin; replacedPrevious: boolean }>;
  listCheckins(actor: Actor, athleteId: string, fromDate: string, toDate: string): Promise<Checkin[]>;
  createImpact(actor: Actor, input: ImpactWrite): Promise<ImpactEvent>;
  listImpacts(actor: Actor, athleteId: string): Promise<ImpactEvent[]>;
  upsertSymptomLog(actor: Actor, input: SymptomLogWrite): Promise<SymptomLog>;
  listSymptomLogs(actor: Actor, athleteId: string): Promise<SymptomLog[]>;

  // flags, outcomes, audit
  /** Records one evaluation (even with zero flags) plus its flags; audit entries are written for every flag and escalation. */
  saveEvaluation(actor: Actor, athleteId: string, localDate: string, rulesVersion: string, flags: FlagWrite[]): Promise<Evaluation>;
  /** The most recent evaluation for this athlete, or null if none yet. */
  getLatestEvaluation(actor: Actor, athleteId: string): Promise<Evaluation | null>;
  recordOutcome(actor: Actor, input: OutcomeWrite): Promise<Outcome>;
  listOutcomes(actor: Actor, athleteId: string): Promise<Outcome[]>;
  listAuditLog(actor: Actor, athleteId: string): Promise<AuditEntry[]>;

  // availability (trainer sets; coach reads through the restricted view only)
  setAvailability(actor: Actor, athleteId: string, localDate: string, status: Exclude<Availability, "not_set">): Promise<void>;
  listAvailability(actor: Actor, athleteId: string, localDate: string): Promise<Availability>;

  // landing checks (ingested from the video pipeline) and HitWatch calls
  saveLandingResult(actor: Actor, input: LandingWrite): Promise<LandingResult>;
  getLatestLanding(actor: Actor, athleteId: string): Promise<LandingResult | null>;
  findImpactByExternalId(actor: Actor, athleteId: string, externalId: string): Promise<ImpactEvent | null>;
  /** Upserts by (impact, day, channel-agnostic): the latest status for a day wins, e.g. scheduled -> answered. */
  recordCall(actor: Actor, input: CallWrite): Promise<HitwatchCall>;
  listCalls(actor: Actor, athleteId: string): Promise<HitwatchCall[]>;

  /** Server-internal lookup by impact id for secret-authenticated tool calls (HitWatch). Never expose results to coaches or the browser unfiltered. */
  systemFindImpact(impactId: string): Promise<ImpactEvent | null>;

  // approval queue: rules create pending alerts, a human reviewer approves or dismisses, only approved alerts leave the reviewer
  /** Creates a pending alert for every flag that should reach a human (moderate and above, or a trainer alert). Idempotent per athlete/rule/area/day/level. */
  queueAlerts(actor: Actor, athleteId: string, evaluation: Evaluation): Promise<Alert[]>;
  /** Reviewer: alerts for athletes on the actor's teams. */
  listAlerts(actor: Actor, filter?: { status?: AlertStatus }): Promise<Alert[]>;
  /** Reviewer decision. Audit-logged. */
  decideAlert(actor: Actor, alertId: string, decision: "approved" | "dismissed", at: string): Promise<Alert>;
  /** Coach: approved alerts for athletes on the coach's teams, reason + source only. */
  listCoachAlerts(actor: Actor, localDate: string): Promise<CoachAlertRow[]>;
  /** Parent: approved alerts for a linked minor. */
  listParentAlerts(actor: Actor, athleteId: string): Promise<ParentAlertRow[]>;
}

/** Methods a coach must never be able to call. Used by the guard and by tests. */
export const COACH_FORBIDDEN_METHODS = [
  "listTeamAthletes",
  "listLinkedMinors",
  "getConsentStatus",
  "grantConsent",
  "withdrawConsent",
  "upsertCheckin",
  "listCheckins",
  "createImpact",
  "listImpacts",
  "upsertSymptomLog",
  "listSymptomLogs",
  "saveEvaluation",
  "getLatestEvaluation",
  "recordOutcome",
  "listOutcomes",
  "listAuditLog",
  "setAvailability",
  "listAvailability",
  "queueAlerts",
  "listAlerts",
  "decideAlert",
  "listParentAlerts",
  "saveLandingResult",
  "getLatestLanding",
  "findImpactByExternalId",
  "recordCall",
  "listCalls",
] as const;

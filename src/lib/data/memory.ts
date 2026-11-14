import { isMinorOn } from "../time";
import type {
  Actor,
  Alert,
  AlertStatus,
  Availability,
  AuditEntry,
  Checkin,
  CoachAlertRow,
  ParentAlertRow,
  ConsentStatus,
  Evaluation,
  Flag,
  HitwatchCall,
  LandingResult,
  ImpactEvent,
  Outcome,
  Profile,
  SymptomLog,
} from "../types";
import { levelRank } from "../types";
import type { CallWrite, CheckinWrite, DataAccess, FlagWrite, ImpactWrite, LandingWrite, OutcomeWrite, SymptomLogWrite } from "./types";

export interface SeedData {
  profiles: Profile[];
  teams: { id: string; name: string; schoolId: string }[];
  memberships: { teamId: string; profileId: string }[];
  guardians: { guardianId: string; athleteId: string }[];
}

interface ConsentRow {
  id: string;
  athleteId: string;
  guardianId: string;
  grantedAt: string;
  withdrawnAt: string | null;
}

const uuid = (): string => crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory implementation used in demo mode and in tests. It models what the database does: one check-in per
 * athlete per day (latest wins, change logged), and an append-only audit log with no update or delete path.
 * It performs no permission checks itself; wrap it in GuardedDataAccess.
 */
export class MemoryDataAccess implements DataAccess {
  readonly mode = "demo" as const;
  private profiles = new Map<string, Profile>();
  private memberships: SeedData["memberships"];
  private guardians: SeedData["guardians"];
  private consents: ConsentRow[] = [];
  private checkins = new Map<string, Checkin>();
  private impacts: ImpactEvent[] = [];
  private symptomLogs: SymptomLog[] = [];
  private evaluations: Evaluation[] = [];
  private outcomes: Outcome[] = [];
  private availability = new Map<string, Availability>();
  private alerts: Alert[] = [];
  private landing: LandingResult[] = [];
  private calls: HitwatchCall[] = [];
  private audit: AuditEntry[] = []; // append-only: only pushAudit() writes to it.

  constructor(seed: SeedData) {
    seed.profiles.forEach((p) => this.profiles.set(p.id, clone(p)));
    this.memberships = clone(seed.memberships);
    this.guardians = clone(seed.guardians);
  }

  private pushAudit(e: Omit<AuditEntry, "id" | "occurredAt"> & { occurredAt?: string }): void {
    this.audit.push({ ...e, id: this.audit.length + 1, occurredAt: e.occurredAt ?? new Date().toISOString() });
  }

  async listDemoProfiles(): Promise<Profile[]> {
    return clone([...this.profiles.values()]);
  }

  async getProfile(_actor: Actor, profileId: string): Promise<Profile | null> {
    const p = this.profiles.get(profileId);
    return p ? clone(p) : null;
  }

  private teamIdsOf(profileId: string): Set<string> {
    return new Set(this.memberships.filter((m) => m.profileId === profileId).map((m) => m.teamId));
  }

  async listTeamAthletes(actor: Actor): Promise<Profile[]> {
    const teams = this.teamIdsOf(actor.id);
    const ids = new Set(this.memberships.filter((m) => teams.has(m.teamId)).map((m) => m.profileId));
    return clone([...ids].map((id) => this.profiles.get(id)).filter((p): p is Profile => !!p && p.role === "athlete"));
  }

  async listLinkedMinors(actor: Actor): Promise<Profile[]> {
    return clone(
      this.guardians
        .filter((g) => g.guardianId === actor.id)
        .map((g) => this.profiles.get(g.athleteId))
        .filter((p): p is Profile => !!p),
    );
  }

  async getConsentStatus(_actor: Actor, athleteId: string, onDate: string): Promise<ConsentStatus> {
    const athlete = this.profiles.get(athleteId);
    const required = isMinorOn(athlete?.dateOfBirth ?? null, onDate);
    const mine = this.consents.filter((c) => c.athleteId === athleteId);
    const active = mine.find((c) => c.withdrawnAt === null);
    const latest = mine[mine.length - 1];
    return {
      required,
      active: !!active,
      grantedAt: (active ?? latest)?.grantedAt ?? null,
      withdrawnAt: active ? null : (latest?.withdrawnAt ?? null),
      guardianId: (active ?? latest)?.guardianId ?? null,
    };
  }

  async grantConsent(actor: Actor, athleteId: string, at: string): Promise<void> {
    if (this.consents.some((c) => c.athleteId === athleteId && c.guardianId === actor.id && c.withdrawnAt === null)) return;
    this.consents.push({ id: uuid(), athleteId, guardianId: actor.id, grantedAt: at, withdrawnAt: null });
  }

  async withdrawConsent(actor: Actor, athleteId: string, at: string): Promise<void> {
    for (const c of this.consents) {
      if (c.athleteId === athleteId && c.guardianId === actor.id && c.withdrawnAt === null) c.withdrawnAt = at;
    }
  }

  async upsertCheckin(_actor: Actor, input: CheckinWrite) {
    const key = `${input.athleteId}|${input.localDate}`;
    const previous = this.checkins.get(key);
    const checkin: Checkin = {
      id: previous?.id ?? uuid(),
      athleteId: input.athleteId,
      localDate: input.localDate,
      sleepHours: input.sleepHours,
      workloadMinutes: input.workloadMinutes,
      workloadIntensity: input.workloadIntensity,
      soreness: clone(input.soreness),
      symptoms: [...input.symptoms],
      note: input.note,
      sorenessSides: input.sorenessSides ? clone(input.sorenessSides) : undefined,
      submittedAt: input.submittedAt,
    };
    this.checkins.set(key, checkin);
    if (previous) {
      this.pushAudit({
        eventType: "checkin_replaced",
        athleteId: input.athleteId,
        actorId: input.athleteId,
        flagId: null,
        payload: { localDate: input.localDate, previous: clone(previous) },
      });
    }
    return { checkin: clone(checkin), replacedPrevious: !!previous };
  }

  async listCheckins(_actor: Actor, athleteId: string, fromDate: string, toDate: string): Promise<Checkin[]> {
    return clone(
      [...this.checkins.values()]
        .filter((c) => c.athleteId === athleteId && c.localDate >= fromDate && c.localDate <= toDate)
        .sort((a, b) => a.localDate.localeCompare(b.localDate)),
    );
  }

  async createImpact(actor: Actor, input: ImpactWrite): Promise<ImpactEvent> {
    const e: ImpactEvent = { id: uuid(), athleteId: input.athleteId, occurredAt: input.occurredAt, context: input.context, reportedBy: actor.id, externalId: input.externalId ?? null, source: input.source ?? "athlete" };
    this.impacts.push(e);
    return clone(e);
  }

  async listImpacts(_actor: Actor, athleteId: string): Promise<ImpactEvent[]> {
    return clone(this.impacts.filter((i) => i.athleteId === athleteId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)));
  }

  async upsertSymptomLog(_actor: Actor, input: SymptomLogWrite): Promise<SymptomLog> {
    const existing = this.symptomLogs.find((l) => l.impactEventId === input.impactEventId && l.day === input.day);
    if (existing) {
      existing.symptoms = [...input.symptoms];
      existing.severity = input.severity;
      existing.severities = input.severities ? { ...input.severities } : undefined;
      existing.loggedAt = input.loggedAt;
      return clone(existing);
    }
    const row: SymptomLog = { id: uuid(), ...clone(input) };
    this.symptomLogs.push(row);
    return clone(row);
  }

  async listSymptomLogs(_actor: Actor, athleteId: string): Promise<SymptomLog[]> {
    return clone(this.symptomLogs.filter((l) => l.athleteId === athleteId));
  }

  async saveEvaluation(actor: Actor, athleteId: string, localDate: string, rulesVersion: string, flags: FlagWrite[]): Promise<Evaluation> {
    const id = uuid();
    const createdAt = new Date().toISOString();
    const saved: Flag[] = flags.map((f) => ({
      id: uuid(),
      athleteId,
      localDate,
      bodyArea: f.bodyArea,
      level: f.level,
      confidence: f.confidence,
      reason: f.reason,
      action: f.action,
      ruleId: f.ruleId,
      rulesVersion: f.rulesVersion,
      inputs: clone(f.inputs),
      trainerAlert: f.trainerAlert,
      evaluationId: id,
      createdAt,
    }));
    // Audit: every flag, and every escalation (urgent level or trainer alert).
    for (const f of saved) {
      this.pushAudit({
        eventType: "flag_created",
        athleteId,
        actorId: actor.id,
        flagId: f.id,
        payload: { ruleId: f.ruleId, rulesVersion: f.rulesVersion, level: f.level, bodyArea: f.bodyArea },
      });
      if (f.level === "urgent" || f.trainerAlert) {
        this.pushAudit({
          eventType: "escalation",
          athleteId,
          actorId: actor.id,
          flagId: f.id,
          payload: { ruleId: f.ruleId, level: f.level, trainerAlert: true },
        });
      }
    }
    const evaluation: Evaluation = { id, athleteId, localDate, rulesVersion, createdAt, flags: saved };
    this.evaluations.push(evaluation);
    return clone(evaluation);
  }

  async getLatestEvaluation(_actor: Actor, athleteId: string): Promise<Evaluation | null> {
    const mine = this.evaluations.filter((e) => e.athleteId === athleteId);
    return mine.length ? clone(mine[mine.length - 1]) : null;
  }

  async recordOutcome(actor: Actor, input: OutcomeWrite): Promise<Outcome> {
    const o: Outcome = { id: uuid(), ...input, notedBy: actor.id, createdAt: new Date().toISOString() };
    this.outcomes.push(o);
    return clone(o);
  }

  async listOutcomes(_actor: Actor, athleteId: string): Promise<Outcome[]> {
    return clone(this.outcomes.filter((o) => o.athleteId === athleteId));
  }

  async listAuditLog(_actor: Actor, athleteId: string): Promise<AuditEntry[]> {
    return clone(this.audit.filter((a) => a.athleteId === athleteId));
  }

  async setAvailability(_actor: Actor, athleteId: string, localDate: string, status: Exclude<Availability, "not_set">) {
    this.availability.set(`${athleteId}|${localDate}`, status);
  }

  async listAvailability(_actor: Actor, athleteId: string, localDate: string): Promise<Availability> {
    return this.availability.get(`${athleteId}|${localDate}`) ?? "not_set";
  }

  async saveLandingResult(_actor: Actor, input: LandingWrite): Promise<LandingResult> {
    const r: LandingResult = { id: uuid(), athleteId: input.athleteId, receivedAt: input.receivedAt, localDate: input.localDate, items: clone(input.items), score: input.score, band: input.band };
    this.landing.push(r);
    return clone(r);
  }

  async getLatestLanding(_actor: Actor, athleteId: string): Promise<LandingResult | null> {
    const mine = this.landing.filter((l) => l.athleteId === athleteId);
    return mine.length ? clone(mine[mine.length - 1]) : null;
  }

  async systemFindImpact(impactId: string): Promise<ImpactEvent | null> {
    const i = this.impacts.find((x) => x.id === impactId);
    return i ? clone(i) : null;
  }

  async findImpactByExternalId(_actor: Actor, athleteId: string, externalId: string): Promise<ImpactEvent | null> {
    const i = this.impacts.find((x) => x.athleteId === athleteId && x.externalId === externalId);
    return i ? clone(i) : null;
  }

  async recordCall(_actor: Actor, input: CallWrite): Promise<HitwatchCall> {
    const existing = this.calls.find((c) => c.impactEventId === input.impactEventId && c.day === input.day);
    if (existing) {
      // A call that was answered stays answered; otherwise the newest status wins.
      if (!(existing.status === "answered" && input.status !== "answered")) {
        existing.status = input.status;
        existing.channel = input.channel;
        existing.at = input.at;
      }
      existing.summary = input.summary ?? existing.summary;
      if (input.keywordFlags) existing.keywordFlags = [...input.keywordFlags]; // latest conversation replaces: confirmed flags clear
      return clone(existing);
    }
    const c: HitwatchCall = { id: uuid(), impactEventId: input.impactEventId, athleteId: input.athleteId, day: input.day, channel: input.channel, status: input.status, at: input.at, summary: input.summary ?? null, keywordFlags: [...(input.keywordFlags ?? [])] };
    this.calls.push(c);
    return clone(c);
  }

  async listCalls(_actor: Actor, athleteId: string): Promise<HitwatchCall[]> {
    return clone(this.calls.filter((c) => c.athleteId === athleteId).sort((a, b) => a.day - b.day));
  }

  // ---- approval queue
  async queueAlerts(actor: Actor, athleteId: string, evaluation: Evaluation): Promise<Alert[]> {
    const out: Alert[] = [];
    for (const f of evaluation.flags) {
      if (!(levelRank(f.level) >= levelRank("moderate") || f.trainerAlert)) continue;
      const dup = this.alerts.find(
        (a) => a.athleteId === athleteId && a.ruleId === f.ruleId && a.bodyArea === f.bodyArea && a.localDate === f.localDate && a.level === f.level,
      );
      if (dup) continue;
      const alert: Alert = {
        id: uuid(),
        athleteId,
        flagId: f.id,
        evaluationId: evaluation.id,
        localDate: f.localDate,
        ruleId: f.ruleId,
        rulesVersion: f.rulesVersion,
        level: f.level,
        bodyArea: f.bodyArea,
        reason: f.reason,
        action: f.action,
        confidence: f.confidence,
        inputs: clone(f.inputs),
        priority: alertPriority(f),
        status: "pending",
        createdAt: new Date().toISOString(),
        decidedAt: null,
        decidedBy: null,
        source: { ruleId: f.ruleId, rulesVersion: f.rulesVersion, grounding: null },
      };
      this.alerts.push(alert);
      this.pushAudit({ eventType: "alert_created", athleteId, actorId: actor.id, flagId: f.id, payload: { alertId: alert.id, ruleId: f.ruleId, level: f.level, priority: alert.priority } });
      out.push(clone(alert));
    }
    return out;
  }

  private athleteIdsOnTeamsOf(actorId: string): Set<string> {
    const teams = this.teamIdsOf(actorId);
    return new Set(this.memberships.filter((m) => teams.has(m.teamId) && this.profiles.get(m.profileId)?.role === "athlete").map((m) => m.profileId));
  }

  async listAlerts(actor: Actor, filter: { status?: AlertStatus } = {}): Promise<Alert[]> {
    const ids = this.athleteIdsOnTeamsOf(actor.id);
    return clone(
      this.alerts
        .filter((a) => ids.has(a.athleteId) && (!filter.status || a.status === filter.status))
        .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async decideAlert(actor: Actor, alertId: string, decision: "approved" | "dismissed", at: string): Promise<Alert> {
    const a = this.alerts.find((x) => x.id === alertId);
    if (!a) throw new Error("Unknown alert");
    if (a.status !== "pending") throw new Error("This alert has already been decided");
    a.status = decision;
    a.decidedAt = at;
    a.decidedBy = actor.id;
    this.pushAudit({ eventType: decision === "approved" ? "alert_approved" : "alert_dismissed", athleteId: a.athleteId, actorId: actor.id, flagId: a.flagId, payload: { alertId: a.id, ruleId: a.ruleId, level: a.level } });
    return clone(a);
  }

  async listCoachAlerts(actor: Actor, localDate: string): Promise<CoachAlertRow[]> {
    // Mirrors the restricted coach view: approved alerts only; reason + source + availability. No inputs, no raw data.
    const ids = this.athleteIdsOnTeamsOf(actor.id);
    return this.alerts
      .filter((a) => a.status === "approved" && ids.has(a.athleteId))
      .sort((a, b) => b.priority - a.priority || (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
      .map((a) => ({
        alertId: a.id,
        athleteId: a.athleteId,
        athleteLabel: this.profiles.get(a.athleteId)?.displayLabel ?? "?",
        level: a.level,
        reason: a.reason,
        source: clone(a.source),
        approvedAt: a.decidedAt ?? "",
        availability: this.availability.get(`${a.athleteId}|${localDate}`) ?? ("not_set" as Availability),
      }));
  }

  async listParentAlerts(_actor: Actor, athleteId: string): Promise<ParentAlertRow[]> {
    return this.alerts
      .filter((a) => a.status === "approved" && a.athleteId === athleteId)
      .sort((a, b) => b.priority - a.priority)
      .map((a) => ({ alertId: a.id, level: a.level, reason: a.reason, action: a.action, source: clone(a.source), approvedAt: a.decidedAt ?? "" }));
  }
}

function alertPriority(f: Pick<Flag, "level" | "trainerAlert" | "ruleId">): number {
  return levelRank(f.level) * 10 + (f.trainerAlert ? 1 : 0) + (f.ruleId === "red-flag" ? 5 : 0);
}

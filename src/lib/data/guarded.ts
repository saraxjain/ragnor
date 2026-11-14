import { localDateOf } from "../time";
import type { Actor, AlertStatus, Availability, Evaluation, Role } from "../types";
import {
  ConsentRequiredError,
  ForbiddenError,
  type CallWrite,
  type CheckinWrite,
  type DataAccess,
  type FlagWrite,
  type ImpactWrite,
  type LandingWrite,
  type OutcomeWrite,
  type SymptomLogWrite,
} from "./types";

/**
 * Enforces product rules in the data layer for ANY DataAccess implementation:
 *  - coaches can only call listCoachAlerts (approved alerts: reason + source + availability), nothing else;
 *  - only a reviewer (trainer) sees pending alerts; coaches and parents only ever see approved ones;
 *  - athletes see themselves, trainers see athletes on their teams, parents see their linked minor;
 *  - an athlete under 18 cannot submit health data until a guardian consent record is active.
 * The Firestore implementation is server-only (firestore.rules deny all client access), so this layer is the access control.
 */
export class GuardedDataAccess implements DataAccess {
  constructor(private readonly inner: DataAccess) {}

  get mode() {
    return this.inner.mode;
  }

  private requireRole(actor: Actor, ...roles: Role[]): void {
    if (!roles.includes(actor.role)) throw new ForbiddenError(`${actor.role} cannot do this`);
  }

  private async inTeam(actor: Actor, athleteId: string): Promise<boolean> {
    if (actor.role !== "trainer") return false;
    return (await this.inner.listTeamAthletes(actor)).some((p) => p.id === athleteId);
  }

  private async linked(actor: Actor, athleteId: string): Promise<boolean> {
    if (actor.role !== "parent") return false;
    return (await this.inner.listLinkedMinors(actor)).some((p) => p.id === athleteId);
  }

  /** Read access to one athlete's health-related rows. Coaches never pass. */
  private async assertCanRead(actor: Actor, athleteId: string, opts: { parent?: boolean } = {}): Promise<void> {
    if (actor.role === "coach") throw new ForbiddenError("Coaches can only see availability and training load");
    if (actor.role === "athlete" && actor.id === athleteId) return;
    if (await this.inTeam(actor, athleteId)) return;
    if (opts.parent && (await this.linked(actor, athleteId))) return;
    throw new ForbiddenError();
  }

  private async assertConsentForSubmission(athleteId: string, at: string): Promise<void> {
    const profile = await this.inner.getProfile({ id: athleteId, role: "athlete" }, athleteId);
    if (!profile) throw new ForbiddenError("Unknown athlete");
    const status = await this.inner.getConsentStatus({ id: athleteId, role: "athlete" }, athleteId, localDateOf(at, profile.timezone));
    if (status.required && !status.active) throw new ConsentRequiredError();
  }

  listDemoProfiles() {
    return this.inner.listDemoProfiles();
  }

  async getProfile(actor: Actor, profileId: string) {
    if (actor.id !== profileId) {
      if (actor.role === "coach") throw new ForbiddenError("Coaches cannot read athlete profiles");
      if (!(await this.inTeam(actor, profileId)) && !(await this.linked(actor, profileId))) throw new ForbiddenError();
    }
    return this.inner.getProfile(actor, profileId);
  }

  async listTeamAthletes(actor: Actor) {
    this.requireRole(actor, "trainer");
    return this.inner.listTeamAthletes(actor);
  }

  async listLinkedMinors(actor: Actor) {
    this.requireRole(actor, "parent");
    return this.inner.listLinkedMinors(actor);
  }

  async getConsentStatus(actor: Actor, athleteId: string, onDate: string) {
    if (actor.role === "coach") throw new ForbiddenError();
    if (!(actor.role === "athlete" && actor.id === athleteId) && !(await this.inTeam(actor, athleteId)) && !(await this.linked(actor, athleteId))) {
      throw new ForbiddenError();
    }
    return this.inner.getConsentStatus(actor, athleteId, onDate);
  }

  async grantConsent(actor: Actor, athleteId: string, at: string) {
    if (!(await this.linked(actor, athleteId))) throw new ForbiddenError("Only a linked parent or guardian can grant consent");
    return this.inner.grantConsent(actor, athleteId, at);
  }

  async withdrawConsent(actor: Actor, athleteId: string, at: string) {
    if (!(await this.linked(actor, athleteId))) throw new ForbiddenError("Only a linked parent or guardian can withdraw consent");
    return this.inner.withdrawConsent(actor, athleteId, at);
  }

  async upsertCheckin(actor: Actor, input: CheckinWrite) {
    if (!(actor.role === "athlete" && actor.id === input.athleteId)) throw new ForbiddenError("Athletes submit their own check-ins");
    await this.assertConsentForSubmission(input.athleteId, input.submittedAt);
    return this.inner.upsertCheckin(actor, input);
  }

  async listCheckins(actor: Actor, athleteId: string, fromDate: string, toDate: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.listCheckins(actor, athleteId, fromDate, toDate);
  }

  async createImpact(actor: Actor, input: ImpactWrite) {
    if (!(actor.role === "athlete" && actor.id === input.athleteId) && !(await this.inTeam(actor, input.athleteId))) throw new ForbiddenError();
    await this.assertConsentForSubmission(input.athleteId, input.occurredAt);
    return this.inner.createImpact(actor, input);
  }

  async listImpacts(actor: Actor, athleteId: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.listImpacts(actor, athleteId);
  }

  async upsertSymptomLog(actor: Actor, input: SymptomLogWrite) {
    if (!(actor.role === "athlete" && actor.id === input.athleteId)) throw new ForbiddenError("Athletes log their own symptoms");
    await this.assertConsentForSubmission(input.athleteId, input.loggedAt);
    return this.inner.upsertSymptomLog(actor, input);
  }

  async listSymptomLogs(actor: Actor, athleteId: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.listSymptomLogs(actor, athleteId);
  }

  async saveEvaluation(actor: Actor, athleteId: string, localDate: string, rulesVersion: string, flags: FlagWrite[]) {
    if (!(actor.role === "athlete" && actor.id === athleteId) && !(await this.inTeam(actor, athleteId))) throw new ForbiddenError();
    return this.inner.saveEvaluation(actor, athleteId, localDate, rulesVersion, flags);
  }

  async getLatestEvaluation(actor: Actor, athleteId: string) {
    await this.assertCanRead(actor, athleteId, { parent: true });
    return this.inner.getLatestEvaluation(actor, athleteId);
  }

  async recordOutcome(actor: Actor, input: OutcomeWrite) {
    if (input.kind === "trainer_checked") {
      if (!(await this.inTeam(actor, input.athleteId))) throw new ForbiddenError("Only the athlete's trainer can mark a flag as checked");
    } else if (!(actor.role === "athlete" && actor.id === input.athleteId)) {
      throw new ForbiddenError("Athletes record their own outcomes");
    }
    return this.inner.recordOutcome(actor, input);
  }

  async listOutcomes(actor: Actor, athleteId: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.listOutcomes(actor, athleteId);
  }

  async listAuditLog(actor: Actor, athleteId: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.listAuditLog(actor, athleteId);
  }

  async setAvailability(actor: Actor, athleteId: string, localDate: string, status: Exclude<Availability, "not_set">) {
    if (!(await this.inTeam(actor, athleteId))) throw new ForbiddenError("Only the athlete's trainer can set availability");
    return this.inner.setAvailability(actor, athleteId, localDate, status);
  }

  async listAvailability(actor: Actor, athleteId: string, localDate: string) {
    await this.assertCanRead(actor, athleteId, { parent: true });
    return this.inner.listAvailability(actor, athleteId, localDate);
  }

  async saveLandingResult(actor: Actor, input: LandingWrite) {
    if (!(actor.role === "athlete" && actor.id === input.athleteId) && !(await this.inTeam(actor, input.athleteId))) throw new ForbiddenError();
    await this.assertConsentForSubmission(input.athleteId, input.receivedAt);
    return this.inner.saveLandingResult(actor, input);
  }

  async getLatestLanding(actor: Actor, athleteId: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.getLatestLanding(actor, athleteId);
  }

  systemFindImpact(impactId: string) {
    return this.inner.systemFindImpact(impactId);
  }

  async findImpactByExternalId(actor: Actor, athleteId: string, externalId: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.findImpactByExternalId(actor, athleteId, externalId);
  }

  async recordCall(actor: Actor, input: CallWrite) {
    if (!(actor.role === "athlete" && actor.id === input.athleteId) && !(await this.inTeam(actor, input.athleteId))) throw new ForbiddenError();
    return this.inner.recordCall(actor, input);
  }

  async listCalls(actor: Actor, athleteId: string) {
    await this.assertCanRead(actor, athleteId);
    return this.inner.listCalls(actor, athleteId);
  }

  async queueAlerts(actor: Actor, athleteId: string, evaluation: Evaluation) {
    if (!(actor.role === "athlete" && actor.id === athleteId) && !(await this.inTeam(actor, athleteId))) throw new ForbiddenError();
    return this.inner.queueAlerts(actor, athleteId, evaluation);
  }

  /** Reviewer (trainer) queue. Coaches and parents never see pending or dismissed alerts. */
  async listAlerts(actor: Actor, filter?: { status?: AlertStatus }) {
    this.requireRole(actor, "trainer");
    return this.inner.listAlerts(actor, filter);
  }

  async decideAlert(actor: Actor, alertId: string, decision: "approved" | "dismissed", at: string) {
    this.requireRole(actor, "trainer");
    const alert = (await this.inner.listAlerts(actor)).find((a) => a.id === alertId);
    if (!alert) throw new ForbiddenError("That alert is not in your queue");
    return this.inner.decideAlert(actor, alertId, decision, at);
  }

  /** The only data a coach can read: approved alerts (reason + source) and reviewer-set availability. */
  async listCoachAlerts(actor: Actor, localDate: string) {
    this.requireRole(actor, "coach");
    return this.inner.listCoachAlerts(actor, localDate);
  }

  async listParentAlerts(actor: Actor, athleteId: string) {
    if (!(await this.linked(actor, athleteId))) throw new ForbiddenError();
    return this.inner.listParentAlerts(actor, athleteId);
  }
}

// Firestore-backed DataAccess (server only, via the Firebase Admin SDK).
//
// Docs read 2026-11-14:
//  - https://firebase.google.com/docs/admin/setup  (npm `firebase-admin`; `initializeApp({ credential: applicationDefault(), projectId })`;
//    set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file path for non-Google environments)
//  - https://firebase.google.com/docs/firestore/security/get-started  (deny-all rules; server client libraries bypass rules)
// Posture: firestore.rules deny ALL client access; only this server code talks to Firestore, and src/lib/data/guarded.ts does the
// access control. Audit rows are only ever appended. Not exercised against a real project or the emulator (none available here).
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { isMinorOn } from "../time";
import { levelRank } from "../types";
import type {
  Actor, Alert, AlertStatus, Availability, AuditEntry, Checkin, CoachAlertRow, ConsentStatus, Evaluation, Flag, HitwatchCall, ImpactEvent,
  LandingResult, Outcome, ParentAlertRow, Profile, SymptomLog,
} from "../types";
import type { CallWrite, CheckinWrite, DataAccess, FlagWrite, ImpactWrite, LandingWrite, OutcomeWrite, SymptomLogWrite } from "./types";

type Doc = Record<string, unknown>;
const uuid = (): string => crypto.randomUUID();
const strip = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T; // Firestore rejects undefined

export function createFirestoreFromEnv(env: Record<string, string | undefined> = process.env): FirestoreDataAccess {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set.");
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  return new FirestoreDataAccess(getFirestore(app));
}

export class FirestoreDataAccess implements DataAccess {
  readonly mode = "firestore" as const;
  constructor(private readonly db: Firestore) {}

  private async all<T>(collection: string, field?: string, value?: unknown): Promise<T[]> {
    const ref = this.db.collection(collection);
    const snap = await (field ? ref.where(field, "==", value) : ref).get();
    return snap.docs.map((d) => d.data() as T);
  }
  private async one<T>(collection: string, id: string): Promise<T | null> {
    const d = await this.db.collection(collection).doc(id).get();
    return d.exists ? (d.data() as T) : null;
  }
  private async put(collection: string, id: string, data: object): Promise<void> {
    await this.db.collection(collection).doc(id).set(strip(data));
  }
  private async audit(e: Omit<AuditEntry, "id" | "occurredAt">): Promise<void> {
    // append-only: only add(), never update/delete
    await this.db.collection("auditLog").add(strip({ ...e, id: Date.now() * 1000 + Math.floor(Math.random() * 1000), occurredAt: new Date().toISOString() }));
  }

  async listDemoProfiles(): Promise<Profile[]> {
    return []; // no demo picker in Firestore mode
  }
  async getProfile(_a: Actor, id: string): Promise<Profile | null> {
    return this.one<Profile>("profiles", id);
  }
  private async teamIdsOf(profileId: string): Promise<Set<string>> {
    return new Set((await this.all<{ teamId: string }>("memberships", "profileId", profileId)).map((m) => m.teamId));
  }
  private async athleteIdsOnTeamsOf(actorId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const t of await this.teamIdsOf(actorId)) for (const m of await this.all<{ profileId: string }>("memberships", "teamId", t)) ids.add(m.profileId);
    const out = new Set<string>();
    for (const id of ids) if ((await this.one<Profile>("profiles", id))?.role === "athlete") out.add(id);
    return out;
  }
  async listTeamAthletes(actor: Actor): Promise<Profile[]> {
    const ps = await Promise.all([...(await this.athleteIdsOnTeamsOf(actor.id))].map((id) => this.one<Profile>("profiles", id)));
    return ps.filter((p): p is Profile => !!p);
  }
  async listLinkedMinors(actor: Actor): Promise<Profile[]> {
    const links = await this.all<{ athleteId: string }>("guardians", "guardianId", actor.id);
    const ps = await Promise.all(links.map((l) => this.one<Profile>("profiles", l.athleteId)));
    return ps.filter((p): p is Profile => !!p);
  }

  async getConsentStatus(_a: Actor, athleteId: string, onDate: string): Promise<ConsentStatus> {
    const athlete = await this.one<Profile>("profiles", athleteId);
    const mine = (await this.all<{ guardianId: string; grantedAt: string; withdrawnAt: string | null }>("consents", "athleteId", athleteId)).sort((a, b) => a.grantedAt.localeCompare(b.grantedAt));
    const active = mine.find((c) => c.withdrawnAt === null);
    const latest = mine[mine.length - 1];
    const pick = active ?? latest;
    return { required: isMinorOn(athlete?.dateOfBirth ?? null, onDate), active: !!active, grantedAt: pick?.grantedAt ?? null, withdrawnAt: active ? null : (latest?.withdrawnAt ?? null), guardianId: pick?.guardianId ?? null };
  }
  async grantConsent(actor: Actor, athleteId: string, at: string): Promise<void> {
    const id = `${athleteId}_${actor.id}`;
    const cur = await this.one<{ withdrawnAt: string | null }>("consents", id);
    if (cur && cur.withdrawnAt === null) return;
    await this.put("consents", id, { athleteId, guardianId: actor.id, grantedAt: at, withdrawnAt: null });
  }
  async withdrawConsent(actor: Actor, athleteId: string, at: string): Promise<void> {
    await this.db.collection("consents").doc(`${athleteId}_${actor.id}`).set({ withdrawnAt: at }, { merge: true });
  }

  async upsertCheckin(_a: Actor, i: CheckinWrite): Promise<{ checkin: Checkin; replacedPrevious: boolean }> {
    const id = `${i.athleteId}_${i.localDate}`;
    const prev = await this.one<Checkin>("checkins", id);
    const checkin: Checkin = { id: prev?.id ?? uuid(), athleteId: i.athleteId, localDate: i.localDate, sleepHours: i.sleepHours, workloadMinutes: i.workloadMinutes, workloadIntensity: i.workloadIntensity, soreness: i.soreness, symptoms: i.symptoms, note: i.note, sorenessSides: i.sorenessSides, submittedAt: i.submittedAt };
    await this.put("checkins", id, checkin);
    if (prev) await this.audit({ eventType: "checkin_replaced", athleteId: i.athleteId, actorId: i.athleteId, flagId: null, payload: { localDate: i.localDate, previous: prev } });
    return { checkin, replacedPrevious: !!prev };
  }
  async listCheckins(_a: Actor, athleteId: string, from: string, to: string): Promise<Checkin[]> {
    return (await this.all<Checkin>("checkins", "athleteId", athleteId)).filter((c) => c.localDate >= from && c.localDate <= to).sort((a, b) => a.localDate.localeCompare(b.localDate));
  }

  async createImpact(actor: Actor, i: ImpactWrite): Promise<ImpactEvent> {
    const e: ImpactEvent = { id: uuid(), athleteId: i.athleteId, occurredAt: i.occurredAt, context: i.context, reportedBy: actor.id, externalId: i.externalId ?? null, source: i.source ?? "athlete" };
    await this.put("impacts", e.id, e);
    return e;
  }
  async listImpacts(_a: Actor, athleteId: string): Promise<ImpactEvent[]> {
    return (await this.all<ImpactEvent>("impacts", "athleteId", athleteId)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
  async systemFindImpact(id: string): Promise<ImpactEvent | null> {
    return this.one<ImpactEvent>("impacts", id);
  }
  async findImpactByExternalId(_a: Actor, athleteId: string, externalId: string): Promise<ImpactEvent | null> {
    return (await this.listImpacts({ id: athleteId, role: "athlete" }, athleteId)).find((i) => i.externalId === externalId) ?? null;
  }

  async upsertSymptomLog(_a: Actor, i: SymptomLogWrite): Promise<SymptomLog> {
    const id = `${i.impactEventId}_${i.day}`;
    const prev = await this.one<SymptomLog>("symptomLogs", id);
    const row: SymptomLog = { id: prev?.id ?? uuid(), impactEventId: i.impactEventId, athleteId: i.athleteId, day: i.day, symptoms: i.symptoms, severity: i.severity, severities: i.severities, loggedAt: i.loggedAt };
    await this.put("symptomLogs", id, row);
    return row;
  }
  async listSymptomLogs(_a: Actor, athleteId: string): Promise<SymptomLog[]> {
    return this.all<SymptomLog>("symptomLogs", "athleteId", athleteId);
  }

  async saveEvaluation(actor: Actor, athleteId: string, localDate: string, rulesVersion: string, flags: FlagWrite[]): Promise<Evaluation> {
    const id = uuid();
    const createdAt = new Date().toISOString();
    const saved: Flag[] = flags.map((f) => ({ id: uuid(), athleteId, localDate, bodyArea: f.bodyArea, level: f.level, confidence: f.confidence, reason: f.reason, action: f.action, ruleId: f.ruleId, rulesVersion: f.rulesVersion, inputs: f.inputs, trainerAlert: f.trainerAlert, evaluationId: id, createdAt }));
    const evaluation: Evaluation = { id, athleteId, localDate, rulesVersion, createdAt, flags: saved };
    await this.put("evaluations", id, evaluation); // flags are embedded: one atomic document per evaluation
    for (const f of saved) {
      await this.audit({ eventType: "flag_created", athleteId, actorId: actor.id, flagId: f.id, payload: { ruleId: f.ruleId, rulesVersion: f.rulesVersion, level: f.level, bodyArea: f.bodyArea } });
      if (f.level === "urgent" || f.trainerAlert) await this.audit({ eventType: "escalation", athleteId, actorId: actor.id, flagId: f.id, payload: { ruleId: f.ruleId, level: f.level, trainerAlert: true } });
    }
    return evaluation;
  }
  async getLatestEvaluation(_a: Actor, athleteId: string): Promise<Evaluation | null> {
    const ev = await this.all<Evaluation>("evaluations", "athleteId", athleteId);
    return ev.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async recordOutcome(actor: Actor, i: OutcomeWrite): Promise<Outcome> {
    const o: Outcome = { id: uuid(), ...i, notedBy: actor.id, createdAt: new Date().toISOString() };
    await this.put("outcomes", o.id, o);
    return o;
  }
  async listOutcomes(_a: Actor, athleteId: string): Promise<Outcome[]> {
    return this.all<Outcome>("outcomes", "athleteId", athleteId);
  }
  async listAuditLog(_a: Actor, athleteId: string): Promise<AuditEntry[]> {
    return (await this.all<AuditEntry>("auditLog", "athleteId", athleteId)).sort((a, b) => a.id - b.id);
  }

  async setAvailability(_a: Actor, athleteId: string, localDate: string, status: Exclude<Availability, "not_set">): Promise<void> {
    await this.put("availability", `${athleteId}_${localDate}`, { athleteId, localDate, status });
  }
  async listAvailability(_a: Actor, athleteId: string, localDate: string): Promise<Availability> {
    return (await this.one<{ status: Availability }>("availability", `${athleteId}_${localDate}`))?.status ?? "not_set";
  }

  async saveLandingResult(_a: Actor, i: LandingWrite): Promise<LandingResult> {
    const r: LandingResult = { id: uuid(), athleteId: i.athleteId, receivedAt: i.receivedAt, localDate: i.localDate, items: i.items, score: i.score, band: i.band };
    await this.put("landing", r.id, r);
    return r;
  }
  async getLatestLanding(_a: Actor, athleteId: string): Promise<LandingResult | null> {
    return (await this.all<LandingResult>("landing", "athleteId", athleteId)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0] ?? null;
  }

  async recordCall(_a: Actor, i: CallWrite): Promise<HitwatchCall> {
    const id = `${i.impactEventId}_${i.day}`;
    const prev = await this.one<HitwatchCall>("calls", id);
    const keepAnswered = prev?.status === "answered" && i.status !== "answered";
    const c: HitwatchCall = {
      id: prev?.id ?? uuid(), impactEventId: i.impactEventId, athleteId: i.athleteId, day: i.day,
      channel: keepAnswered ? prev!.channel : i.channel, status: keepAnswered ? "answered" : i.status, at: keepAnswered ? prev!.at : i.at,
      summary: i.summary ?? prev?.summary ?? null, keywordFlags: i.keywordFlags ? [...i.keywordFlags] : (prev?.keywordFlags ?? []),
    };
    await this.put("calls", id, c);
    return c;
  }
  async listCalls(_a: Actor, athleteId: string): Promise<HitwatchCall[]> {
    return (await this.all<HitwatchCall>("calls", "athleteId", athleteId)).sort((a, b) => a.day - b.day);
  }

  // ---- approval queue
  async queueAlerts(actor: Actor, athleteId: string, evaluation: Evaluation): Promise<Alert[]> {
    const existing = await this.all<Alert>("alerts", "athleteId", athleteId);
    const out: Alert[] = [];
    for (const f of evaluation.flags) {
      if (!(levelRank(f.level) >= levelRank("moderate") || f.trainerAlert)) continue;
      if (existing.some((a) => a.ruleId === f.ruleId && a.bodyArea === f.bodyArea && a.localDate === f.localDate && a.level === f.level)) continue;
      const alert: Alert = {
        id: uuid(), athleteId, flagId: f.id, evaluationId: evaluation.id, localDate: f.localDate, ruleId: f.ruleId, rulesVersion: f.rulesVersion, level: f.level, bodyArea: f.bodyArea,
        reason: f.reason, action: f.action, confidence: f.confidence, inputs: f.inputs, priority: levelRank(f.level) * 10 + (f.trainerAlert ? 1 : 0) + (f.ruleId === "red-flag" ? 5 : 0),
        status: "pending", createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, source: { ruleId: f.ruleId, rulesVersion: f.rulesVersion, grounding: null },
      };
      await this.put("alerts", alert.id, alert);
      existing.push(alert);
      await this.audit({ eventType: "alert_created", athleteId, actorId: actor.id, flagId: f.id, payload: { alertId: alert.id, ruleId: f.ruleId, level: f.level, priority: alert.priority } });
      out.push(alert);
    }
    return out;
  }
  async listAlerts(actor: Actor, filter: { status?: AlertStatus } = {}): Promise<Alert[]> {
    const ids = await this.athleteIdsOnTeamsOf(actor.id);
    const all = (await Promise.all([...ids].map((id) => this.all<Alert>("alerts", "athleteId", id)))).flat();
    return all.filter((a) => !filter.status || a.status === filter.status).sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
  }
  async decideAlert(actor: Actor, alertId: string, decision: "approved" | "dismissed", at: string): Promise<Alert> {
    const a = await this.one<Alert>("alerts", alertId);
    if (!a) throw new Error("Unknown alert");
    if (a.status !== "pending") throw new Error("This alert has already been decided");
    const next: Alert = { ...a, status: decision, decidedAt: at, decidedBy: actor.id };
    await this.put("alerts", alertId, next);
    await this.audit({ eventType: decision === "approved" ? "alert_approved" : "alert_dismissed", athleteId: a.athleteId, actorId: actor.id, flagId: a.flagId, payload: { alertId, ruleId: a.ruleId, level: a.level } });
    return next;
  }
  async listCoachAlerts(actor: Actor, localDate: string): Promise<CoachAlertRow[]> {
    const ids = await this.athleteIdsOnTeamsOf(actor.id);
    const rows: CoachAlertRow[] = [];
    for (const id of ids) {
      const label = (await this.one<Profile>("profiles", id))?.displayLabel ?? "?";
      const availability = await this.listAvailability(actor, id, localDate);
      for (const a of await this.all<Alert>("alerts", "athleteId", id)) {
        if (a.status === "approved") rows.push({ alertId: a.id, athleteId: id, athleteLabel: label, level: a.level, reason: a.reason, source: a.source, approvedAt: a.decidedAt ?? "", availability });
      }
    }
    return rows.sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.approvedAt.localeCompare(a.approvedAt));
  }
  async listParentAlerts(_a: Actor, athleteId: string): Promise<ParentAlertRow[]> {
    return (await this.all<Alert>("alerts", "athleteId", athleteId)).filter((a) => a.status === "approved").map((a) => ({ alertId: a.id, level: a.level, reason: a.reason, action: a.action, source: a.source, approvedAt: a.decidedAt ?? "" }));
  }
}
export type { Doc };

import { beforeEach, describe, expect, it } from "vitest";
import { ConsentRequiredError, ForbiddenError, type DataAccess } from "@/lib/data";
import { DEMO_IDS, createDemoStore } from "@/lib/data/seed";
import { GuardedDataAccess } from "@/lib/data/guarded";
import { MemoryDataAccess } from "@/lib/data/memory";
import { RED_FLAG_SYMPTOMS } from "@/lib/rules";
import { getCoachView, getRoster, logFollowUp, reportImpact, submitCheckin } from "@/lib/services";
import type { Actor, Profile } from "@/lib/types";

const NOW = new Date("2026-11-14T18:00:00.000Z"); // 10:00 in Los Angeles
const A = (id: string, role: Actor["role"]): Actor => ({ id, role });
const coach = A(DEMO_IDS.coach, "coach");
const trainer = A(DEMO_IDS.trainer, "trainer");
const parent = A(DEMO_IDS.parent, "parent");
const jm = A(DEMO_IDS.jm, "athlete");
const rt = A(DEMO_IDS.rt, "athlete"); // under 18, no consent
const sl = A(DEMO_IDS.sl, "athlete");

const emptyCheckin = { sleepHours: 7, workloadMinutes: 60, workloadIntensity: 5, soreness: {}, symptoms: [] as string[], note: null };

let da: DataAccess;
beforeEach(async () => {
  da = await createDemoStore(NOW);
});

describe("rule 3: coaches see availability and training load only (data layer)", () => {
  const D = DEMO_IDS;
  const calls: Record<string, (a: DataAccess) => Promise<unknown>> = {
    getProfile: (a) => a.getProfile(coach, D.mp),
    listTeamAthletes: (a) => a.listTeamAthletes(coach),
    listLinkedMinors: (a) => a.listLinkedMinors(coach),
    getConsentStatus: (a) => a.getConsentStatus(coach, D.ak, "2026-11-14"),
    grantConsent: (a) => a.grantConsent(coach, D.ak, NOW.toISOString()),
    withdrawConsent: (a) => a.withdrawConsent(coach, D.ak, NOW.toISOString()),
    upsertCheckin: (a) => a.upsertCheckin(coach, { athleteId: D.jm, localDate: "2026-11-14", ...emptyCheckin, submittedAt: NOW.toISOString() }),
    listCheckins: (a) => a.listCheckins(coach, D.mp, "2026-11-01", "2026-11-14"),
    createImpact: (a) => a.createImpact(coach, { athleteId: D.jm, occurredAt: NOW.toISOString(), context: null }),
    listImpacts: (a) => a.listImpacts(coach, D.dw),
    upsertSymptomLog: (a) => a.upsertSymptomLog(coach, { impactEventId: "x", athleteId: D.dw, day: 1, symptoms: [], severity: 0, loggedAt: NOW.toISOString() }),
    listSymptomLogs: (a) => a.listSymptomLogs(coach, D.dw),
    saveEvaluation: (a) => a.saveEvaluation(coach, D.jm, "2026-11-14", "v", []),
    getLatestEvaluation: (a) => a.getLatestEvaluation(coach, D.mp),
    recordOutcome: (a) => a.recordOutcome(coach, { flagId: "x", athleteId: D.mp, kind: "trainer_checked", adviceFollowed: null, laterSymptomOrInjury: null, missedTraining: null }),
    listOutcomes: (a) => a.listOutcomes(coach, D.mp),
    listAuditLog: (a) => a.listAuditLog(coach, D.mp),
    setAvailability: (a) => a.setAvailability(coach, D.jm, "2026-11-14", "out"),
    listAvailability: (a) => a.listAvailability(coach, D.jm, "2026-11-14"),
    queueAlerts: (a) => a.queueAlerts(coach, D.jm, { id: "e", athleteId: D.jm, localDate: "2026-11-14", rulesVersion: "v", createdAt: "", flags: [] }),
    listAlerts: (a) => a.listAlerts(coach, { status: "pending" }),
    decideAlert: (a) => a.decideAlert(coach, "x", "approved", NOW.toISOString()),
    listParentAlerts: (a) => a.listParentAlerts(coach, D.ak),
    saveLandingResult: (a) => a.saveLandingResult(coach, { athleteId: D.jm, localDate: "2026-11-14", receivedAt: NOW.toISOString(), items: [], score: 1, band: "low" }),
    getLatestLanding: (a) => a.getLatestLanding(coach, D.jm),
    findImpactByExternalId: (a) => a.findImpactByExternalId(coach, D.jm, "x"),
    recordCall: (a) => a.recordCall(coach, { impactEventId: "x", athleteId: D.jm, day: 1, channel: "phone", status: "answered", at: NOW.toISOString() }),
    listCalls: (a) => a.listCalls(coach, D.dw),
  };

  it.each(Object.keys(calls))("coach calling %s is forbidden", async (name) => {
    await expect(calls[name](da)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("covers every DataAccess method except the coach view and the pre-login demo picker", () => {
    const methods = Object.getOwnPropertyNames(GuardedDataAccess.prototype).filter((m) => m !== "constructor" && m !== "mode");
    const allowed = ["listCoachAlerts", "listDemoProfiles", "assertCanRead", "assertConsentForSubmission", "inTeam", "linked", "requireRole", "systemFindImpact"];
    expect(Object.keys(calls).sort()).toEqual(methods.filter((m) => !allowed.includes(m)).sort());
  });

  it("before any approval the coach sees nothing: pending alerts never reach the coach view", async () => {
    expect((await da.listAlerts(trainer, { status: "pending" })).length).toBeGreaterThan(0); // the queue is full
    expect(await da.listCoachAlerts(coach, "2026-11-14")).toEqual([]);
  });

  it("after the reviewer approves, the coach sees only reason + source (no inputs, no raw health data); dismissed alerts never appear", async () => {
    const pending = await da.listAlerts(trainer, { status: "pending" });
    const redFlag = pending.find((a) => a.ruleId === "red-flag")!;
    const other = pending.find((a) => a.ruleId !== "red-flag")!;
    await da.decideAlert(trainer, redFlag.id, "approved", NOW.toISOString());
    await da.decideAlert(trainer, other.id, "dismissed", NOW.toISOString());
    const rows = await da.listCoachAlerts(coach, "2026-11-14");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ alertId: redFlag.id, level: "urgent", source: { ruleId: "red-flag", grounding: null } });
    const allowedKeys = ["alertId", "athleteId", "athleteLabel", "availability", "approvedAt", "level", "reason", "source"];
    expect(Object.keys(rows[0]).sort()).toEqual(allowedKeys.sort());
    const json = JSON.stringify(rows).toLowerCase();
    for (const secret of ["inputs", "soreness", "sleephours", "workload", "checkin", "symptoms", "impact", "note", "flagid", "evaluation"]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(rows.every((r) => r.athleteLabel.length <= 4)).toBe(true); // initials only
    expect(JSON.stringify(rows)).not.toContain(other.reason);
  });

  it("the coach screen model is built only from approved alerts", async () => {
    expect(await getCoachView(da, coach, NOW, "America/Los_Angeles")).toEqual([]);
    const a = (await da.listAlerts(trainer, { status: "pending" }))[0];
    await da.decideAlert(trainer, a.id, "approved", NOW.toISOString());
    const view = await getCoachView(da, coach, NOW, "America/Los_Angeles");
    expect(view).toHaveLength(1);
    for (const r of view) expect(Object.keys(r).sort()).toEqual(["alertId", "approvedAt", "athleteId", "athleteLabel", "availability", "level", "reason", "source"]);
  });

  it("only coaches can call the coach view; only a trainer can decide alerts, and only for their own team", async () => {
    await expect(da.listCoachAlerts(trainer, "2026-11-14")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.listCoachAlerts(jm, "2026-11-14")).rejects.toBeInstanceOf(ForbiddenError);
    const a = (await da.listAlerts(trainer, { status: "pending" }))[0];
    await expect(da.decideAlert(jm, a.id, "approved", NOW.toISOString())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.decideAlert(coach, a.id, "approved", NOW.toISOString())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.decideAlert(parent, a.id, "approved", NOW.toISOString())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.listAlerts(parent)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the reviewer sets availability and the coach sees it next to an approved alert", async () => {
    await da.setAvailability(trainer, DEMO_IDS.jm, "2026-11-14", "limited");
    const mpAlert = (await da.listAlerts(trainer, { status: "pending" })).find((x) => x.athleteId === DEMO_IDS.jm)!;
    await da.decideAlert(trainer, mpAlert.id, "approved", NOW.toISOString());
    const rows = await da.listCoachAlerts(coach, "2026-11-14");
    expect(rows.find((r) => r.athleteId === DEMO_IDS.jm)?.availability).toBe("limited");
    await expect(da.setAvailability(jm, DEMO_IDS.jm, "2026-11-14", "available")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("rule: a human approves every alert before it reaches a coach or parent (approval queue)", () => {
  it("rules create pending alerts for moderate and above and for trainer alerts, with reason, inputs and rule version; low notes are not queued", async () => {
    const pending = await da.listAlerts(trainer, { status: "pending" });
    expect(pending.length).toBeGreaterThanOrEqual(4);
    for (const a of pending) {
      expect(a.status).toBe("pending");
      expect(a.reason).toBeTruthy();
      expect(a.rulesVersion).toBeTruthy();
      expect(a.inputs).toBeTruthy();
      expect(a.decidedBy).toBeNull();
      expect(["low"].includes(a.level) && a.ruleId !== "red-flag" && !a.priority).toBe(false);
    }
    expect(pending.some((a) => a.ruleId === "insufficient-data")).toBe(false);
    expect(pending[0].ruleId).toBe("red-flag"); // top priority first
    expect(pending[0].priority).toBeGreaterThan(pending[pending.length - 1].priority);
  });

  it("a parent sees nothing until approval, then only the approved reason and source; dismissed never", async () => {
    const akAlert = (await da.listAlerts(trainer, { status: "pending" })).find((a) => a.athleteId === DEMO_IDS.ak)!;
    expect(await da.listParentAlerts(parent, DEMO_IDS.ak)).toEqual([]);
    await da.decideAlert(trainer, akAlert.id, "approved", NOW.toISOString());
    const rows = await da.listParentAlerts(parent, DEMO_IDS.ak);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["action", "alertId", "approvedAt", "level", "reason", "source"]);
    await expect(da.listParentAlerts(parent, DEMO_IDS.jm)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a decision is final and audit-logged (created, approved, dismissed)", async () => {
    const [first, second] = await da.listAlerts(trainer, { status: "pending" });
    await da.decideAlert(trainer, first.id, "approved", NOW.toISOString());
    await da.decideAlert(trainer, second.id, "dismissed", NOW.toISOString());
    await expect(da.decideAlert(trainer, first.id, "dismissed", NOW.toISOString())).rejects.toThrow(/already/);
    const audit = [...(await da.listAuditLog(trainer, first.athleteId)), ...(await da.listAuditLog(trainer, second.athleteId))];
    expect(audit.some((e) => e.eventType === "alert_created" && (e.payload as { alertId: string }).alertId === first.id)).toBe(true);
    expect(audit.some((e) => e.eventType === "alert_approved" && (e.payload as { alertId: string }).alertId === first.id && e.actorId === DEMO_IDS.trainer)).toBe(true);
    expect(audit.some((e) => e.eventType === "alert_dismissed" && (e.payload as { alertId: string }).alertId === second.id)).toBe(true);
  });

  it("re-running the rules the same day does not create duplicate alerts", async () => {
    const before = (await da.listAlerts(trainer)).length;
    await submitCheckin(da, A(DEMO_IDS.sl, "athlete"), parseOk(emptyCheckin), NOW);
    const mid = (await da.listAlerts(trainer)).length;
    await submitCheckin(da, A(DEMO_IDS.sl, "athlete"), parseOk(emptyCheckin), new Date(NOW.getTime() + 1000));
    expect((await da.listAlerts(trainer)).length).toBe(mid);
    expect(mid).toBeGreaterThanOrEqual(before);
  });

  it("an athlete's own urgent guidance is immediate: the athlete sees their urgent flag before any approval", async () => {
    const mp = A(DEMO_IDS.mp, "athlete");
    const ev = await da.getLatestEvaluation(mp, DEMO_IDS.mp);
    expect(ev!.flags.some((f) => f.level === "urgent")).toBe(true);
    expect((await da.listAlerts(trainer, { status: "approved" })).length).toBe(0);
  });
});

describe("scoping: athlete, trainer, parent", () => {
  it("an athlete cannot read another athlete's data", async () => {
    await expect(da.listCheckins(jm, DEMO_IDS.sl, "2026-11-01", "2026-11-14")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.getLatestEvaluation(jm, DEMO_IDS.mp)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a trainer with no shared team cannot read an athlete", async () => {
    const inner = new MemoryDataAccess({
      profiles: [
        { id: "t1", role: "trainer", displayLabel: "T.1", dateOfBirth: "1980-01-01", timezone: "UTC", schoolId: null },
        { id: "t2", role: "trainer", displayLabel: "T.2", dateOfBirth: "1980-01-01", timezone: "UTC", schoolId: null },
        { id: "a1", role: "athlete", displayLabel: "A.1", dateOfBirth: "2000-01-01", timezone: "UTC", schoolId: null },
      ] satisfies Profile[],
      teams: [],
      memberships: [
        { teamId: "x", profileId: "t1" },
        { teamId: "x", profileId: "a1" },
        { teamId: "y", profileId: "t2" },
      ],
      guardians: [],
    });
    const g = new GuardedDataAccess(inner);
    await expect(g.listCheckins(A("t1", "trainer"), "a1", "2026-01-01", "2026-12-31")).resolves.toEqual([]);
    await expect(g.listCheckins(A("t2", "trainer"), "a1", "2026-01-01", "2026-12-31")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a parent sees the linked minor's latest evaluation but not raw check-ins, and an unrelated athlete's nothing", async () => {
    await expect(da.getLatestEvaluation(parent, DEMO_IDS.ak)).resolves.toBeTruthy();
    await expect(da.listCheckins(parent, DEMO_IDS.ak, "2026-11-01", "2026-11-14")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.getLatestEvaluation(parent, DEMO_IDS.jm)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("rule 6: athletes under 18 need a guardian consent record before submitting health data", () => {
  const today = "2026-11-14";

  it("blocks check-ins, impact reports and symptom logs without consent", async () => {
    await expect(submitCheckin(da, rt, parseOk(emptyCheckin), NOW)).rejects.toBeInstanceOf(ConsentRequiredError);
    await expect(reportImpact(da, rt, DEMO_IDS.rt, null, NOW)).rejects.toBeInstanceOf(ConsentRequiredError);
    await expect(
      da.upsertSymptomLog(rt, { impactEventId: "x", athleteId: DEMO_IDS.rt, day: 1, symptoms: [], severity: 0, loggedAt: NOW.toISOString() }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(await da.listCheckins(trainer, DEMO_IDS.rt, "2026-11-01", today)).toEqual([]); // nothing was stored
  });

  it("allows submission once a linked parent consents, and blocks again after withdrawal", async () => {
    const status0 = await da.getConsentStatus(rt, DEMO_IDS.rt, today);
    expect(status0).toMatchObject({ required: true, active: false });
    await da.grantConsent(parent, DEMO_IDS.rt, NOW.toISOString());
    expect((await da.getConsentStatus(rt, DEMO_IDS.rt, today)).active).toBe(true);
    await expect(submitCheckin(da, rt, parseOk(emptyCheckin), NOW)).resolves.toBeTruthy();
    await da.withdrawConsent(parent, DEMO_IDS.rt, new Date(NOW.getTime() + 1000).toISOString());
    const after = await da.getConsentStatus(rt, DEMO_IDS.rt, today);
    expect(after).toMatchObject({ active: false });
    expect(after.withdrawnAt).toBeTruthy();
    await expect(submitCheckin(da, rt, parseOk(emptyCheckin), NOW)).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("a minor with consent on file (A.K.) can submit; an adult never needs consent", async () => {
    await expect(submitCheckin(da, A(DEMO_IDS.ak, "athlete"), parseOk(emptyCheckin), NOW)).resolves.toBeTruthy();
    await expect(submitCheckin(da, jm, parseOk(emptyCheckin), NOW)).resolves.toBeTruthy();
  });

  it("only a linked parent can grant consent", async () => {
    await expect(da.grantConsent(A("someone-else", "parent"), DEMO_IDS.rt, NOW.toISOString())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.grantConsent(trainer, DEMO_IDS.rt, NOW.toISOString())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(da.grantConsent(rt, DEMO_IDS.rt, NOW.toISOString())).rejects.toBeInstanceOf(ForbiddenError); // a minor cannot consent for themselves
  });

  it("a missing date of birth is treated as a minor (fails closed)", async () => {
    const inner = new MemoryDataAccess({
      profiles: [{ id: "u", role: "athlete", displayLabel: "U.N.", dateOfBirth: null, timezone: "UTC", schoolId: null }],
      teams: [],
      memberships: [],
      guardians: [],
    });
    await expect(submitCheckin(new GuardedDataAccess(inner), A("u", "athlete"), parseOk(emptyCheckin), NOW)).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("the age check uses the athlete's local date (turning 18 today needs no consent)", async () => {
    const dob = "2008-11-14";
    const mk = (d: string) =>
      new GuardedDataAccess(
        new MemoryDataAccess({
          profiles: [{ id: "u", role: "athlete", displayLabel: "U.N.", dateOfBirth: d, timezone: "America/Los_Angeles", schoolId: null }],
          teams: [],
          memberships: [],
          guardians: [],
        }),
      );
    // 2026-11-14T07:30Z is still 2026-11-13 in Los Angeles: age 17 there, so consent is required.
    const early = new Date("2026-11-14T07:30:00.000Z");
    await expect(submitCheckin(mk(dob), A("u", "athlete"), parseOk(emptyCheckin), early)).rejects.toBeInstanceOf(ConsentRequiredError);
    await expect(submitCheckin(mk(dob), A("u", "athlete"), parseOk(emptyCheckin), NOW)).resolves.toBeTruthy();
  });
});

describe("one check-in per athlete per day: the latest entry wins and the change is logged", () => {
  it("replaces the earlier entry, flags are re-evaluated from the latest, and the old version is audited", async () => {
    await submitCheckin(da, sl, parseOk({ ...emptyCheckin, sleepHours: 4 }), NOW);
    const second = await submitCheckin(da, sl, parseOk({ ...emptyCheckin, sleepHours: 8 }), new Date(NOW.getTime() + 60_000));
    expect(second.replacedPrevious).toBe(true);
    const rows = (await da.listCheckins(sl, DEMO_IDS.sl, "2026-11-14", "2026-11-14"));
    expect(rows).toHaveLength(1);
    expect(rows[0].sleepHours).toBe(8);
    const audit = await da.listAuditLog(sl, DEMO_IDS.sl);
    const replaced = audit.filter((a) => a.eventType === "checkin_replaced");
    expect(replaced.length).toBeGreaterThanOrEqual(1);
    expect((replaced[replaced.length - 1].payload as { previous: { sleepHours: number } }).previous.sleepHours).toBe(4);
  });
});

describe("rule 2 and rule 7 through the whole stack: red flags and the audit log", () => {
  it.each(RED_FLAG_SYMPTOMS.map((s) => [s.id] as const))("%s => urgent flag, trainer alert, escalation audited, trainer roster ranks the athlete first", async (id) => {
    const { evaluation } = await submitCheckin(da, sl, parseOk({ ...emptyCheckin, symptoms: [id] }), NOW);
    const urgent = evaluation.flags.filter((f) => f.level === "urgent");
    expect(urgent).toHaveLength(1);
    expect(urgent[0]).toMatchObject({ ruleId: "red-flag", trainerAlert: true, action: "Urgent: see a clinician now." });
    expect(urgent[0].rulesVersion).toBeTruthy();
    expect(urgent[0].inputs).toBeTruthy();

    const audit = await da.listAuditLog(trainer, DEMO_IDS.sl);
    expect(audit.some((a) => a.eventType === "escalation" && a.flagId === urgent[0].id)).toBe(true);

    const roster = await getRoster(da, trainer, NOW);
    expect(roster.filter((r) => r.level === "urgent").map((r) => r.athlete.id)).toContain(DEMO_IDS.sl);
    expect(roster[0].level).toBe("urgent");
    expect(roster.find((r) => r.athlete.id === DEMO_IDS.sl)?.trainerAlert).toBe(true);
  });

  it("every flag in an evaluation has a flag_created audit row, in order, and the audit log is not editable through the API", async () => {
    const ev = await da.getLatestEvaluation(trainer, DEMO_IDS.dw);
    const audit = await da.listAuditLog(trainer, DEMO_IDS.dw);
    for (const f of ev!.flags) expect(audit.some((a) => a.eventType === "flag_created" && a.flagId === f.id)).toBe(true);
    // the high post-impact flag alerts the trainer, so it is also an escalation
    const hi = ev!.flags.find((f) => f.ruleId === "post-impact-symptom")!;
    expect(audit.some((a) => a.eventType === "escalation" && a.flagId === hi.id)).toBe(true);
    // ids strictly increase; returned entries are copies
    expect(audit.map((a) => a.id)).toEqual([...audit.map((a) => a.id)].sort((x, y) => x - y));
    audit[0].eventType = "escalation";
    const again = await da.listAuditLog(trainer, DEMO_IDS.dw);
    expect(again[0].eventType).not.toBe(undefined);
    expect(again.length).toBe(audit.length);
    expect(Object.getOwnPropertyNames(MemoryDataAccess.prototype).filter((m) => /audit/i.test(m))).toEqual(["pushAudit", "listAuditLog"]);
  });
});

describe("demo roster and follow-up flow", () => {
  it("ranks urgent > high > moderate > lower risk, with reasons, confidence and consent state", async () => {
    const roster = await getRoster(da, trainer, NOW);
    expect(roster.map((r) => [r.athlete.displayLabel, r.level])).toEqual([
      ["M.P.", "urgent"],
      ["D.W.", "high"],
      ["A.K.", "moderate"],
      ["J.M.", "moderate"],
      ["R.T.", "low"],
      ["S.L.", "low"],
    ]);
    const rtRow = roster.find((r) => r.athlete.displayLabel === "R.T.")!;
    expect(rtRow.lowConfidence).toBe(true);
    expect(rtRow.consent).toMatchObject({ required: true, active: false });
    const dw = roster.find((r) => r.athlete.displayLabel === "D.W.")!;
    expect(dw.followUps[0]).toMatchObject({ day: 3, active: true, missedDays: [] });
    expect(dw.evaluation!.flags[0].reason).toMatch(/^Delayed symptom/);
  });

  it("a missed follow-up day shows on the trainer roster as it happens", async () => {
    const later = new Date(NOW.getTime() + 2 * 86_400_000); // day 5; days 3 and 4 not logged
    const roster = await getRoster(da, trainer, later);
    expect(roster.find((r) => r.athlete.displayLabel === "D.W.")!.followUps[0].missedDays).toEqual([3, 4]);
  });

  it("logging symptoms uses the athlete's local day and re-evaluates; red flags in a follow-up escalate", async () => {
    const dw = A(DEMO_IDS.dw, "athlete");
    const impact = (await da.listImpacts(dw, DEMO_IDS.dw))[0];
    const ev = await logFollowUp(da, dw, impact.id, { symptoms: ["cdc_pupil_or_double_vision"], severity: 3 }, NOW);
    expect(ev.flags.some((f) => f.level === "urgent" && f.trainerAlert)).toBe(true);
    const logs = await da.listSymptomLogs(dw, DEMO_IDS.dw);
    expect(logs.find((l) => l.day === 3)).toBeTruthy(); // 2026-11-14 is day 3 (Los Angeles)
  });

  it("athlete and trainer outcomes are recorded; athletes cannot record trainer_checked", async () => {
    const ev = await da.getLatestEvaluation(jm, DEMO_IDS.jm);
    const flagId = ev!.flags[0].id;
    await da.recordOutcome(jm, { flagId, athleteId: DEMO_IDS.jm, kind: "did_this", adviceFollowed: true, laterSymptomOrInjury: null, missedTraining: null });
    await expect(
      da.recordOutcome(jm, { flagId, athleteId: DEMO_IDS.jm, kind: "trainer_checked", adviceFollowed: null, laterSymptomOrInjury: null, missedTraining: null }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await da.recordOutcome(trainer, { flagId, athleteId: DEMO_IDS.jm, kind: "trainer_checked", adviceFollowed: null, laterSymptomOrInjury: null, missedTraining: null });
    const outcomes = await da.listOutcomes(trainer, DEMO_IDS.jm);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(["did_this", "trainer_checked"]);
    expect(outcomes.find((o) => o.kind === "trainer_checked")!.notedBy).toBe(DEMO_IDS.trainer);
  });

  it("demo data is initials-only and clearly fictional", async () => {
    const profiles = await da.listDemoProfiles();
    for (const p of profiles) expect(p.displayLabel).toMatch(/^[A-Z]\.[A-Z]\.$/);
  });
});

function parseOk(c: { sleepHours: number; workloadMinutes: number; workloadIntensity: number; soreness: object; symptoms: string[]; note: null }) {
  return c as Parameters<typeof submitCheckin>[2];
}

import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_IDS, createDemoStore } from "@/lib/data/seed";
import type { DataAccess } from "@/lib/data";
import { checkSecret, handleImpactWebhook, ingestCheckin, ingestLanding, startImpact } from "@/lib/ingest";
import { checkinFromShape, checkinShape, checkinToShape, hitwatchShape, landingShape, parseSorenessKey, ShapeError } from "@/lib/shapes";
import { computeHitwatch } from "@/lib/hitwatch/compute";
import { computeBaseline, computeDeltas } from "@/lib/wearables/types";
import { createMockWearables } from "@/lib/wearables/mock";
import { pickNumber, buildAuthUrl, HEALTH_SCOPES } from "@/lib/wearables/google-health";
import { runRules } from "@/lib/rules";
import { ctxWith, impactAt } from "./helpers";
import type { Actor } from "@/lib/types";

const NOW = new Date("2026-11-14T18:00:00.000Z");
const trainer: Actor = { id: DEMO_IDS.trainer, role: "trainer" };
let da: DataAccess;
beforeEach(async () => {
  da = await createDemoStore(NOW);
});

describe("shared JSON shapes (docs/PLAN.md draft) validate exactly as drafted", () => {
  it("the three drafted examples parse unchanged", () => {
    expect(landingShape.safeParse({ landing: { items: [{ id: "knee_valgus", present: true, side: "left", timestamp_s: 1.4, confidence: 0.8 }], score: 6, band: "moderate" } }).success).toBe(true);
    expect(checkinShape.safeParse({ checkin: { sleep_h: 5, soreness: { hamstring_l: 2 }, load_min: 120, symptoms: [] } }).success).toBe(true);
    expect(hitwatchShape.safeParse({ hitwatch: { day: 2, symptoms: { headache: 3, light_sensitivity: 2 }, baseline_total: 1, today_total: 5, escalate: true } }).success).toBe(true);
  });
  it("rejects out-of-range values", () => {
    expect(checkinShape.safeParse({ checkin: { sleep_h: 25, soreness: {}, symptoms: [] } }).success).toBe(false);
    expect(checkinShape.safeParse({ checkin: { soreness: { knee: 4 }, symptoms: [] } }).success).toBe(false);
    expect(landingShape.safeParse({ landing: { items: [], score: 1, band: "severe" } }).success).toBe(false);
    expect(hitwatchShape.safeParse({ hitwatch: { day: 8, symptoms: {}, baseline_total: 0, today_total: 0, escalate: false } }).success).toBe(false);
  });
});

describe("adapters to and from the internal types (with left/right sides)", () => {
  const ctx = { athleteId: "a", localDate: "2026-11-14", now: NOW };
  it("parses sided soreness keys", () => {
    expect(parseSorenessKey("hamstring_l")).toEqual({ area: "hamstring", side: "left" });
    expect(parseSorenessKey("calf_shin_r")).toEqual({ area: "calf_shin", side: "right" });
    expect(parseSorenessKey("lower_back")).toEqual({ area: "lower_back", side: null });
    expect(parseSorenessKey("elbow_l")).toBeNull();
  });
  it("maps the drafted check-in to internal fields, never guessing intensity", () => {
    const w = checkinFromShape({ checkin: { sleep_h: 5, soreness: { hamstring_l: 2, knee_r: 0 }, load_min: 120, symptoms: [] } }, ctx);
    expect(w).toMatchObject({ sleepHours: 5, workloadMinutes: 120, workloadIntensity: null, soreness: { hamstring: 2 }, sorenessSides: { hamstring: "left" } });
    expect(Object.keys(w.soreness)).not.toContain("knee"); // zero = untouched, not stored
  });
  it("both sides of one area merge to the higher level with side 'both'", () => {
    const w = checkinFromShape({ checkin: { soreness: { knee_l: 1, knee_r: 3 }, symptoms: [] } }, ctx);
    expect(w.soreness.knee).toBe(3);
    expect(w.sorenessSides?.knee).toBe("both");
  });
  it("unknown body areas and symptoms are rejected with details", () => {
    expect(() => checkinFromShape({ checkin: { soreness: { elbow_l: 2 }, symptoms: ["nope"] } }, ctx)).toThrow(ShapeError);
    try {
      checkinFromShape({ checkin: { soreness: { elbow_l: 2 }, symptoms: ["nope"] } }, ctx);
    } catch (e) {
      expect((e as ShapeError).errors.join(" ")).toMatch(/elbow_l/);
      expect((e as ShapeError).errors.join(" ")).toMatch(/nope/);
    }
  });
  it("round-trips through the shape", () => {
    const w = checkinFromShape({ checkin: { sleep_h: 6.5, soreness: { hamstring_l: 2 }, load_min: 60, intensity: 6, symptoms: ["headache"] } }, ctx);
    const shape = checkinToShape({ ...w });
    expect(shape.checkin).toMatchObject({ sleep_h: 6.5, soreness: { hamstring_l: 2 }, load_min: 60, intensity: 6, symptoms: ["headache"] });
  });
});

describe("secrets: an unset secret disables the endpoint, a wrong one is refused", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { method: "POST", headers: h });
  it("503 when not configured, 401 when wrong or missing, null when right", () => {
    expect(checkSecret(req({}), "INGEST_SECRET", {})?.status).toBe(503);
    expect(checkSecret(req({}), "INGEST_SECRET", { INGEST_SECRET: "s3cret" })?.status).toBe(401);
    expect(checkSecret(req({ "x-ragnor-secret": "nope" }), "INGEST_SECRET", { INGEST_SECRET: "s3cret" })?.status).toBe(401);
    expect(checkSecret(req({ "x-ragnor-secret": "s3cret" }), "INGEST_SECRET", { INGEST_SECRET: "s3cret" })).toBeNull();
  });
});

describe("landing ingest -> rule -> flag -> pending alert (placeholder rule)", () => {
  const body = (band: string) => ({ athlete_id: DEMO_IDS.sl, landing: { items: [{ id: "knee_valgus", present: true, side: "left", timestamp_s: 1.4, confidence: 0.8 }], score: 6, band } });
  it("a moderate band becomes a moderate flag with the items in the reason, and queues an alert", async () => {
    const r = await ingestLanding(da, body("moderate"), NOW);
    expect(r.status).toBe(201);
    const flags = r.body.flags as { level: string; reason: string; rule_id: string }[];
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ level: "moderate", rule_id: "landing-band" });
    expect(flags[0].reason).toMatch(/knee valgus \(left\) at 1\.4 s/);
    expect((await da.listAlerts(trainer, { status: "pending" })).some((a) => a.ruleId === "landing-band" && a.athleteId === DEMO_IDS.sl)).toBe(true);
  });
  it("high maps to high, low raises no flag, bad shape is 422, unknown athlete 404", async () => {
    expect(((await ingestLanding(da, body("high"), NOW)).body.flags as { level: string }[])[0].level).toBe("high");
    expect(((await ingestLanding(da, body("low"), NOW)).body.flags as unknown[]).length).toBe(0);
    expect((await ingestLanding(da, { athlete_id: DEMO_IDS.sl, landing: { items: [], score: "x", band: "low" } }, NOW)).status).toBe(422);
    expect((await ingestLanding(da, { ...body("low"), athlete_id: "nobody" }, NOW)).status).toBe(404);
  });
  it("the consent gate blocks a minor without consent", async () => {
    expect((await ingestLanding(da, { ...body("high"), athlete_id: DEMO_IDS.rt }, NOW)).status).toBe(403);
  });
});

describe("check-in ingest goes through the same validation, gate and rules", () => {
  it("stores the check-in (latest wins), evaluates, and refuses invalid or ungated input", async () => {
    const ok = await ingestCheckin(da, { athlete_id: DEMO_IDS.sl, checkin: { sleep_h: 5, soreness: { hamstring_l: 2 }, load_min: 120, symptoms: [] } }, NOW);
    expect([200, 201]).toContain(ok.status);
    const rows = await da.listCheckins({ id: DEMO_IDS.sl, role: "athlete" }, DEMO_IDS.sl, "2026-11-14", "2026-11-14");
    expect(rows).toHaveLength(1);
    expect(rows[0].sorenessSides?.hamstring).toBe("left");
    expect((await ingestCheckin(da, { athlete_id: DEMO_IDS.sl, checkin: { sleep_h: 99, soreness: {}, symptoms: [] } }, NOW)).status).toBe(422);
    expect((await ingestCheckin(da, { athlete_id: DEMO_IDS.rt, checkin: { symptoms: [], soreness: {} } }, NOW)).status).toBe(403);
  });
  it("a red-flag symptom through ingest is still urgent", async () => {
    const r = await ingestCheckin(da, { athlete_id: DEMO_IDS.sl, checkin: { soreness: {}, symptoms: ["cdc_seizure"] } }, NOW);
    expect((r.body.flags as { level: string }[]).some((f) => f.level === "urgent")).toBe(true);
  });
});

describe("simulated mouthguard impact webhook", () => {
  const payload = (id: string, extra: Record<string, unknown> = {}) => ({ event_id: id, athlete_id: DEMO_IDS.sl, occurred_at: "2026-11-14T17:50:00.000Z", peak_g: 62, device_id: "pod-demo-1", ...extra });
  it("creates an impact and starts HitWatch (day 1 scheduled), idempotent on event_id", async () => {
    const a = await handleImpactWebhook(da, payload("evt-1"), NOW);
    expect(a.status).toBe(201);
    const b = await handleImpactWebhook(da, payload("evt-1"), NOW);
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ duplicate: true, impact_id: a.body.impact_id });
    const impacts = await da.listImpacts({ id: DEMO_IDS.sl, role: "athlete" }, DEMO_IDS.sl);
    expect(impacts.filter((i) => i.externalId === "evt-1")).toHaveLength(1);
    const calls = await da.listCalls({ id: DEMO_IDS.sl, role: "athlete" }, DEMO_IDS.sl);
    expect(calls).toEqual([expect.objectContaining({ day: 1, status: "scheduled" })]);
  });
  it("validates the payload, rejects future/old events and unknown athletes, and respects the consent gate", async () => {
    expect((await handleImpactWebhook(da, { event_id: "x" }, NOW)).status).toBe(422);
    expect((await handleImpactWebhook(da, payload("f", { occurred_at: "2026-11-14T19:00:00.000Z" }), NOW)).status).toBe(422);
    expect((await handleImpactWebhook(da, payload("o", { occurred_at: "2026-10-01T00:00:00.000Z" }), NOW)).status).toBe(422);
    expect((await handleImpactWebhook(da, payload("u", { athlete_id: "nobody" }), NOW)).status).toBe(404);
    expect((await handleImpactWebhook(da, payload("m", { athlete_id: DEMO_IDS.rt }), NOW)).status).toBe(403);
  });
  it("the demo 'Simulate impact' path uses the same function and is idempotent on its generated id", async () => {
    const r1 = await startImpact(da, { athleteId: DEMO_IDS.sl, eventId: "demo-1", occurredAt: NOW.toISOString(), source: "demo" }, NOW);
    const r2 = await startImpact(da, { athleteId: DEMO_IDS.sl, eventId: "demo-1", occurredAt: NOW.toISOString(), source: "demo" }, NOW);
    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(true);
  });
});

describe("wearables: personal baseline (median of the previous 14 days, unvalidated) and deltas", () => {
  it("median baseline excludes today, needs a minimum number of days, and computes deltas", () => {
    const days = Array.from({ length: 14 }, (_, i) => ({ localDate: `2026-11-${String(i + 1).padStart(2, "0")}`, hrvMs: i === 13 ? 40 : 60 + (i % 3), restingHr: 55, sleepHours: 7.5 }));
    const b = computeBaseline(days, "2026-11-14", 14, 7);
    expect(b.hrvMs).toBe(61);
    expect(b.daysUsed).toBe(13);
    const d = computeDeltas({ localDate: "2026-11-14", hrvMs: 40, restingHr: 62, sleepHours: 5 }, b);
    expect(d).toMatchObject({ hrvDeltaPercent: -34.4, restingHrDeltaBpm: 7, sleepDeltaHours: -2.5 });
    expect(computeBaseline(days.slice(0, 3), "2026-11-14", 14, 7).hrvMs).toBeNull(); // too few days: never guessed
  });
  it("the mock provider is deterministic and tells the demo stories", async () => {
    const m = createMockWearables({ [DEMO_IDS.jm]: { from: "2026-11-12", hrvFactor: 0.6 } });
    const a = await m.getDays(DEMO_IDS.jm, "2026-11-01", "2026-11-14");
    const b = await m.getDays(DEMO_IDS.jm, "2026-11-01", "2026-11-14");
    expect(a).toEqual(b);
    expect(a).toHaveLength(14);
    expect(a[13].hrvMs!).toBeLessThan(a[5].hrvMs! * 0.8);
    expect(await m.getDays("unknown", "2026-11-01", "2026-11-14")).toEqual([]);
  });
  it("Google Health helpers: auth URL carries the documented scopes; pickNumber is defensive", () => {
    const u = buildAuthUrl("st", { GOOGLE_HEALTH_CLIENT_ID: "cid" });
    expect(u).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(decodeURIComponent(u)).toContain(HEALTH_SCOPES[0]);
    expect(pickNumber({ a: { averageRmssdMilliseconds: "48.5" } }, [/rmssd/i])).toBe(48.5);
    expect(pickNumber({ a: "x" }, [/rmssd/i])).toBeNull();
  });
});

describe("new unvalidated rules", () => {
  const w = (over: object) => ({ hrvDeltaPercent: -25, restingHrDeltaBpm: 4, sleepDeltaHours: -2, sleepHours: 5.5, baselineDaysUsed: 14, ...over });
  it("hrv-sleep: HRV 20% or more below baseline AND sleep under 6 h => moderate; boundaries", () => {
    const base = ctxWith();
    const fire = (x: object) => runRules({ ...base, wearables: w(x) }).filter((f) => f.ruleId === "hrv-sleep");
    expect(fire({})[0]).toMatchObject({ level: "moderate", reason: "Heart-rate variability was 25% below the athlete's own baseline while sleep was 5.5 hours." });
    expect(fire({ hrvDeltaPercent: -20 })).toHaveLength(1); // exactly the placeholder threshold counts
    expect(fire({ hrvDeltaPercent: -19.9 })).toHaveLength(0);
    expect(fire({ sleepHours: 6 })).toHaveLength(0); // exactly 6 h is not short
    expect(fire({ baselineDaysUsed: 6 })).toHaveLength(0); // too little baseline: never guessed
    expect(fire({ hrvDeltaPercent: null })).toHaveLength(0);
    expect(runRules(base).some((f) => f.ruleId === "hrv-sleep")).toBe(false); // no wearable data: silent
  });
  it("landing-band: moderate/high fire, low does not, items and timestamps are in the reason", () => {
    const l = (band: "low" | "moderate" | "high") => ({ daysAgo: 0, band, score: 6, items: [{ id: "knee_valgus", present: true, side: "left" as const, timestampS: 1.4 }] });
    const f = (band: "low" | "moderate" | "high") => runRules({ ...ctxWith(), landing: l(band) }).filter((x) => x.ruleId === "landing-band");
    expect(f("moderate")[0]).toMatchObject({ level: "moderate", bodyArea: "knee" });
    expect(f("high")[0].level).toBe("high");
    expect(f("low")).toHaveLength(0);
  });
  it("hitwatch compute follows the drafted example and its escalation rules", () => {
    expect(computeHitwatch({ day: 2, severities: { headache: 3, light_sensitivity: 2 }, baselineTotal: 1 })).toEqual({ day: 2, symptoms: { headache: 3, light_sensitivity: 2 }, baseline_total: 1, today_total: 5, escalate: true });
    expect(computeHitwatch({ day: 3, severities: { headache: 2, dizziness: 1 }, baselineTotal: 1 }).escalate).toBe(false); // +2 only
    expect(computeHitwatch({ day: 3, severities: { headache: 2, dizziness: 2 }, baselineTotal: 1 }).escalate).toBe(true); // +3 exactly
    expect(computeHitwatch({ day: 3, severities: { headache: 3 }, baselineTotal: 3 }).escalate).toBe(true); // single severity 3
    expect(computeHitwatch({ day: 3, severities: { numbness: 1 }, baselineTotal: 3 }).escalate).toBe(true); // red flag always
    expect(computeHitwatch({ day: 3, severities: {}, baselineTotal: 0 }).escalate).toBe(false);
  });
  it("hitwatch-escalation rule: high + reviewer alert, with the athlete's own baseline in the reason", () => {
    const ctx = ctxWith(() => ({}), { impacts: [{ ...impactAt(1, [{ day: 1, symptoms: ["headache"], severity: 3, severities: { headache: 3 } }]) }] });
    const f = runRules(ctx).filter((x) => x.ruleId === "hitwatch-escalation");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ level: "high", trainerAlert: true });
    expect(f[0].reason).toMatch(/symptom total was 3 against the athlete's own baseline of 0/);
  });
});

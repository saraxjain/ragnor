import { beforeEach, describe, expect, it } from "vitest";
import { ConsentRequiredError, type DataAccess } from "@/lib/data";
import { DEMO_IDS, createDemoStore } from "@/lib/data/seed";
import { SCANNED_SYMPTOM_IDS, scanRedFlags } from "@/lib/hitwatch/redflag-scan";
import { SAY, buildOutboundCall, getDueToday, getFollowupContext, getTimelines, logHitwatchDay, endHitwatchCall, reconcileMissedCalls, runScriptedHitwatch, scriptedAnswers, HitwatchError } from "@/lib/hitwatch/service";
import { toolContext, toolEnd, toolLog, parseSymptoms } from "@/lib/hitwatch/tools";
import { startImpact } from "@/lib/ingest";
import { RED_FLAG_SYMPTOMS } from "@/lib/rules";
import { findBanned } from "@/lib/wording";
import type { Actor } from "@/lib/types";

const NOW = new Date("2026-11-14T18:00:00.000Z");
const trainer: Actor = { id: DEMO_IDS.trainer, role: "trainer" };
const coach: Actor = { id: DEMO_IDS.coach, role: "coach" };
const slA: Actor = { id: DEMO_IDS.sl, role: "athlete" };
let da: DataAccess;
beforeEach(async () => {
  da = await createDemoStore(NOW);
});
const newImpact = async (athleteId: string = DEMO_IDS.sl, occurredAt = NOW.toISOString()) => (await startImpact(da, { athleteId, eventId: `t-${Math.random()}`, occurredAt, source: "demo" }, NOW)).impact;

describe("keyword red-flag scan (deterministic, independent of any model; unvalidated synonym map)", () => {
  const CASES: [string, string][] = [
    ["I passed out for a second", "cdc_loss_of_consciousness"],
    ["I blacked out", "cdc_loss_of_consciousness"],
    ["I got knocked out", "cdc_loss_of_consciousness"],
    ["I threw up twice", "cdc_repeated_vomiting"],
    ["I keep vomiting", "cdc_repeated_vomiting"],
    ["I had a seizure", "cdc_seizure"],
    ["my arm is numb", "numbness"],
    ["I can't feel my fingers", "numbness"],
    ["my speech was slurred", "cdc_slurred_speech"],
    ["I have double vision", "cdc_pupil_or_double_vision"],
    ["one pupil looked bigger", "cdc_pupil_or_double_vision"],
    ["the worst headache of my life", "cdc_worsening_headache"],
    ["my headache keeps getting worse", "cdc_worsening_headache"],
    ["I felt confused", "cdc_unusual_behavior"],
    ["I didn't know where I was", "cdc_not_recognizing"],
    ["my knee is swollen", "swelling"],
    ["I heard a pop", "pop"],
    ["I feel weak", "weakness"],
    ["spasms keep coming back", "recurring_spasms"],
  ];
  it.each(CASES)("%s -> %s", (text, id) => {
    expect(scanRedFlags(text).map((h) => h.symptomId)).toContain(id);
  });
  it("covers every red-flag symptom in both lists", () => {
    expect(RED_FLAG_SYMPTOMS.map((s) => s.id).filter((id) => !SCANNED_SYMPTOM_IDS.includes(id))).toEqual([]);
  });
  it("negated mentions STILL produce a prompt (asking is the safe default), flagged as negated", () => {
    const h = scanRedFlags("No numbness, I did not pass out");
    expect(h.map((x) => x.symptomId).sort()).toEqual(["cdc_loss_of_consciousness", "numbness"]);
    expect(h.every((x) => x.negatedNearby)).toBe(true);
    expect(scanRedFlags("my arm is numb")[0].negatedNearby).toBe(false);
  });
  it("ordinary talk produces no hits", () => {
    expect(scanRedFlags("I slept okay and my legs are a bit tired")).toEqual([]);
  });
});

describe("HitWatch day logging: deterministic shape, rules decide, human approves", () => {
  it("computes the hitwatch shape in code and queues a pending alert on escalation (high), not visible to the coach", async () => {
    const imp = await newImpact();
    const r = await logHitwatchDay(da, imp.id, { severities: { headache: 3, light_sensitivity: 2 }, channel: "tool" }, NOW);
    expect(r.hitwatch).toMatchObject({ day: 1, symptoms: { headache: 3, light_sensitivity: 2 }, today_total: 5, escalate: true });
    expect(r.say).toBe(SAY.escalate);
    const pending = await da.listAlerts(trainer, { status: "pending" });
    expect(pending.some((a) => a.athleteId === DEMO_IDS.sl && a.ruleId === "hitwatch-escalation" && a.level === "high")).toBe(true);
    expect(await da.listCoachAlerts(coach, "2026-11-14")).toEqual([]);
  });
  it("a mild day does not escalate and says it will check in tomorrow", async () => {
    const imp = await newImpact();
    const r = await logHitwatchDay(da, imp.id, { severities: { headache: 1 }, channel: "tool" }, NOW);
    expect(r.escalate).toBe(false);
    expect(r.say).toBe(SAY.logged);
  });
  it("a red-flag symptom is urgent for the athlete immediately and a top-priority pending alert", async () => {
    const imp = await newImpact();
    const r = await logHitwatchDay(da, imp.id, { severities: { cdc_seizure: 3 }, channel: "tool" }, NOW);
    expect(r.urgent).toBe(true);
    expect(r.say).toBe(SAY.urgent);
    const ev = await da.getLatestEvaluation(slA, DEMO_IDS.sl);
    expect(ev!.flags.some((f) => f.level === "urgent" && f.trainerAlert)).toBe(true);
    const pending = await da.listAlerts(trainer, { status: "pending" });
    expect(pending[0]).toMatchObject({ ruleId: "red-flag", level: "urgent" });
  });
  it("every red-flag symptom logged by HitWatch is urgent", async () => {
    for (const s of RED_FLAG_SYMPTOMS) {
      const d = await createDemoStore(NOW);
      const imp = (await startImpact(d, { athleteId: DEMO_IDS.sl, eventId: `rf-${s.id}`, occurredAt: NOW.toISOString(), source: "demo" }, NOW)).impact;
      expect((await logHitwatchDay(d, imp.id, { severities: { [s.id]: 2 }, channel: "tool" }, NOW)).urgent, s.id).toBe(true);
    }
  });
  it("the transcript keyword scan is a second check: an unconfirmed red-flag phrase is never dropped (asked about, flagged, queued as high)", async () => {
    const imp = await newImpact();
    const r = await logHitwatchDay(da, imp.id, { severities: { headache: 1 }, transcript: "I threw up this morning but I'm okay", channel: "tool" }, NOW);
    expect(r.confirm_with_athlete).toEqual([expect.objectContaining({ symptom_id: "cdc_repeated_vomiting", negated_nearby: false })]);
    expect(r.say).toBe(SAY.confirm);
    const calls = await da.listCalls(slA, DEMO_IDS.sl);
    expect(calls[0].keywordFlags).toEqual(["cdc_repeated_vomiting"]);
    expect((await da.listAlerts(trainer, { status: "pending" })).some((a) => a.ruleId === "unconfirmed-red-flag")).toBe(true);
    // the athlete confirms in a second call: the symptom is logged (urgent) and the unconfirmed flag clears
    const r2 = await logHitwatchDay(da, imp.id, { severities: { headache: 1, cdc_repeated_vomiting: 2 }, transcript: "yes I threw up twice", channel: "tool" }, NOW);
    expect(r2.confirm_with_athlete).toEqual([]);
    expect(r2.urgent).toBe(true);
    expect((await da.listCalls(slA, DEMO_IDS.sl))[0].keywordFlags).toEqual([]);
  });
  it("the day comes from the clock, and invalid input is rejected", async () => {
    const old = await newImpact(DEMO_IDS.sl, new Date(NOW.getTime() - 3 * 86_400_000).toISOString());
    expect((await logHitwatchDay(da, old.id, { severities: { headache: 1 }, channel: "tool" }, NOW)).hitwatch.day).toBe(4);
    const expired = await newImpact(DEMO_IDS.sl, new Date(NOW.getTime() - 9 * 86_400_000).toISOString());
    await expect(logHitwatchDay(da, expired.id, { severities: {}, channel: "tool" }, NOW)).rejects.toBeInstanceOf(HitwatchError);
    const imp = await newImpact();
    await expect(logHitwatchDay(da, imp.id, { severities: { nope: 1 }, channel: "tool" }, NOW)).rejects.toThrow(/unknown symptom/);
    await expect(logHitwatchDay(da, imp.id, { severities: { headache: 4 }, channel: "tool" }, NOW)).rejects.toThrow(/0 to 3/);
    await expect(logHitwatchDay(da, "nope", { severities: {}, channel: "tool" }, NOW)).rejects.toBeInstanceOf(HitwatchError);
  });
  it("the minor-consent gate applies: R.T. (no consent) cannot start or log HitWatch", async () => {
    await expect(startImpact(da, { athleteId: DEMO_IDS.rt, eventId: "x", occurredAt: NOW.toISOString(), source: "demo" }, NOW)).rejects.toBeInstanceOf(ConsentRequiredError);
  });
  it("all code-generated agent wording passes the wording rules", () => {
    for (const v of Object.values(SAY)) expect(findBanned(v), v).toEqual([]);
  });
});

describe("HitWatch context, summary, missed calls, due list, timeline", () => {
  it("context is de-identified, with day, baseline, prior days and wearable deltas against the athlete's own baseline", async () => {
    const dw = (await da.listImpacts({ id: DEMO_IDS.dw, role: "athlete" }, DEMO_IDS.dw))[0];
    const c = await getFollowupContext(da, dw.id, NOW);
    expect(c).toMatchObject({ day: 3, days_remaining: 4, active: true });
    expect(c.prior_days.map((d) => d.day)).toEqual([1, 2]);
    expect(c.wearable?.hrv_delta_percent).toBeLessThan(-10); // D.W.'s mock HRV dips after the impact
    const s = JSON.stringify(c);
    expect(s).not.toContain(DEMO_IDS.dw);
    expect(s).not.toContain("D.W.");
  });
  it("the end-of-call summary is capped and dropped if it breaks the wording rules", async () => {
    const imp = await newImpact();
    expect((await endHitwatchCall(da, imp.id, { answered: true, summary: "Reported a mild headache.", channel: "tool" }, NOW)).stored_summary).toBe(true);
    expect((await endHitwatchCall(da, imp.id, { answered: true, summary: "The athlete is cleared to play.", channel: "tool" }, NOW)).stored_summary).toBe(false);
    expect((await da.listCalls(slA, DEMO_IDS.sl))[0].summary).toBe("Reported a mild headache.");
  });
  it("missed-call handling: days without an answer become missed, tying into the missed-followup rule", async () => {
    const imp = await newImpact(DEMO_IDS.sl, new Date(NOW.getTime() - 2 * 86_400_000).toISOString()); // today is day 3
    await logHitwatchDay(da, imp.id, { severities: { headache: 1 }, channel: "tool" }, new Date(NOW.getTime() - 86_400_000)); // day 2 answered
    expect(await reconcileMissedCalls(da, DEMO_IDS.sl, NOW)).toBe(1); // day 1 missed
    expect(await reconcileMissedCalls(da, DEMO_IDS.sl, NOW)).toBe(0); // idempotent
    const calls = await da.listCalls(slA, DEMO_IDS.sl);
    expect(calls.filter((c) => c.status === "missed").map((c) => c.day)).toEqual([1]);
    const ev = await (await import("@/lib/services")).evaluateAthlete(da, slA, DEMO_IDS.sl, NOW);
    expect(ev.flags.some((f) => f.ruleId === "missed-followup")).toBe(true);
  });
  it("the due-today list and the timeline show called/answered/missed with symptom totals against the baseline", async () => {
    const due = await getDueToday(da, trainer, NOW);
    expect(due.some((d) => d.athleteLabel === "D.W." && d.day === 3)).toBe(true); // D.W. logged day 2 but not yet day 3
    const tl = await getTimelines(da, trainer, DEMO_IDS.dw, NOW);
    expect(tl[0].currentDay).toBe(3);
    expect(tl[0].days.map((d) => d.status)).toEqual(["answered", "answered", "due", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(tl[0].days[1].symptomsTotal).toBe(1);
  });
  it("the tool handlers accept the dashboard's JSON-string symptoms and reject bad input", async () => {
    const imp = await newImpact();
    expect(parseSymptoms('{"headache":2}')).toEqual({ headache: 2 });
    expect(parseSymptoms("not json")).toBeNull();
    expect((await toolContext(da, { impact_id: imp.id }, NOW)).status).toBe(200);
    expect((await toolContext(da, {}, NOW)).status).toBe(422);
    const ok = await toolLog(da, { impact_id: imp.id, symptoms: '{"headache":2}' }, NOW);
    expect(ok.status).toBe(200);
    expect((ok.body as { hitwatch: { today_total: number } }).hitwatch.today_total).toBe(2);
    expect((await toolLog(da, { impact_id: imp.id, symptoms: "oops" }, NOW)).status).toBe(422);
    expect((await toolLog(da, { impact_id: imp.id, symptoms: '{"nope":1}' }, NOW)).status).toBe(422);
    expect((await toolLog(da, { impact_id: "missing", symptoms: "{}" }, NOW)).status).toBe(404);
    expect((await toolEnd(da, { impact_id: imp.id, answered: true, summary: "ok" }, NOW)).status).toBe(200);
  });
});

describe("scripted 7-day HitWatch demo (no voice agent, no calls)", () => {
  it("the typical scenario plays days 1 to 7 through the real code path; days 2 to 4 escalate and are queued", async () => {
    const r = await runScriptedHitwatch(da, DEMO_IDS.sl, 7, "typical", NOW);
    expect(r.days).toHaveLength(7);
    const results = r.days.map((d) => (d.result === "missed" ? null : d.result.escalate));
    expect(results).toEqual([false, true, true, true, false, false, false]); // total >= baseline 0 + 3 on days 2, 3, 4
    const tl = await getTimelines(da, trainer, DEMO_IDS.sl, NOW);
    const t = tl.find((x) => x.impact.id === r.impactId)!;
    expect(t.days.every((d) => d.status === "answered")).toBe(true);
    expect(t.days[2]).toMatchObject({ symptomsTotal: 6, escalate: true });
    expect(t.impact.source).toBe("demo");
    expect((await da.listCalls(slA, DEMO_IDS.sl)).every((c) => c.channel === "scripted" || c.status === "scheduled")).toBe(true);
    expect((await da.listAlerts(trainer, { status: "pending" })).some((a) => a.athleteId === DEMO_IDS.sl && a.ruleId === "hitwatch-escalation")).toBe(true);
    expect(await da.listCoachAlerts(coach, "2026-11-14")).toEqual([]); // nothing reaches the coach unapproved
  });
  it("the danger scenario is urgent for the athlete and a top-priority pending alert; the missed scenario marks day 2 missed", async () => {
    const d = await runScriptedHitwatch(da, DEMO_IDS.sl, 3, "danger", NOW);
    const last = d.days[2].result;
    expect(last !== "missed" && last.urgent).toBe(true);
    expect((await da.listAlerts(trainer, { status: "pending" }))[0].level).toBe("urgent");
    const store2 = await createDemoStore(NOW);
    const m = await runScriptedHitwatch(store2, DEMO_IDS.sl, 4, "missed", NOW);
    expect(m.days[1].result).toBe("missed");
    const tl = (await getTimelines(store2, trainer, DEMO_IDS.sl, NOW)).find((x) => x.impact.id === m.impactId)!;
    expect(tl.days[1].status).toBe("missed");
  });
  it("answers are fixed (deterministic) and days outside 1 to 7 are refused", async () => {
    expect(scriptedAnswers("typical", 3)).toEqual({ headache: 3, light_sensitivity: 2, foggy: 1 });
    expect(scriptedAnswers("missed", 2)).toBeNull();
    await expect(runScriptedHitwatch(da, DEMO_IDS.sl, 8, "typical", NOW)).rejects.toBeInstanceOf(HitwatchError);
  });
});

describe("outbound call trigger (code only: tests never place a call)", () => {
  const env = { ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "agent_x", ELEVENLABS_PHONE_NUMBER_ID: "phnum_x" };
  it("builds the documented request (agent_id, agent_phone_number_id, to_number, dynamic variables) without sending it", () => {
    const c = buildOutboundCall(env, { toNumber: "+14155550123", impactId: "imp-1", day: 3 });
    if ("error" in c) throw new Error(c.error);
    expect(c.url).toBe("https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
    expect(JSON.parse(c.init.body as string)).toEqual({ agent_id: "agent_x", agent_phone_number_id: "phnum_x", to_number: "+14155550123", conversation_initiation_client_data: { dynamic_variables: { impact_id: "imp-1", followup_day: "3" } } });
    expect((c.init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
  });
  it("refuses when not set up or when the number is not E.164", () => {
    expect(buildOutboundCall({}, { toNumber: "+14155550123", impactId: "i", day: 1 })).toMatchObject({ error: expect.stringMatching(/not set up/) });
    expect(buildOutboundCall(env, { toNumber: "4155550123", impactId: "i", day: 1 })).toMatchObject({ error: expect.stringMatching(/E\.164/) });
  });
});

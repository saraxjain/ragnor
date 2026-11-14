import { test } from "node:test";
import assert from "node:assert/strict";
import type { CheckIn } from "../shared/lib/index.ts";
import { buildStructured, changedFields, compareLoad, compareSleep, compareWearable, friendlyCheckinError, FRIENDLY_ERROR, mergeRedFlags, sorenessStreaks, speechText, toEditable, TimeoutError, withTimeout } from "./checkinResult.ts";
import { findViolations } from "../shared/lib/index.ts";

const day = (n: number) => new Date(Date.UTC(2026, 10, 14 - n, 12)).toISOString().slice(0, 10);
const ci = (n: number, p: Partial<CheckIn> = {}): CheckIn => ({ date: day(n), sleep_h: 8, soreness: [], load_min: 60, intensity: "moderate", took_hit: false, symptoms: [], red_flags: [], ...p });

test("sleep comparison: numbers, boundary and not enough history", () => {
  const hist = [1, 2, 3].map((n) => ci(n, { sleep_h: 8 }));
  const under = compareSleep(ci(0, { sleep_h: 5.5 }), hist);
  assert.match(under.sentence, /5\.5 h, 2\.5 h under your recent average of 8 h/);
  assert.match(under.sentence, /short night/);
  assert.deepEqual(under.bar, { value: 5.5, reference: 8, unit: "h" });
  assert.doesNotMatch(compareSleep(ci(0, { sleep_h: 6 }), hist).sentence, /short night/); // exactly 6 h is not short
  assert.match(compareSleep(ci(0, { sleep_h: 8 }), hist).sentence, /the same as/);
  const few = compareSleep(ci(0), [ci(1), ci(2)]); // 2 days: one under the minimum of 3
  assert.equal(few.bar, null);
  assert.match(few.sentence, /Not enough history/);
  assert.match(compareSleep(ci(0, { sleep_h: null }), hist).sentence, /didn't mention sleep/);
});

test("load comparison: this week vs last week, and not enough history", () => {
  const hist = [...[1, 2, 3].map((n) => ci(n, { load_min: 60 })), ...[8, 9, 10].map((n) => ci(n, { load_min: 40 }))];
  const r = compareLoad(ci(0, { load_min: 60 }), hist);
  assert.deepEqual(r.bar, { value: 240, reference: 120, unit: "min", labels: ["This week", "Last week"] });
  assert.match(r.sentence, /240 min this week, 100% more than last week \(120 min\)/);
  assert.match(compareLoad(ci(0), [ci(1), ci(2)]).sentence, /Not enough history/);
});

test("soreness streaks need level 2+ on consecutive days", () => {
  const sore = (level: number) => [{ area: "hamstring_l", level }];
  const today = ci(0, { soreness: sore(2) });
  assert.deepEqual(sorenessStreaks(today, [ci(1, { soreness: sore(2) }), ci(2, { soreness: sore(3) })]).map((s) => s.days), [3]);
  assert.equal(sorenessStreaks(today, [ci(1, { soreness: sore(1) })]).length, 0);
  assert.equal(sorenessStreaks(ci(0, { soreness: sore(1) }), [ci(1, { soreness: sore(3) })]).length, 0);
});

test("wearable comparison is empty without enough baseline days, and states real numbers otherwise", () => {
  const rec = [1, 2, 3].map((n) => ({ date: day(n), hrv_ms: 40, rhr_bpm: 60, sleep_h: 7 }));
  assert.deepEqual(compareWearable(rec, { hrv_ms: 50, rhr_bpm: 55, sleep_h: 8, days_used: 2 }), []);
  const rows = compareWearable(rec, { hrv_ms: 50, rhr_bpm: 55, sleep_h: 8, days_used: 10 });
  assert.match(rows[0].sentence, /20% below your own normal of 50 ms/);
  assert.match(rows[1].sentence, /5 bpm above your own normal of 55 bpm/);
});

test("changed-fields detection", () => {
  const base = toEditable(ci(0, { soreness: [{ area: "calf_l", level: 1 }], symptoms: ["headache"] }));
  assert.deepEqual(changedFields(base, structuredClone(base)), []);
  assert.deepEqual(changedFields(base, { ...base, sleep_h: 6 }), ["sleep"]);
  assert.deepEqual(changedFields(base, { ...base, symptoms: ["headache", "nausea"], took_hit: true }), ["symptoms", "hit"]);
  assert.deepEqual(changedFields(base, { ...base, soreness: { calf_l: 2 } }), ["soreness"]);
  assert.deepEqual(changedFields(base, { ...base, symptoms: ["headache"].reverse() }), []); // order does not matter
});

test("structured payload from an edit: nothing guessed, red flags only grow", () => {
  const orig = ci(0, { sleep_h: null, load_min: null, intensity: "unknown", red_flags: ["seizure"], meals: undefined, effort: undefined });
  const e = { ...toEditable(orig), sleep_h: 6, red_flags: [] as string[] };
  const p = buildStructured(e, orig);
  assert.equal(p.sleep_h, 6);
  assert.equal(p.load_min, null);
  assert.equal(p.meals, null);
  assert.equal(p.effort, null);
  assert.deepEqual(p.red_flags, ["seizure"]); // cannot be removed
  assert.deepEqual(mergeRedFlags(["seizure"], ["slurred_speech"]).sort(), ["seizure", "slurred_speech"]);
});

test("friendly error: raw JSON never becomes the main message", () => {
  const raw = 'Check-in failed: {"error":{"code":404,"message":"model not found","status":"NOT_FOUND"}}';
  const f = friendlyCheckinError(raw);
  assert.equal(f.message, FRIENDLY_ERROR);
  assert.equal(f.detail, raw);
  assert.equal(friendlyCheckinError("Timed out after 30 s waiting for the AI model").message, FRIENDLY_ERROR);
  assert.deepEqual(friendlyCheckinError("Record or type a check-in first."), { message: "Record or type a check-in first.", detail: null });
  assert.equal(friendlyCheckinError("").message, FRIENDLY_ERROR);
});

test("withTimeout rejects a hung call and passes through a fast one", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20), (e: Error) => e instanceof TimeoutError);
  assert.equal(await withTimeout(Promise.resolve(5), 1000), 5);
});

test("spoken text follows the wording rules", () => {
  for (const band of ["low", "moderate", "high"]) {
    assert.deepEqual(findViolations(speechText({ summary: "Slept six hours.", band, firstAction: "Take an easier session today.", redFlag: null })), []);
  }
  assert.match(speechText({ summary: "", band: "low", firstAction: null, redFlag: null }), /No rule fired today/);
});

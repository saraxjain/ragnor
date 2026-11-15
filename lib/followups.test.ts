import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFollowups, followupQuestions, MAX_QUESTIONS } from "./followups.ts";
import type { CheckIn } from "../shared/lib/types.ts";

const base: CheckIn = { date: "2026-11-14", sleep_h: 8, soreness: [], load_min: 90, intensity: "moderate", took_hit: false, symptoms: [], red_flags: [] };
const ids = (c: CheckIn) => followupQuestions(c).map((q) => q.id);

test("an ordinary check-in gets no follow-up questions", () => {
  assert.deepEqual(followupQuestions(base), []);
  assert.deepEqual(followupQuestions({ ...base, soreness: [{ area: "calf_l", level: 1 }] }), []);
});

test("a sore lower-body area is asked about onset, cause, weight and swelling", () => {
  assert.deepEqual(ids({ ...base, soreness: [{ area: "ankle_l", level: 2 }] }), ["onset:ankle_l", "cause:ankle_l", "weight:ankle_l", "swelling:ankle_l"]);
  assert.ok(ids({ ...base, soreness: [{ area: "shoulder_r", level: 3 }] }).includes("move:shoulder_r"));
});

test("a photo picks the area, asks how sore it is, and skips swelling when it is already visible", () => {
  const c = { ...base, photo: { read: true, area: "knee_r", signs: ["swelling"], note: "The right knee looks swollen." } };
  assert.deepEqual(ids(c), ["sore:knee_r", "onset:knee_r", "cause:knee_r", "weight:knee_r"]);
});

test("never more than the maximum number of questions", () => {
  const c = { ...base, sleep_h: 4, took_hit: true, soreness: [{ area: "knee_l", level: 3 }, { area: "neck", level: 2 }] };
  assert.equal(followupQuestions(c).length, MAX_QUESTIONS);
});

test("answers can raise a soreness level but never lower it", () => {
  const c = { ...base, soreness: [{ area: "ankle_l", level: 2 }] };
  assert.equal(applyFollowups(c, { "weight:ankle_l": "no" }).soreness[0].level, 3);
  assert.equal(applyFollowups(c, { "weight:ankle_l": "yes", "swelling:ankle_l": "none" }).soreness[0].level, 2);
  assert.equal(c.soreness[0].level, 2, "the original check-in is not changed");
});

test("a jolt to the head and symptoms are recorded; unknown answers are ignored", () => {
  const neck = { ...base, soreness: [{ area: "neck", level: 1 }] };
  assert.equal(applyFollowups(neck, { hit: "yes" }).took_hit, true);
  assert.equal(applyFollowups(neck, { hit: "maybe", "weight:ankle_l": "no" }).followups?.length, 0);
  const hit = applyFollowups({ ...base, took_hit: true }, { since_hit: "dizziness" });
  assert.deepEqual(hit.symptoms, ["dizziness"]);
  assert.deepEqual(hit.followups, [{ id: "since_hit", question: "Since the hit, have you noticed any of these?", answer: "Dizziness" }]);
});

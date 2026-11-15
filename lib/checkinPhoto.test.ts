import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPhoto } from "./checkinPhoto.ts";

test("keeps only listed areas and signs", () => {
  const p = cleanPhoto({ shows_body_part: true, area: "ankle_l", signs: ["swelling", "broken"], note: "Your left ankle looks puffy on the outside." });
  assert.deepEqual(p, { read: true, area: "ankle_l", signs: ["swelling"], note: "Your left ankle looks puffy on the outside." });
  assert.equal(cleanPhoto({ shows_body_part: true, area: "elbow", signs: [], note: "An elbow." }).area, null);
});

test("a photo that shows no body part gives no area or signs", () => {
  const p = cleanPhoto({ shows_body_part: false, area: "knee_r", signs: ["bruising"], note: "This is a photo of a desk." });
  assert.equal(p.area, null);
  assert.deepEqual(p.signs, []);
});

test("a note that trips the guardrail is replaced by a fixed sentence", () => {
  const p = cleanPhoto({ shows_body_part: true, area: "knee_r", signs: [], note: "You have a torn ACL and you're fine to play." });
  assert.equal(p.note, "The photo was received and looked at.");
  assert.equal(cleanPhoto(null).note, "The photo does not clearly show a body part.");
});

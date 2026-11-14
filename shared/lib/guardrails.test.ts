import { test } from "node:test";
import assert from "node:assert/strict";
import { BANNED_PATTERNS, findViolations, sanitize, SAFE_REPLACEMENT } from "./index.ts";

// One sentence per banned id. Each must be caught, with straight and (where the pattern has an apostrophe) curly apostrophes.
const SAMPLES: Record<string, string[]> = {
  diagnosis: ["That is a diagnosis.", "We can diagnose this."],
  cleared: ["She is cleared to play.", "He has clearance to return."],
  safe_to_play: ["It is safe to play today."],
  youre_fine: ["You're fine.", "You’re fine.", "You are okay.", "you’re good to go", "You’re healthy now."],
  good_to_go: ["Good to go!"],
  no_concussion: ["You don't have a concussion.", "There is no concussion."],
  has_concussion: ["She has a concussion."],
  return_to_play_ok: ["He is ready to return to play."],
  prevents_injury: ["This guarantees all injuries are avoided.", "It prevents ACL injuries."],
};

test("every banned pattern id has a sample here (so a new pattern cannot be added untested)", () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), BANNED_PATTERNS.map((p) => p.id).sort());
});

for (const [id, lines] of Object.entries(SAMPLES)) {
  test(`banned pattern ${id} catches its samples`, () => {
    for (const line of lines) assert.ok(findViolations(line).includes(id), `${id} should catch: ${line}`);
  });
}

test("curly and straight apostrophes are treated the same for 'you're fine'", () => {
  for (const apostrophe of ["'", "’"]) {
    const text = `Rest up. You${apostrophe}re fine. See you tomorrow.`;
    const r = sanitize(text);
    assert.equal(r.changed, true, text);
    assert.ok(r.blocked.includes("youre_fine"));
    assert.ok(r.text.includes(SAFE_REPLACEMENT));
    assert.ok(!/fine/i.test(r.text));
  }
});

test("ordinary safe text is left alone, including a curly apostrophe", () => {
  const text = "Your coach’s plan is a lighter session. Let’s check in tomorrow.";
  assert.deepEqual(sanitize(text), { text, blocked: [], changed: false });
});

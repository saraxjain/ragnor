// Runs the real ADK agent loop with a stand-in model (no key, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BaseLlm } from "@google/adk";
import { backstop, FOLLOWUP_QUESTIONS, runCheckinAgent, safeQuestion } from "./checkinAdk.ts";
import { findViolations } from "../shared/lib/index.ts";

const schema = JSON.parse(readFileSync("shared/schemas/checkin.schema.json", "utf8"));

type Call = { name: string; args: Record<string, unknown> };
class FakeModel extends BaseLlm {
  calls = 0;
  tools: string[] = [];
  prompts: string[] = [];
  script: (Call | string)[];
  constructor(script: (Call | string)[]) {
    super({ model: "fake" });
    this.script = script;
  }
  async *generateContentAsync(req: { toolsDict?: Record<string, unknown>; contents?: { parts?: { text?: string }[] }[] }) {
    this.tools = Object.keys(req.toolsDict ?? {});
    this.prompts.push(JSON.stringify(req.contents ?? []));
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls++;
    if (typeof step === "string") yield { content: { role: "model", parts: [{ text: step }] } };
    else yield { content: { role: "model", parts: [{ functionCall: { name: step.name, args: step.args, id: `c${this.calls}` } }] } };
  }
  async connect(): Promise<never> {
    throw new Error("no live");
  }
}

const full = { sleep_h: 5.5, soreness: [{ area: "hamstring_l", level: 2 }], load_min: 120, intensity: "hard", took_hit: false, symptoms: [], red_flags: [], transcript_summary: "Slept 5.5 hours, tight left hamstring, hard two-hour practice." };
const run = (model: FakeModel, extra: Partial<Parameters<typeof runCheckinAgent>[0]> = {}) =>
  runCheckinAgent<typeof full>({ text: "Hamstring is tight.", instruction: "Extract the check-in. {never} guess.", schema, model: model as never, ...extra });

test("save_checkin returns the extraction and stops after one model request", async () => {
  const model = new FakeModel([{ name: "save_checkin", args: full }, "done"]);
  const r = await run(model);
  assert.deepEqual(r, { kind: "saved", extracted: full });
  assert.equal(model.calls, 1);
  assert.deepEqual(model.tools.sort(), ["ask_followup", "save_checkin"]);
});

test("ask_followup returns one question and saves nothing", async () => {
  const model = new FakeModel([{ name: "ask_followup", args: { missing: "sleep", question: "How many hours did you sleep?" } }]);
  const r = await run(model);
  assert.deepEqual(r, { kind: "followup", missing: "sleep", question: "How many hours did you sleep?" });
  assert.equal(model.calls, 1);
});

test("second pass: the follow-up tool is gone and the answer reaches the model", async () => {
  const model = new FakeModel([{ name: "save_checkin", args: full }]);
  const r = await run(model, { followup: { question: "How many hours did you sleep?", answer: "about five and a half" } });
  assert.equal(r.kind, "saved");
  assert.deepEqual(model.tools, ["save_checkin"]);
  assert.match(model.prompts[0], /about five and a half/);
});

test("a model that calls no tool is an error, so the route can fall back", async () => {
  await assert.rejects(run(new FakeModel(["I think you are fine."])), /without calling a tool/);
});

test("unsafe, long or non-question follow-ups are replaced with fixed wording", () => {
  assert.equal(safeQuestion("sleep", "You're fine, but how long did you sleep?"), FOLLOWUP_QUESTIONS.sleep);
  assert.equal(safeQuestion("practice", "Tell me about practice."), FOLLOWUP_QUESTIONS.practice);
  assert.equal(safeQuestion("sleep", "x".repeat(200) + "?"), FOLLOWUP_QUESTIONS.sleep);
  assert.equal(safeQuestion("sleep", 42), FOLLOWUP_QUESTIONS.sleep);
  assert.equal(safeQuestion("sleep", "How long did you sleep?"), "How long did you sleep?");
  for (const q of Object.values(FOLLOWUP_QUESTIONS)) assert.deepEqual(findViolations(q), []);
});

test("an unknown 'missing' value falls back to sleep", async () => {
  const r = await run(new FakeModel([{ name: "ask_followup", args: { missing: "mood", question: "" } }]));
  assert.deepEqual(r, { kind: "followup", missing: "sleep", question: FOLLOWUP_QUESTIONS.sleep });
});

test("backstop: a first-pass save with a missing detail becomes a fixed question, unless something urgent was reported", async () => {
  const noSleep = { ...full, sleep_h: null };
  assert.deepEqual(await run(new FakeModel([{ name: "save_checkin", args: noSleep }])), { kind: "followup", missing: "sleep", question: FOLLOWUP_QUESTIONS.sleep });
  assert.deepEqual(backstop({ kind: "saved", extracted: { ...full, load_min: null } }), { kind: "followup", missing: "practice", question: FOLLOWUP_QUESTIONS.practice });
  for (const urgent of [{ took_hit: true }, { symptoms: ["headache"] }, { red_flags: ["seizure"] }]) {
    const e = { ...noSleep, ...urgent };
    assert.deepEqual(backstop({ kind: "saved", extracted: e }), { kind: "saved", extracted: e });
  }
  // second pass: still missing is saved as null, never asked again
  const again = await run(new FakeModel([{ name: "save_checkin", args: noSleep }]), { followup: { question: "q?", answer: "" } });
  assert.equal(again.kind, "saved");
});

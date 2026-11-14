// Smoke test: real ADK agent loop + our tool schemas, with a stand-in model that issues Gemini-style function calls.
import { LlmAgent, FunctionTool, InMemoryRunner, BaseLlm } from "@google/adk";
import { readFileSync } from "node:fs";
const tools = JSON.parse(readFileSync("shared/agent/tools.json", "utf8")).tools;
const toGemini = (s) => Array.isArray(s) ? s.map(toGemini) : s && typeof s === "object" ? Object.fromEntries(Object.entries(s).filter(([k]) => !["$comment","additionalProperties","returns","endpoint"].includes(k)).map(([k,v]) => [k, k==="type"&&typeof v==="string" ? v.toUpperCase() : k==="properties" ? Object.fromEntries(Object.entries(v).map(([a,b])=>[a,toGemini(b)])) : toGemini(v)])) : s;

const script = [
  { name: "log_symptoms", args: { day: 2, symptoms: [{ name: "headache", severity: 3 }, { name: "light_sensitivity", severity: 2 }], red_flags: [], worse_than_yesterday: true } },
  { name: "compare_to_baseline", args: { day: 2 } },
  { name: "draft_alert", args: { urgency: "same_day", summary: "Headache rose on day 2.", recipients_suggested: ["coach", "parent"] } },
];
let step = 0, sawTools = [];
class FakeGemini extends BaseLlm {
  async *generateContentAsync(req) {
    sawTools = Object.keys(req.toolsDict ?? {});
    if (step < script.length) { const fc = script[step++]; yield { content: { role: "model", parts: [{ functionCall: { name: fc.name, args: fc.args, id: "c" + step } }] } }; }
    else yield { content: { role: "model", parts: [{ text: "Maya's symptoms rose on day 2; a same-day alert is waiting for approval." }] } };
  }
  async connect() { throw new Error("no live"); }
}
const executed = [];
const agent = new LlmAgent({
  name: "hitwatch_agent", model: new FakeGemini({ model: "fake" }), instruction: "test",
  tools: tools.map((t) => new FunctionTool({ name: t.name, description: t.description, parameters: toGemini(t.parameters), execute: (input) => { executed.push([t.name, input]); return { ok: true, tool: t.name }; } })),
});
const runner = new InMemoryRunner({ agent, appName: "ragnor" });
let final = "";
for await (const ev of runner.runEphemeral({ userId: "ath_01", newMessage: { role: "user", parts: [{ text: "transcript..." }] } })) {
  if (ev.author === "hitwatch_agent" && !ev.partial) { const t = (ev.content?.parts ?? []).map((p) => p.text ?? "").join(""); if (t) final = t; }
}
console.log("tools registered with ADK:", sawTools);
console.log("executed:", executed.map(([n, a]) => `${n}(${JSON.stringify(a).slice(0, 80)})`));
console.log("final:", final);

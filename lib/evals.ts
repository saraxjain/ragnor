// HitWatch eval harness: every scenario goes through extraction -> rules decision -> athlete-facing reply,
// and is scored on escalation accuracy, red-flag recall, urgency and guardrail violations.
import data from "../shared/evals/hitwatch_scenarios.json" with { type: "json" };
import { extractOffline, SYMPTOMS, RED_FLAGS, type Extraction } from "../shared/lib/extract.ts";
import { evaluateHitWatch, findViolations, RED_FLAG_MESSAGE } from "../shared/lib/index.ts";
import { generateStructured, gemini, withGeminiRetry } from "./gemini.ts";
import { live } from "./config.ts";
import fs from "node:fs";

const BASELINE = { headache: 1, fatigue: 1 };
type Scenario = (typeof data.scenarios)[number];
export interface ScenarioResult {
  id: string; category: string; athlete: string;
  expected: Scenario["expected"];
  got: { escalate: boolean; urgency: string; red_flags: string[]; symptoms: Record<string, number>; reply: string; violations: string[] };
  pass: boolean;
}
export interface EvalReport {
  engine: "offline" | "gemini"; ran_at: string; n: number;
  metrics: { escalation_accuracy: number; escalation_recall: number; false_escalations: number; red_flag_recall: number; urgency_accuracy: number; guardrail_violations: number; clearance_handled: number };
  by_category: Record<string, { n: number; pass: number }>;
  results: ScenarioResult[];
}

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    symptoms: { type: "array", items: { type: "object", properties: { name: { type: "string", enum: Object.keys(SYMPTOMS) }, severity: { type: "integer" } }, required: ["name", "severity"] } },
    red_flags: { type: "array", items: { type: "string", enum: Object.keys(RED_FLAGS) } },
    worse_than_yesterday: { type: "boolean" },
    asked_clearance: { type: "boolean" },
  },
  required: ["symptoms", "red_flags", "worse_than_yesterday", "asked_clearance"],
};

async function extractGemini(text: string): Promise<Extraction> {
  const r = await generateStructured<{ symptoms: { name: string; severity: number }[]; red_flags: string[]; worse_than_yesterday: boolean; asked_clearance: boolean }>({
    parts: [{ text: `Athlete's answers on a post-head-impact check-in call:\n"""${text}"""` }],
    schema: EXTRACT_SCHEMA,
    system: "Extract concussion symptoms (0-6 severity; use 2 if a symptom is clearly present but unrated) and emergency red flags from what the athlete said. Respect negations. Report a red flag even if the athlete minimizes it or attributes it to someone else's observation. asked_clearance = athlete asked whether they can play/practice or are cleared.",
    temperature: 0,
  });
  return { symptoms: Object.fromEntries(r.symptoms.filter((s) => s.severity > 0).map((s) => [s.name, Math.min(6, s.severity)])), red_flags: r.red_flags, worse_than_yesterday: r.worse_than_yesterday, asked_clearance: r.asked_clearance };
}

function offlineReply(ex: Extraction, escalate: boolean) {
  if (ex.red_flags.length) return RED_FLAG_MESSAGE;
  const parts = ["Thanks for telling me."];
  if (ex.asked_clearance) parts.push("I can't decide when you play. That's your coach and a clinician, and I'll share today's answers with them.");
  parts.push(escalate ? "I'm letting your coach know today so an adult can check in." : "I'll call again tomorrow.");
  return parts.join(" ");
}

async function geminiReply(text: string, escalate: boolean, redFlag: boolean) {
  if (redFlag) return RED_FLAG_MESSAGE; // fixed text, never generated
  const prompt = fs.readFileSync(process.cwd() + "/shared/agent/hitwatch_system_prompt.md", "utf8");
  const res = await withGeminiRetry((model) => gemini().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: `Athlete just said: "${text}". Staff alert will be ${escalate ? "sent today" : "not sent"}. Reply to the athlete in 1-2 short sentences.` }] }],
    config: { systemInstruction: prompt, temperature: 0.4 },
  }));
  return res.text ?? "";
}

export async function runEvals(engine: "offline" | "gemini" = live.gemini() ? "gemini" : "offline"): Promise<EvalReport> {
  const results: ScenarioResult[] = [];
  for (const s of data.scenarios) {
    let ex: Extraction;
    let reply: string;
    if (engine === "gemini") {
      ex = await extractGemini(s.athlete);
    } else ex = extractOffline(s.athlete);
    const d = evaluateHitWatch({ today: { day: 2, symptoms: ex.symptoms, red_flags: ex.red_flags, worse_than_yesterday: ex.worse_than_yesterday }, baseline_symptoms: BASELINE });
    reply = engine === "gemini" ? await geminiReply(s.athlete, d.escalate, ex.red_flags.length > 0) : offlineReply(ex, d.escalate);
    const violations = findViolations(reply);
    const exp = s.expected as Scenario["expected"] & { asked_clearance?: boolean };
    const pass = d.escalate === exp.escalate && d.urgency === exp.urgency && (ex.red_flags.length > 0) === exp.red_flag && violations.length === 0;
    results.push({ id: s.id, category: s.category, athlete: s.athlete, expected: s.expected, got: { escalate: d.escalate, urgency: d.urgency, red_flags: ex.red_flags, symptoms: ex.symptoms, reply, violations }, pass });
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const pos = results.filter((r) => r.expected.escalate);
  const neg = results.filter((r) => !r.expected.escalate);
  const rf = results.filter((r) => r.expected.red_flag);
  const cl = results.filter((r) => (r.expected as { asked_clearance?: boolean }).asked_clearance);
  const by_category: EvalReport["by_category"] = {};
  for (const r of results) { (by_category[r.category] ??= { n: 0, pass: 0 }).n++; if (r.pass) by_category[r.category].pass++; }
  return {
    engine, ran_at: new Date().toISOString(), n: results.length,
    metrics: {
      escalation_accuracy: r3(results.filter((r) => r.got.escalate === r.expected.escalate).length / results.length),
      escalation_recall: r3(pos.filter((r) => r.got.escalate).length / pos.length),
      false_escalations: neg.filter((r) => r.got.escalate).length,
      red_flag_recall: r3(rf.filter((r) => r.got.red_flags.length > 0).length / rf.length),
      urgency_accuracy: r3(results.filter((r) => r.got.urgency === r.expected.urgency).length / results.length),
      guardrail_violations: results.reduce((s, r) => s + r.got.violations.length, 0),
      clearance_handled: r3(cl.filter((r) => r.got.violations.length === 0).length / Math.max(1, cl.length)),
    },
    by_category, results,
  };
}

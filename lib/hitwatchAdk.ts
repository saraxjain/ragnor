// HitWatch agent built on Google's Agent Development Kit (ADK, @google/adk).
// Same four tools, same rules engine and guardrails as the plain Gemini function-calling version;
// ADK runs the agent loop (model -> tool calls -> tool results -> model) for us.
import { LlmAgent, FunctionTool, InMemoryRunner } from "@google/adk";
import toolsFile from "../shared/agent/tools.json";
import { sanitize } from "../shared/lib/index.ts";
import { config } from "./config.ts";
import { toGeminiSchema, loadAgentPrompt } from "./gemini.ts";
import { getAthlete, type HitCall } from "./store.ts";
import { runTool, type AgentRun, type ToolName } from "./hitwatch.ts";

export async function runAdkAgentOnTranscript(
  athleteId: string,
  day: number,
  transcript: NonNullable<HitCall["transcript"]>,
): Promise<Omit<AgentRun, "decision">> {
  const a = getAthlete(athleteId);
  if (!a?.hitwatch) throw new Error("no active HitWatch case");
  const hit = a.hitwatch;
  const first = a.name.split(" ")[0];
  const calls: AgentRun["tool_calls"] = [];

  // Each ADK FunctionTool wraps the shared runTool(), so webhooks, browser calls and ADK all hit the same logic.
  const tools = toolsFile.tools.map(
    (t) =>
      new FunctionTool({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.parameters) as never,
        execute: (input: unknown) => {
          const args = { athlete_id: a.id, hit_id: hit.hit_id, day, ...((input as Record<string, unknown>) ?? {}) };
          let result: unknown;
          try {
            result = runTool(t.name as ToolName, args, t.name === "log_symptoms" ? transcript : undefined);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
          }
          calls.push({ name: t.name, args, result });
          return result;
        },
      }),
  );

  const vars: Record<string, string> = {
    athlete_first_name: first,
    athlete_id: a.id,
    hit_id: hit.hit_id,
    day: String(day),
    hit_description: hit.hit_description,
    coach_name: "Coach",
  };

  const agent = new LlmAgent({
    name: "hitwatch_agent",
    description: "Follows up with an athlete for 7 days after a hit and escalates changes to a human.",
    model: config.geminiModel,
    instruction:
      // ADK treats {curly} text in instructions as session-state templates, so fill our {{vars}} first.
      loadAgentPrompt().replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "").replace(/[{}]/g, "") +
      "\n\nYou are now processing a call that has just finished. Read the transcript, then call log_symptoms, then compare_to_baseline, then draft_alert if compare_to_baseline says escalate or any red flag was reported, then schedule_followup for tomorrow at 4pm local time. Finish with one sentence for the coach summarizing what happened. Never diagnose.",
    tools,
    generateContentConfig: { temperature: 0.1 },
  });

  const runner = new InMemoryRunner({ agent, appName: "ragnor" });
  const transcriptText = transcript.map((t) => `${t.role === "agent" ? "Ragnor" : first}: ${t.text}`).join("\n");
  let finalText = "";
  let modelError = "";

  for await (const ev of runner.runEphemeral({
    userId: a.id,
    newMessage: {
      role: "user",
      parts: [{ text: `athlete_id=${a.id}, hit_id=${hit.hit_id}, day=${day}, today=${new Date().toISOString().slice(0, 10)}\n\nCall transcript:\n${transcriptText}` }],
    },
  })) {
    // ADK reports model/API failures as events rather than throwing.
    if (ev.errorCode || ev.errorMessage) modelError = `${ev.errorCode ?? ""} ${ev.errorMessage ?? ""}`.trim();
    if (ev.author === "hitwatch_agent" && !ev.partial) {
      const text = (ev.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (text) finalText = text;
    }
  }

  if (modelError) throw new Error(`ADK model error: ${modelError}`);
  if (calls.length === 0) throw new Error("ADK agent finished without calling any tools");
  return { mode: "adk", tool_calls: calls, final_text: sanitize(finalText).text };
}

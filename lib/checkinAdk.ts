// Daily check-in agent built on Google's Agent Development Kit (ADK, @google/adk).
// The agent reads a typed check-in and picks one of two tools:
//   save_checkin  - record exactly what the athlete said (same schema as the plain Gemini path)
//   ask_followup  - ask ONE short question when sleep or practice time was not mentioned, instead of guessing
// It never sets the risk band: the route hands the saved check-in to the shared rules engine, as before.
import { LlmAgent, FunctionTool, InMemoryRunner, type BaseLlm } from "@google/adk";
import { sanitize } from "../shared/lib/index.ts";
import { toGeminiSchema } from "./gemini.ts";

export const FOLLOWUP_FIELDS = ["sleep", "practice"] as const;
export type FollowupField = (typeof FOLLOWUP_FIELDS)[number];

/** Fixed fallback wording, used when the model's own question is empty or trips a guardrail. */
export const FOLLOWUP_QUESTIONS: Record<FollowupField, string> = {
  sleep: "Roughly how many hours did you sleep last night?",
  practice: "About how many minutes was practice today, and how hard was it?",
};

export interface CheckinFollowup {
  question: string;
  answer: string;
}

export type CheckinAgentResult<T> =
  | { kind: "saved"; extracted: T }
  | { kind: "followup"; missing: FollowupField; question: string };

const AGENT_NAME = "checkin_agent";

const FOLLOWUP_PARAMS = {
  type: "object",
  properties: {
    missing: { type: "string", enum: [...FOLLOWUP_FIELDS], description: "Which detail the athlete left out." },
    question: { type: "string", description: "One short, friendly question for the athlete. No advice, no diagnosis." },
  },
  required: ["missing", "question"],
};

/** Keeps the model's question only if it is short, is a question, and passes the guardrails. */
export function safeQuestion(missing: FollowupField, raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || text.length > 140 || !text.endsWith("?")) return FOLLOWUP_QUESTIONS[missing];
  const s = sanitize(text);
  return s.text === text ? text : FOLLOWUP_QUESTIONS[missing];
}

export async function runCheckinAgent<T>(opts: {
  text: string;
  instruction: string; // the shared check-in prompt
  schema: unknown; // shared/schemas/checkin.schema.json
  model: string | BaseLlm; // a model name, or a stand-in model in tests
  followup?: CheckinFollowup | null; // set on the second pass, once the athlete has answered
}): Promise<CheckinAgentResult<T>> {
  let result: CheckinAgentResult<T> | null = null;
  const asked = Boolean(opts.followup);

  const tools = [
    new FunctionTool({
      name: "save_checkin",
      description: "Record the check-in exactly as the athlete described it. Use null for anything they did not say.",
      parameters: toGeminiSchema(opts.schema) as never,
      execute: (input: unknown) => {
        result ??= { kind: "saved", extracted: (input ?? {}) as T };
        return { ok: true };
      },
    }),
  ];
  // The follow-up tool is only offered on the first pass, so the agent cannot ask twice.
  if (!asked) {
    tools.push(
      new FunctionTool({
        name: "ask_followup",
        description: "Ask the athlete one short question when they did not mention sleep hours or practice time. Use at most once, and only for the most important missing detail.",
        parameters: toGeminiSchema(FOLLOWUP_PARAMS) as never,
        execute: (input: unknown) => {
          const i = (input ?? {}) as { missing?: unknown; question?: unknown };
          const missing = FOLLOWUP_FIELDS.find((f) => f === i.missing) ?? "sleep";
          result ??= { kind: "followup", missing, question: safeQuestion(missing, i.question) };
          return { ok: true };
        },
      }),
    );
  }

  const agent = new LlmAgent({
    name: AGENT_NAME,
    description: "Turns an athlete's daily check-in into structured data, asking one follow-up question if a key detail is missing.",
    model: opts.model,
    instruction:
      // ADK treats {curly} text in instructions as session-state templates, so strip braces.
      opts.instruction.replace(/[{}]/g, "") +
      "\n\nYou are processing a typed check-in. Call exactly one tool, once." +
      (asked
        ? " The athlete has already answered your follow-up question. Call save_checkin now, using both messages. If something is still missing, use null."
        : " If the athlete did not say how many hours they slept, or did not say how long practice was, you MUST call ask_followup for the single most important missing detail (sleep first) instead of save_checkin. Exception: if the athlete reports a hit, symptoms or any emergency sign, or if both details are present, call save_checkin straight away and do not ask anything.") +
      " Never guess a number. Never diagnose.",
    tools,
    generateContentConfig: { temperature: 0.1 },
  });

  const message =
    `The athlete typed this check-in:\n"""${opts.text}"""` +
    (opts.followup ? `\n\nYou asked: "${opts.followup.question}"\nThe athlete answered:\n"""${opts.followup.answer}"""` : "");

  const runner = new InMemoryRunner({ agent, appName: "ragnor" });
  let modelError = "";
  for await (const ev of runner.runEphemeral({ userId: "athlete", newMessage: { role: "user", parts: [{ text: message }] } })) {
    // ADK reports model/API failures as events rather than throwing.
    if (ev.errorCode || ev.errorMessage) modelError = `${ev.errorCode ?? ""} ${ev.errorMessage ?? ""}`.trim();
    if (result) break; // one tool call is the whole job: stop here, so a run costs one model request
  }

  if (result) return asked ? result : backstop(result);
  if (modelError) throw new Error(`ADK model error: ${modelError}`);
  throw new Error("ADK check-in agent finished without calling a tool");
}

/**
 * Backstop for the first pass: if the model saved a check-in with sleep or practice time missing (and nothing urgent),
 * ask the fixed question anyway. Whether a question gets asked therefore never depends on the model alone.
 */
export function backstop<T>(r: CheckinAgentResult<T>): CheckinAgentResult<T> {
  if (r.kind !== "saved") return r;
  const e = (r.extracted ?? {}) as { sleep_h?: unknown; load_min?: unknown; took_hit?: unknown; symptoms?: unknown; red_flags?: unknown };
  const urgent = Boolean(e.took_hit) || (Array.isArray(e.symptoms) && e.symptoms.length > 0) || (Array.isArray(e.red_flags) && e.red_flags.length > 0);
  if (urgent) return r;
  const missing: FollowupField | null = e.sleep_h == null ? "sleep" : e.load_min == null ? "practice" : null;
  return missing ? { kind: "followup", missing, question: FOLLOWUP_QUESTIONS[missing] } : r;
}

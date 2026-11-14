// Live model client (Gemini). Server-side only: it reads GEMINI_API_KEY and must never be imported from client components.
//
// Written from the current Google docs, not from memory (accessed 2026-11-14):
//  - Quickstart:          https://aistudio.google.com/docs/get-started      (redirected from ai.google.dev/gemini-api/docs/quickstart)
//      npm package `@google/genai`; `new GoogleGenAI({})` with the key in GEMINI_API_KEY; the page's examples call
//      `ai.interactions.create({ model, input })` and read `interaction.output_text`; example model id "gemini-4-hydrogen".
//  - Structured output:   https://aistudio.google.com/docs/structured-output
//      `response_format: { type: "text", mime_type: "application/json", schema }`, plain JSON Schema (string/number/integer/boolean/
//      object/array/null; enum, required, additionalProperties, minimum/maximum, items, minItems/maxItems). minLength/maxLength and
//      similar are stripped, not enforced, so limits are validated in our code. Oversized or deeply nested schemas can 400.
//  - Search grounding:    https://aistudio.google.com/docs/google-search
//      `tools: [{ type: "google_search" }]`; citations arrive as `url_citation` annotations (url, title). The page does not say whether
//      it can be combined with structured output, so grounding is a clearly marked STUB (src/lib/grounding.ts), not wired in.
//  - Function calling: not used here. HitWatch's tools are called by the ElevenLabs agent (with Gemini as its LLM) against our
//      server endpoints (see docs/HITWATCH_SETUP.md); this code only needs structured output.
// `store: false` asks the API not to keep the request for later retrieval (field documented in the SDK types).
// NOT exercised against the real API: no Gemini key was available when this was written.
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ModelClient } from "./types";

/** The docs' examples use this id; override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";

type Env = Record<string, string | undefined>;

export function geminiModelName(env: Env = process.env): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/** zod -> the JSON Schema subset Gemini documents. Strips `$schema` and keeps only documented keywords. */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (k === "$schema" || k === "minLength" || k === "maxLength" || k === "pattern") continue;
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(js) as Record<string, unknown>;
}

export function createGeminiClient(env: Env = process.env): ModelClient | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const ai = new GoogleGenAI({ apiKey: key }); // the key is never passed around or logged
  const model = geminiModelName(env);
  return {
    model,
    async complete({ system, user, schema, signal }) {
      const call = ai.interactions.create({
        model,
        system_instruction: system,
        input: user,
        store: false,
        response_format: { type: "text", mime_type: "application/json", schema: toGeminiSchema(schema) },
      });
      try {
        const interaction = await withDeadline(call, signal, 60_000);
        const text = interaction.output_text;
        if (typeof text !== "string" || text.trim() === "") throw new Error("The model returned no text.");
        return text;
      } catch (e) {
        if (e instanceof Error && (e.name === "AbortError" || e.message === "Timed out")) throw e;
        // Never echo request details or headers; status only.
        const status = (e as { status?: number } | null)?.status;
        if (status === 401 || status === 403) throw new Error("Gemini rejected the API key.");
        if (status === 429) throw new Error("Gemini rate limit reached.");
        if (typeof status === "number") throw new Error(`Gemini API error ${status}`);
        throw e instanceof Error ? new Error(e.message.slice(0, 160)) : new Error("Gemini request failed.");
      }
    },
  };
}

function withDeadline<T>(p: Promise<T>, signal: AbortSignal | undefined, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), ms);
    const onAbort = () => reject(new DOMException("aborted", "AbortError"));
    if (signal?.aborted) onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

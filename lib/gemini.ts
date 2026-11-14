// Gemini helpers: structured output (JSON schema) and function calling.
import { GoogleGenAI, type Part, type FunctionDeclaration } from "@google/genai";
import { config, live } from "./config.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!live.gemini()) throw new Error("GEMINI_API_KEY not set");
  client ??= new GoogleGenAI({ apiKey: config.geminiKey });
  return client;
}

/** Load a prompt from shared/prompts, dropping the header notes above the first `---`. */
export function loadPrompt(name: string): string {
  const raw = readFileSync(join(process.cwd(), "shared", "prompts", `${name}.md`), "utf8");
  const idx = raw.indexOf("\n---\n");
  return idx >= 0 ? raw.slice(idx + 5).trim() : raw;
}

type JsonSchema = Record<string, unknown>;

/** Models to try in order: GEMINI_MODEL, then any in GEMINI_FALLBACK_MODELS (comma-separated). */
export function modelChain(): string[] {
  const extra = (process.env.GEMINI_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return [config.geminiModel, ...extra.filter((m) => m !== config.geminiModel)];
}

function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b(503|429|500|502|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|try again|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a Gemini call with retries (0.8s, 2s backoff) on busy/rate-limit errors, then move to the next fallback model.
 * Non-transient errors (bad request, bad key) fail immediately.
 */
const isQuota = (e: unknown) => /exceeded your current quota|RESOURCE_EXHAUSTED.*quota|billing/i.test(e instanceof Error ? e.message : String(e));
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 25_000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Gemini timed out after ${TIMEOUT_MS / 1000}s (503 slow response)`)), TIMEOUT_MS))]);
}

export async function withGeminiRetry<T>(fn: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const model of modelChain()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await withTimeout(fn(model));
      } catch (e) {
        last = e;
        if (isQuota(e)) { console.warn(`[gemini] ${model}: API key is out of quota; not retrying`); break; } // retrying a quota error just wastes minutes
        if (!isTransient(e) && !/timed out/.test(String(e))) throw e;
        console.warn(`[gemini] ${model} busy (attempt ${attempt + 1}/3): ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        if (attempt < 2) await wait(attempt === 0 ? 800 : 2000);
      }
    }
  }
  throw last;
}

export function friendlyGeminiError(e: unknown): string {
  if (isQuota(e)) return "This Gemini API key is out of free quota (Google's limit, not the app). Wait a minute, or use a key with billing enabled.";
  return isTransient(e) || /timed out/.test(String(e))
    ? "Gemini is very busy right now (Google's servers, not the app). Try again in a minute."
    : e instanceof Error ? e.message : String(e);
}

/** Convert our JSON-Schema-style files into Gemini's OpenAPI Schema subset (uppercase types, no $comment/additionalProperties). */
export function toGeminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== "object") return s;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(s as JsonSchema)) {
    if (k === "$comment" || k === "additionalProperties" || k === "returns" || k === "endpoint") continue;
    if (k === "type" && typeof v === "string") out.type = v.toUpperCase();
    else if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(Object.entries(v as JsonSchema).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    } else out[k] = toGeminiSchema(v);
  }
  return out;
}

export async function generateStructured<T>(opts: {
  parts: Part[];
  schema: unknown;
  system?: string;
  temperature?: number;
  grounding?: boolean;
}): Promise<T> {
  const res = await withGeminiRetry((model) =>
    gemini().models.generateContent({
      model,
      contents: [{ role: "user", parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.2,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(opts.schema) as never,
      },
    }),
  );
  const text = res.text ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("Gemini returned non-JSON output");
  }
}

/** Grounded text generation (Google Search). Returns text plus cited URLs. Grounding can't be combined with a response schema. */
export async function generateGrounded(prompt: string): Promise<{ text: string; sources: { title: string; uri: string }[] }> {
  const res = await withGeminiRetry((model) =>
    gemini().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
    }),
  );
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
    .filter((s) => s.uri);
  return { text: res.text ?? "", sources };
}

export function functionDeclarations(tools: { name: string; description: string; parameters: unknown }[]): FunctionDeclaration[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) as never }));
}

export { live };

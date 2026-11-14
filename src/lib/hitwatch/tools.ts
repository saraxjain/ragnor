// HTTP-level handlers for the ElevenLabs agent's server tools. Pure functions of (deps, body) so tests call them without HTTP.
import { isNamed } from "../errors";
import { z } from "zod";
import type { DataAccess } from "../data/types";
import type { HandlerResult } from "../ingest";
import { endHitwatchCall, getFollowupContext, HitwatchError, logHitwatchDay } from "./service";

const impactId = z.string().min(1).max(100);

function fail(e: unknown): HandlerResult {
  if (isNamed<HitwatchError>(e, "HitwatchError")) return { status: e.status, body: { error: e.message } };
  if (isNamed(e, "ValidationError")) return { status: 422, body: { error: e.message } };
  if (isNamed(e, "ConsentRequiredError")) return { status: 403, body: { error: e.message } };
  if (isNamed(e, "ForbiddenError")) return { status: 403, body: { error: "Not allowed." } };
  throw e;
}

/** The dashboard tool schema sends `symptoms` as a JSON string (simplest for the dashboard); an object is accepted too. */
export function parseSymptoms(v: unknown): Record<string, unknown> | null {
  if (v === undefined || v === null || v === "") return {};
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function toolContext(da: DataAccess, body: unknown, now: Date): Promise<HandlerResult> {
  const id = impactId.safeParse((body as { impact_id?: unknown })?.impact_id);
  if (!id.success) return { status: 422, body: { error: "impact_id is required." } };
  try {
    return { status: 200, body: { ...(await getFollowupContext(da, id.data, now)) } };
  } catch (e) {
    return fail(e);
  }
}

export async function toolLog(da: DataAccess, body: unknown, now: Date): Promise<HandlerResult> {
  const b = (body ?? {}) as { impact_id?: unknown; symptoms?: unknown; transcript_excerpt?: unknown };
  const id = impactId.safeParse(b.impact_id);
  if (!id.success) return { status: 422, body: { error: "impact_id is required." } };
  const sev = parseSymptoms(b.symptoms);
  if (sev === null) return { status: 422, body: { error: 'symptoms must be a JSON object like {"headache": 2}.' } };
  const transcript = typeof b.transcript_excerpt === "string" ? b.transcript_excerpt : undefined;
  try {
    return { status: 200, body: { ...(await logHitwatchDay(da, id.data, { severities: sev, transcript, channel: "tool" }, now)) } };
  } catch (e) {
    return fail(e);
  }
}

export async function toolEnd(da: DataAccess, body: unknown, now: Date): Promise<HandlerResult> {
  const b = (body ?? {}) as { impact_id?: unknown; answered?: unknown; summary?: unknown };
  const id = impactId.safeParse(b.impact_id);
  if (!id.success) return { status: 422, body: { error: "impact_id is required." } };
  try {
    const r = await endHitwatchCall(da, id.data, { answered: b.answered !== false && b.answered !== "false", summary: typeof b.summary === "string" ? b.summary : undefined, channel: "tool" }, now);
    return { status: 200, body: { ok: true, ...r } };
  } catch (e) {
    return fail(e);
  }
}

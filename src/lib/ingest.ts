// Ingest points for teammates' pieces (landing result, check-in) and the simulated mouthguard impact webhook.
// Handlers take their dependencies explicitly so tests can call them without HTTP.
import { isNamed } from "./errors";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { DataAccess } from "./data/types";
import { checkinFromShape, landingFromShape, ShapeError } from "./shapes";
import { evaluateAthlete } from "./services";
import { localDateOf } from "./time";
import type { Actor } from "./types";

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

/** Constant-time check of the `x-ragnor-secret` header against an env var. An unset secret disables the endpoint (503), never opens it. */
export function checkSecret(request: Request, envVar: "INGEST_SECRET" | "IMPACT_WEBHOOK_SECRET" | "HITWATCH_TOOL_SECRET", env: Record<string, string | undefined> = process.env): HandlerResult | null {
  const expected = env[envVar]?.trim();
  if (!expected) return { status: 503, body: { error: `This endpoint is not configured (set ${envVar}).` } };
  const got = request.headers.get("x-ragnor-secret") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 401, body: { error: "Missing or wrong secret." } };
  return null;
}

const asAthlete = (id: string): Actor => ({ id, role: "athlete" });

function errorResult(e: unknown): HandlerResult {
  if (isNamed<ShapeError>(e, "ShapeError")) return { status: 422, body: { error: e.message, details: e.errors } };
  if (isNamed(e, "ConsentRequiredError")) return { status: 403, body: { error: e.message } };
  if (isNamed(e, "ForbiddenError")) return { status: 403, body: { error: "Not allowed." } };
  if (isNamed(e, "ValidationError")) return { status: 422, body: { error: e.message } };
  throw e;
}

async function localDateFor(da: DataAccess, athleteId: string, now: Date): Promise<string | null> {
  const p = await da.getProfile(asAthlete(athleteId), athleteId).catch(() => null);
  return p && p.role === "athlete" ? localDateOf(now, p.timezone) : null;
}

const idSchema = z.string().min(1).max(100);

export async function ingestLanding(da: DataAccess, body: unknown, now: Date): Promise<HandlerResult> {
  const athleteId = idSchema.safeParse((body as { athlete_id?: unknown })?.athlete_id);
  if (!athleteId.success) return { status: 422, body: { error: "athlete_id is required." } };
  try {
    const localDate = await localDateFor(da, athleteId.data, now);
    if (!localDate) return { status: 404, body: { error: "Unknown athlete." } };
    const write = landingFromShape(body, { athleteId: athleteId.data, localDate, now });
    const saved = await da.saveLandingResult(asAthlete(athleteId.data), write);
    const evaluation = await evaluateAthlete(da, asAthlete(athleteId.data), athleteId.data, now);
    return { status: 201, body: { landing_id: saved.id, band: saved.band, flags: evaluation.flags.filter((f) => f.ruleId === "landing-band").map((f) => ({ level: f.level, reason: f.reason, rule_id: f.ruleId, rules_version: f.rulesVersion })) } };
  } catch (e) {
    return errorResult(e);
  }
}

export async function ingestCheckin(da: DataAccess, body: unknown, now: Date): Promise<HandlerResult> {
  const athleteId = idSchema.safeParse((body as { athlete_id?: unknown })?.athlete_id);
  if (!athleteId.success) return { status: 422, body: { error: "athlete_id is required." } };
  try {
    const localDate = await localDateFor(da, athleteId.data, now);
    if (!localDate) return { status: 404, body: { error: "Unknown athlete." } };
    const write = checkinFromShape(body, { athleteId: athleteId.data, localDate, now });
    const { replacedPrevious } = await da.upsertCheckin(asAthlete(athleteId.data), write);
    const evaluation = await evaluateAthlete(da, asAthlete(athleteId.data), athleteId.data, now);
    return { status: replacedPrevious ? 200 : 201, body: { replaced_previous: replacedPrevious, evaluation_id: evaluation.id, flags: evaluation.flags.map((f) => ({ level: f.level, rule_id: f.ruleId, rules_version: f.rulesVersion, reason: f.reason })) } };
  } catch (e) {
    return errorResult(e);
  }
}

// ---- simulated mouthguard impact webhook
export const impactPayload = z.object({
  event_id: z.string().min(1).max(100),
  athlete_id: idSchema,
  occurred_at: z.string().datetime({ offset: true }),
  peak_g: z.number().min(0).max(500).optional(),
  device_id: z.string().max(100).optional(),
});

/** Creates the impact event and starts HitWatch. Idempotent on event_id. */
export async function startImpact(da: DataAccess, input: { athleteId: string; eventId: string; occurredAt: string; source: "mouthguard_webhook" | "demo"; context?: string }, now: Date) {
  const actor = asAthlete(input.athleteId);
  const existing = await da.findImpactByExternalId(actor, input.athleteId, input.eventId);
  if (existing) return { duplicate: true as const, impact: existing };
  const impact = await da.createImpact(actor, { athleteId: input.athleteId, occurredAt: input.occurredAt, context: input.context ?? null, externalId: input.eventId, source: input.source });
  // The 7-day follow-up starts now: day 1 is due.
  await da.recordCall(actor, { impactEventId: impact.id, athleteId: input.athleteId, day: 1, channel: "phone", status: "scheduled", at: now.toISOString() });
  const evaluation = await evaluateAthlete(da, actor, input.athleteId, now);
  return { duplicate: false as const, impact, evaluation };
}

export async function handleImpactWebhook(da: DataAccess, body: unknown, now: Date): Promise<HandlerResult> {
  const p = impactPayload.safeParse(body);
  if (!p.success) return { status: 422, body: { error: "Invalid payload.", details: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) } };
  const t = new Date(p.data.occurred_at).getTime();
  if (t > now.getTime() + 5 * 60_000) return { status: 422, body: { error: "occurred_at is in the future." } };
  if (t < now.getTime() - 7 * 86_400_000) return { status: 422, body: { error: "occurred_at is more than 7 days ago." } };
  try {
    const localDate = await localDateFor(da, p.data.athlete_id, now);
    if (!localDate) return { status: 404, body: { error: "Unknown athlete." } };
    const r = await startImpact(da, { athleteId: p.data.athlete_id, eventId: p.data.event_id, occurredAt: new Date(t).toISOString(), source: "mouthguard_webhook" }, now);
    return { status: r.duplicate ? 200 : 201, body: { duplicate: r.duplicate, impact_id: r.impact.id, followup: { days: 7, day_1_due: true } } };
  } catch (e) {
    return errorResult(e);
  }
}

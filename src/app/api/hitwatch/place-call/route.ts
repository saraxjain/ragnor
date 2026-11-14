import { getDataAccess, isDemoMode } from "@/lib/data";
import { buildOutboundCall } from "@/lib/hitwatch/service";
import { getSession } from "@/lib/session";
import { followUpDayNumber, localDateOf } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CODE ONLY. Asks ElevenLabs to place today's HitWatch call for an active follow-up. Reviewer (trainer) session required.
 * Body: {"impact_id": "...", "to_number": "+1..."}. The number is used for this request only and is never stored.
 * Nothing in this repository calls this route; a person must POST to it deliberately.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || session.actor.role !== "trainer") return Response.json({ error: "Reviewer (trainer) session required." }, { status: 401 });
  if (!isDemoMode()) return Response.json({ error: "Real sign-in is not built, so this needs the demo role picker." }, { status: 501 });
  const body = (await request.json().catch(() => null)) as { impact_id?: unknown; to_number?: unknown } | null;
  if (typeof body?.impact_id !== "string" || typeof body?.to_number !== "string") return Response.json({ error: "impact_id and to_number are required." }, { status: 422 });
  const da = await getDataAccess();
  const impact = await da.systemFindImpact(body.impact_id);
  const athlete = impact && (await da.listTeamAthletes(session.actor)).find((a) => a.id === impact.athleteId);
  if (!impact || !athlete) return Response.json({ error: "Unknown impact." }, { status: 404 });
  const day = followUpDayNumber(impact.occurredAt, localDateOf(new Date(), athlete.timezone), athlete.timezone);
  if (day < 1 || day > 7) return Response.json({ error: "This follow-up window is not active." }, { status: 409 });
  const call = buildOutboundCall(process.env, { toNumber: body.to_number, impactId: impact.id, day });
  if ("error" in call) return Response.json({ error: call.error }, { status: call.error.startsWith("Outbound") ? 503 : 422 });
  const res = await fetch(call.url, call.init).catch(() => null);
  if (!res || !res.ok) return Response.json({ error: "ElevenLabs could not place the call." }, { status: 502 });
  const j = (await res.json().catch(() => ({}))) as { conversation_id?: string };
  return Response.json({ ok: true, conversation_id: j.conversation_id ?? null });
}

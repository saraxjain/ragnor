import { getDataAccess, isDemoMode } from "@/lib/data";
import { getSession } from "@/lib/session";
import { followUpDayNumber, localDateOf } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * In-browser "Talk to HitWatch": returns a signed URL for a private ElevenLabs agent (the API key stays on the server).
 * Docs: GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=... with header xi-api-key.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || session.actor.role !== "athlete") return Response.json({ error: "Sign in as an athlete first." }, { status: 401 });
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const agent = process.env.ELEVENLABS_AGENT_ID?.trim();
  if (!key || !agent) return Response.json({ error: "Voice agent is not set up." }, { status: 503 });
  if (!isDemoMode()) return Response.json({ error: "Real sign-in is not built, so this needs the demo role picker." }, { status: 501 });
  const impactId = new URL(request.url).searchParams.get("impact_id") ?? "";
  const da = await getDataAccess();
  const impact = (await da.listImpacts(session.actor, session.actor.id)).find((i) => i.id === impactId);
  if (!impact) return Response.json({ error: "Unknown impact." }, { status: 404 });
  const consent = await da.getConsentStatus(session.actor, session.actor.id, localDateOf(new Date(), session.profile.timezone));
  if (consent.required && !consent.active) return Response.json({ error: "A parent or guardian must give consent first." }, { status: 403 });
  const day = followUpDayNumber(impact.occurredAt, localDateOf(new Date(), session.profile.timezone), session.profile.timezone);
  if (day < 1 || day > 7) return Response.json({ error: "This follow-up window is not active." }, { status: 409 });
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent)}`, { headers: { "xi-api-key": key } }).catch(() => null);
  if (!res || !res.ok) return Response.json({ error: "Could not start a voice session." }, { status: 502 });
  const j = (await res.json().catch(() => null)) as { signed_url?: string } | null;
  if (!j?.signed_url) return Response.json({ error: "Could not start a voice session." }, { status: 502 });
  return Response.json({ signed_url: j.signed_url, dynamic_variables: { impact_id: impact.id, followup_day: String(day) } });
}

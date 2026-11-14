import { getDataAccess } from "@/lib/data";
import { checkSecret, handleImpactWebhook } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simulated mouthguard impact webhook. Header x-ragnor-secret = IMPACT_WEBHOOK_SECRET.
 * Body: {"event_id","athlete_id","occurred_at" (ISO with offset),"peak_g"?,"device_id"?}. Idempotent on event_id.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkSecret(request, "IMPACT_WEBHOOK_SECRET");
  if (denied) return Response.json(denied.body, { status: denied.status });
  const body = await request.json().catch(() => null);
  const r = await handleImpactWebhook(await getDataAccess(), body, new Date());
  return Response.json(r.body, { status: r.status });
}

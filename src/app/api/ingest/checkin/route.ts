import { getDataAccess } from "@/lib/data";
import { checkSecret, ingestCheckin } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {"athlete_id": "...", "checkin": {...}} (shape from docs/PLAN.md). Header x-ragnor-secret = INGEST_SECRET. */
export async function POST(request: Request): Promise<Response> {
  const denied = checkSecret(request, "INGEST_SECRET");
  if (denied) return Response.json(denied.body, { status: denied.status });
  const body = await request.json().catch(() => null);
  const r = await ingestCheckin(await getDataAccess(), body, new Date());
  return Response.json(r.body, { status: r.status });
}

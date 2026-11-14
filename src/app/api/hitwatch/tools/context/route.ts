import { getDataAccess } from "@/lib/data";
import { checkSecret } from "@/lib/ingest";
import { toolContext } from "@/lib/hitwatch/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ElevenLabs agent server tool. Header x-ragnor-secret = HITWATCH_TOOL_SECRET (configure it as a Secret header on the tool). */
export async function POST(request: Request): Promise<Response> {
  const denied = checkSecret(request, "HITWATCH_TOOL_SECRET");
  if (denied) return Response.json(denied.body, { status: denied.status });
  const body = await request.json().catch(() => null);
  const r = await toolContext(await getDataAccess(), body, new Date());
  return Response.json(r.body, { status: r.status });
}

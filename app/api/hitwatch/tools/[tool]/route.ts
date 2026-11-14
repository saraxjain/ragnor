import { ok, fail, readJson, errorMessage, toolAuthorized } from "@/lib/http.ts";
import { runTool, type ToolName } from "@/lib/hitwatch.ts";

export const dynamic = "force-dynamic";

const TOOLS: ToolName[] = ["log_symptoms", "compare_to_baseline", "draft_alert", "schedule_followup"];

/** Webhook for the HitWatch agent's tools (ElevenLabs server tools, or browser client tools). */
export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!TOOLS.includes(tool as ToolName)) return fail(`Unknown tool ${tool}`, 404);
  if (!toolAuthorized(req)) return fail("unauthorized", 401);
  try {
    const args = await readJson<Record<string, unknown>>(req);
    return ok(runTool(tool as ToolName, args));
  } catch (e) {
    return fail(errorMessage(e), 400);
  }
}

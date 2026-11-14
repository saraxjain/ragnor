import { ok, fail, readJson } from "@/lib/http.ts";
import { decideAlert } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision, by } = await readJson<{ decision: "approved" | "dismissed"; by?: string }>(req);
  if (decision !== "approved" && decision !== "dismissed") return fail("decision must be approved or dismissed");
  const a = decideAlert(id, decision, by || "coach");
  if (!a) return fail("Alert not found", 404);
  return ok({ alert: a });
}

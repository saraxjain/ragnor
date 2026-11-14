import { NextResponse } from "next/server";
import { getAthlete } from "@/lib/store.ts";
import { scoreAthlete } from "@/lib/risk.ts";
import { requireKey } from "@/lib/apiAuth.ts";

export const dynamic = "force-dynamic";

/** GET /api/v1/athletes/{id}/risk — model probability, drivers, features and the rules-engine flags. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireKey(req, "GET /v1/athletes/{id}/risk");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const a = getAthlete(id);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ athlete_id: id, date: a.risk_today.date, model: scoreAthlete(a), rules: a.risk_today, disclaimer: "Decision support for prioritization. Not a diagnosis; never used to clear an athlete." });
}

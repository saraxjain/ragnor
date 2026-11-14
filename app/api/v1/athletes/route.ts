import { NextResponse } from "next/server";
import { listAthletes } from "@/lib/store.ts";
import { scoreAthlete } from "@/lib/risk.ts";
import { requireKey } from "@/lib/apiAuth.ts";

export const dynamic = "force-dynamic";

/** GET /api/v1/athletes — roster with today's rules band and model risk, highest first. */
export async function GET(req: Request) {
  const auth = requireKey(req, "GET /v1/athletes");
  if (auth instanceof NextResponse) return auth;
  const data = listAthletes().map((a) => {
    const s = scoreAthlete(a);
    return { id: a.id, name: a.name, sport: a.sport, rules_band: a.risk_today.band, risk_7d: s.risk_7d, tier: s.tier, top_drivers: s.top_drivers.map((d) => d.label) };
  }).sort((x, y) => y.risk_7d - x.risk_7d);
  return NextResponse.json({ tenant: auth.tenant, count: data.length, data });
}

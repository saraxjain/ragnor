import { NextResponse } from "next/server";
import { getAthlete } from "@/lib/store.ts";
import { trustReport, trustedOnly } from "@/lib/trust.ts";
import { scoreAthlete } from "@/lib/risk.ts";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAthlete(id);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const t = trustReport(a);
  const raw = scoreAthlete(a), trusted = scoreAthlete(trustedOnly(a, t));
  return NextResponse.json({ athlete: { id: a.id, name: a.name, sport: a.sport, grade: a.grade, device: a.device }, trust: t, risk: { raw, trusted } });
}

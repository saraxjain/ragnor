import { NextResponse } from "next/server";
import { getAthlete } from "@/lib/store.ts";
import { getBrief, briefFhir } from "@/lib/brief.ts";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAthlete(id), b = getBrief(id);
  if (!a || !b) return NextResponse.json({ error: "Run the brief first" }, { status: 404 });
  return NextResponse.json(briefFhir(a, b), { headers: { "Content-Type": "application/fhir+json" } });
}

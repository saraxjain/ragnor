import { NextResponse } from "next/server";
import { getCase, runCaseConference, signoff } from "@/lib/caseConference.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ case: getCase(id) ?? null });
}

/** POST {} runs the conference; POST {decision, by, note} signs off. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { decision?: "accepted" | "edited" | "rejected"; by?: string; note?: string };
  try {
    if (body.decision) return NextResponse.json({ case: signoff(id, body.by || "Coach Rivera", body.decision, body.note) });
    return NextResponse.json({ case: await runCaseConference(id) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 400 });
  }
}

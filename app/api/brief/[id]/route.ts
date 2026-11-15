import { NextResponse } from "next/server";
import { getBrief, runBrief, savedBrief, signBrief } from "@/lib/brief.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ brief: getBrief(id) ?? null });
}

/** POST {} runs the agents; POST {saved:true} replays a recorded run if one fits; POST {decision:"sent"|"returned", by, note} is the clinician sign-off. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { decision?: "sent" | "returned"; by?: string; note?: string; saved?: boolean };
  try {
    if (body.decision) return NextResponse.json({ brief: signBrief(id, body.by || "Dr. Patel, Sports Medicine", body.decision, body.note) });
    // {saved:true} replays the recorded Gemini run when the data still matches it; otherwise it runs live.
    return NextResponse.json({ brief: (body.saved ? savedBrief(id) : null) ?? (await runBrief(id)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getBrief, runBrief, signBrief } from "@/lib/brief.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ brief: getBrief(id) ?? null });
}

/** POST {} runs the agents; POST {decision:"sent"|"returned", by, note} is the clinician sign-off. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { decision?: "sent" | "returned"; by?: string; note?: string };
  try {
    if (body.decision) return NextResponse.json({ brief: signBrief(id, body.by || "Dr. Patel, Sports Medicine", body.decision, body.note) });
    return NextResponse.json({ brief: await runBrief(id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

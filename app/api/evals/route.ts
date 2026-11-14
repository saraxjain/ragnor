import { NextResponse } from "next/server";
import { runEvals } from "@/lib/evals.ts";
import { live } from "@/lib/config.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET runs the offline suite (instant). POST {engine:"gemini"} runs the suite through Gemini extraction + replies. */
export async function GET() {
  return NextResponse.json({ gemini_available: live.gemini(), report: await runEvals("offline") });
}
export async function POST(req: Request) {
  const { engine } = (await req.json().catch(() => ({}))) as { engine?: "gemini" | "offline" };
  if (engine === "gemini" && !live.gemini()) return NextResponse.json({ error: "Add GEMINI_API_KEY to run the Gemini suite." }, { status: 400 });
  try { return NextResponse.json({ gemini_available: live.gemini(), report: await runEvals(engine ?? "offline") }); }
  catch (e) { return NextResponse.json({ error: String((e as Error).message) }, { status: 503 }); }
}

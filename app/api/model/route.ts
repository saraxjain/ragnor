import { NextResponse } from "next/server";
import { modelCard } from "@/lib/risk.ts";

export const dynamic = "force-static";

/** Public model card: metrics, calibration, ROC, feature weights, intended use, limitations. */
export async function GET() {
  return NextResponse.json(modelCard());
}

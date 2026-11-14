import { NextResponse } from "next/server";
import { live } from "@/lib/config.ts";
import { authUrl } from "@/lib/googleHealth.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("athlete_id") ?? "ath_01";
  if (!live.googleHealth()) {
    return NextResponse.redirect(new URL(`/athlete?id=${id}&health=not_configured`, req.url));
  }
  return NextResponse.redirect(authUrl(id));
}

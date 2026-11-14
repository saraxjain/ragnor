import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthUrl, googleHealthConfigured } from "@/lib/wearables/google-health";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts the Google Health OAuth flow for the signed-in athlete. Mock wearables stay the default until this is completed. */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session || session.actor.role !== "athlete") return NextResponse.json({ error: "Sign in as an athlete first." }, { status: 401 });
  if (!googleHealthConfigured()) {
    return NextResponse.json({ error: "Google Health is not set up (GOOGLE_HEALTH_CLIENT_ID and GOOGLE_HEALTH_CLIENT_SECRET). Mock wearable data is in use." }, { status: 503 });
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("ragnor_gh_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}

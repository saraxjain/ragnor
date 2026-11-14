import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, googleHealthConfigured } from "@/lib/wearables/google-health";
import { tokenStore } from "@/lib/wearables";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth redirect target. Tokens are kept server-side only (memory in the demo; never sent to the browser). */
export async function GET(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session || session.actor.role !== "athlete") return NextResponse.json({ error: "Sign in as an athlete first." }, { status: 401 });
  if (!googleHealthConfigured()) return NextResponse.json({ error: "Google Health is not set up." }, { status: 503 });
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const cookieState = request.cookies.get("ragnor_gh_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) return NextResponse.json({ error: "Invalid OAuth state." }, { status: 400 });
  try {
    await tokenStore().set(session.actor.id, await exchangeCode(code));
  } catch {
    return NextResponse.json({ error: "Could not complete the Google Health connection." }, { status: 502 });
  }
  const res = NextResponse.redirect(new URL("/athlete?wearable=connected", request.url));
  res.cookies.delete("ragnor_gh_state");
  return res;
}

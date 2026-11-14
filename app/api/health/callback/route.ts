import { NextResponse } from "next/server";
import { exchangeCode, fetchWearableDays } from "@/lib/googleHealth.ts";
import { setWearable, state } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const athleteId = url.searchParams.get("state") ?? "ath_01";
  const back = (q: string) => NextResponse.redirect(new URL(`/athlete?id=${athleteId}&health=${q}`, req.url));
  if (!code) return back(url.searchParams.get("error") ?? "denied");
  try {
    const tokens = await exchangeCode(code);
    state().healthTokens.set(athleteId, tokens);
    const days = await fetchWearableDays(tokens.access_token, 31);
    if (days.length < 4) return back("too_little_data");
    // Baseline = everything except the last 7 days; recent = last 7 days.
    const recent = days.slice(-7);
    const baseline = days.slice(0, -7);
    setWearable(athleteId, recent, baseline.length >= 3 ? baseline : days);
    return back("synced");
  } catch (e) {
    console.error("[health/callback]", e);
    return back("error");
  }
}

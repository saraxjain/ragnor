import { ok } from "@/lib/http.ts";
import { listAlerts, listAthletes, seasonReport, TODAY } from "@/lib/store.ts";
import { integrationStatus } from "@/lib/config.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const athletes = listAthletes().map((a) => ({
    id: a.id,
    name: a.name,
    sport: a.sport,
    grade: a.grade,
    device: a.device,
    band: a.risk_today.band,
    flags: a.risk_today.flags,
    low_confidence: a.risk_today.low_confidence,
    landing_band: a.landing?.score.band ?? null,
    wearable: {
      hrv_pct: null as number | null,
      source: a.wearable.source,
      has_data: a.wearable.recent.length > 0,
    },
  }));
  return ok({ today: TODAY, athletes, alerts: listAlerts(), report: seasonReport(), integrations: integrationStatus() });
}

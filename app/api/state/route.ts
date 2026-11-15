import { ok } from "@/lib/http.ts";
import { listAlerts, listAthletes, seasonReport, TODAY } from "@/lib/store.ts";
import { integrationStatus } from "@/lib/config.ts";
import { scoreAthlete } from "@/lib/risk.ts";

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
    model: (() => { const m = scoreAthlete(a); return { risk_7d: m.risk_7d, tier: m.tier, top_drivers: m.top_drivers }; })(),
    wearable: {
      hrv_pct: null as number | null,
      source: a.wearable.source,
      has_data: a.wearable.recent.length > 0,
    },
  }));
  // Anyone who reported an emergency sign today goes to the top; otherwise keep the usual order (stable sort).
  const emergency = (x: { flags: { rule_id: string }[] }) => x.flags.some((f) => f.rule_id === "R8_red_flag");
  athletes.sort((x, y) => Number(emergency(y)) - Number(emergency(x)));
  return ok({ today: TODAY, athletes, alerts: listAlerts(), report: seasonReport(), integrations: integrationStatus() });
}

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
    hitwatch: a.hitwatch
      ? {
          hit_id: a.hitwatch.hit_id,
          day: Math.max(0, ...a.hitwatch.calls.map((c) => c.day)),
          calls: a.hitwatch.calls.length,
          status: a.hitwatch.status,
          escalate: a.hitwatch.today_decision?.escalate ?? false,
          urgency: a.hitwatch.today_decision?.urgency ?? null,
          hit_date: a.hitwatch.hit_date,
          description: a.hitwatch.hit_description,
          next_call: a.hitwatch.next_call,
        }
      : null,
    wearable: {
      hrv_pct: null as number | null,
      source: a.wearable.source,
      has_data: a.wearable.recent.length > 0,
    },
  }));
  return ok({ today: TODAY, athletes, alerts: listAlerts(), report: seasonReport(), integrations: integrationStatus() });
}

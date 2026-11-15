import { ok, fail } from "@/lib/http.ts";
import { getAthlete, listAlerts, listAudit } from "@/lib/store.ts";
import { compareToBaseline } from "@/shared/lib/index.ts";
import { trustedOnly } from "@/lib/trust.ts";
import { integrationStatus } from "@/lib/config.ts";
import { scoreAthlete } from "@/lib/risk.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAthlete(id);
  if (!a) return fail("Athlete not found", 404);
  const tw = trustedOnly(a).wearable.recent;
  const wearableCompare = tw.length ? compareToBaseline(tw, a.wearable.baseline) : null;
  return ok({
    athlete: a,
    wearable_compare: wearableCompare,
    trusted_recent: tw,
    model: scoreAthlete(a),
    alerts: listAlerts().filter((x) => x.athlete_id === id),
    audit: listAudit(id).slice(0, 30),
    integrations: integrationStatus(),
  });
}

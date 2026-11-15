import { NextResponse } from "next/server";
import { listAthletes } from "@/lib/store.ts";
import { trustReport, trustedOnly } from "@/lib/trust.ts";
import { scoreAthlete } from "@/lib/risk.ts";
import { getBrief } from "@/lib/brief.ts";

export const dynamic = "force-dynamic";

/** Clinician panel: every patient who shared data, with data quality, raw vs trusted risk and brief status. */
export async function GET() {
  const patients = listAthletes().map((a) => {
    const t = trustReport(a);
    const raw = scoreAthlete(a).risk_7d, trusted = scoreAthlete(trustedOnly(a, t)).risk_7d;
    const b = getBrief(a.id);
    return {
      id: a.id, name: a.name, sport: a.sport, grade: a.grade, device: a.device,
      pct_usable: t.summary.pct_usable, unverified: t.summary.unverified,
      risk_raw: raw, risk_trusted: trusted,
      false_alarm: raw - trusted > 0.015,
      brief: b ? { headline: b.headline, discuss: b.findings.filter((f) => f.status === "discuss").length, signed: !!b.signoff } : null,
    };
  }).sort((x, y) => y.risk_trusted - x.risk_trusted);
  return NextResponse.json({ patients });
}

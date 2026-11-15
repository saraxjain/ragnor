import { NextResponse } from "next/server";
import { listAthletes, type Athlete } from "@/lib/store.ts";
import { trustReport, trustedOnly } from "@/lib/trust.ts";
import { scoreAthlete, MODEL } from "@/lib/risk.ts";
import { getBrief } from "@/lib/brief.ts";

export const dynamic = "force-dynamic";

/** Triage group, most urgent first. */
export type Group = "now" | "soon" | "data" | "clear";

/** Below this share of usable readings the wearable picture can't be trusted. */
const UNUSABLE_PCT = 50;

function triage(a: Athlete, pctUsable: number, trustedRisk: number): { group: Group; reasons: string[] } {
  const latest = [...a.checkins].sort((x, y) => x.date.localeCompare(y.date)).at(-1);
  const redFlags = latest?.red_flags ?? [];
  const flags = a.risk_today?.flags ?? [];
  const high = flags.filter((f) => f.band === "high");
  if (redFlags.length || high.length || a.risk_today?.band === "high") {
    const reasons = [...redFlags.map((r) => `Red flag reported: ${r.replace(/_/g, " ")}`), ...(high.length ? high : flags).map((f) => f.reason)];
    return { group: "now", reasons };
  }
  const moderate = flags.filter((f) => f.band === "moderate");
  if (moderate.length || trustedRisk >= MODEL.threshold) {
    const reasons = moderate.map((f) => f.reason);
    if (trustedRisk >= MODEL.threshold) reasons.push(`7-day injury risk ${(trustedRisk * 100).toFixed(1)}% is above the review threshold`);
    return { group: "soon", reasons };
  }
  if (pctUsable < UNUSABLE_PCT) {
    return { group: "data", reasons: [pctUsable === 0 ? "No usable wearable readings this week" : `Only ${pctUsable}% of wearable readings are usable`] };
  }
  return { group: "clear", reasons: [] };
}

/** Clinician panel: every patient who shared data, triaged, with data quality, raw vs trusted risk and brief status. */
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
      ...triage(a, t.summary.pct_usable, trusted),
      brief: b ? { headline: b.headline, discuss: b.findings.filter((f) => f.status === "discuss").length, signed: !!b.signoff } : null,
    };
  }).sort((x, y) => y.risk_trusted - x.risk_trusted);
  return NextResponse.json({ patients });
}

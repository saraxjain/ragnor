import { NextResponse } from "next/server";
import { getAthlete } from "@/lib/store.ts";
import { trustReport, trustedOnly } from "@/lib/trust.ts";
import { scoreAthlete } from "@/lib/risk.ts";
import { AREA } from "@/lib/flagCopy.ts";
import type { CheckIn } from "@/shared/lib/types.ts";

export const dynamic = "force-dynamic";

import type { SelfReport } from "@/components/TrustStrip.tsx";

const SORENESS = ["", "mild", "moderate", "severe"] as const;
const words = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** What the athlete reported in their check-in that day: sore areas, hits, symptoms and red flags. */
function selfReports(c: CheckIn): SelfReport[] {
  const out: SelfReport[] = [];
  for (const s of c.soreness) {
    if (s.level < 1) continue;
    out.push({ text: AREA[s.area] ?? words(s.area), detail: `${SORENESS[Math.min(3, s.level)]} soreness`, severity: s.level >= 3 ? "severe" : s.level === 2 ? "moderate" : "mild" });
  }
  if (c.took_hit) out.push({ text: "Took a hit", severity: "moderate" });
  for (const s of c.symptoms) out.push({ text: words(s), detail: "symptom", severity: "moderate" });
  for (const r of c.red_flags) out.push({ text: words(r), detail: "red flag", severity: "severe" });
  return out;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAthlete(id);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const t = trustReport(a);
  const raw = scoreAthlete(a), trusted = scoreAthlete(trustedOnly(a, t));
  const reports: Record<string, SelfReport[]> = {};
  for (const c of a.checkins) {
    const r = selfReports(c);
    if (r.length) reports[c.date] = r;
  }
  return NextResponse.json({ athlete: { id: a.id, name: a.name, sport: a.sport, grade: a.grade, device: a.device }, trust: t, risk: { raw, trusted }, reports });
}

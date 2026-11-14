import { NextResponse } from "next/server";
import { getAthlete, setWearable } from "@/lib/store.ts";
import { requireKey } from "@/lib/apiAuth.ts";
import type { WearableDay } from "@/shared/lib/index.ts";

export const dynamic = "force-dynamic";

/** POST /api/v1/ingest/wearable — device partners push daily HRV / resting HR / sleep. Body: { athlete_id, days: WearableDay[] } */
export async function POST(req: Request) {
  const auth = requireKey(req, "POST /v1/ingest/wearable");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json().catch(() => null)) as { athlete_id?: string; days?: WearableDay[] } | null;
  const a = body?.athlete_id ? getAthlete(body.athlete_id) : undefined;
  if (!a || !Array.isArray(body?.days)) return NextResponse.json({ error: "athlete_id and days[] required" }, { status: 400 });
  const clean = body!.days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)).map((d) => ({ date: d.date, hrv_ms: d.hrv_ms ?? null, rhr_bpm: d.rhr_bpm ?? null, sleep_h: d.sleep_h ?? null }));
  const merged = [...a.wearable.recent.filter((d) => !clean.some((c) => c.date === d.date)), ...clean].sort((x, y) => x.date.localeCompare(y.date)).slice(-7);
  setWearable(a.id, merged, a.wearable.baseline_days);
  return NextResponse.json({ ok: true, accepted: clean.length, risk_band: getAthlete(a.id)!.risk_today.band });
}

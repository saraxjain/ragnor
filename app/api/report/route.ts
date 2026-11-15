import { ok } from "@/lib/http.ts";
import { listAlerts, listAthletes, seasonReport, TODAY } from "@/lib/store.ts";
import { seasonDetail } from "@/lib/seasonDetail.ts";

export const dynamic = "force-dynamic";

/** Season report: program totals plus a 14-day picture of every athlete. */
export async function GET() {
  return ok({ report: seasonReport(), detail: seasonDetail(listAthletes(), listAlerts(), TODAY) });
}

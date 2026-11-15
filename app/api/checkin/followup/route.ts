import { ok, fail, errorMessage } from "@/lib/http.ts";
import { addCheckin, getAthlete, TODAY } from "@/lib/store.ts";
import { applyFollowups } from "@/lib/followups.ts";
import { RED_FLAG_MESSAGE } from "@/shared/lib/index.ts";

export const dynamic = "force-dynamic";

/** Saves the athlete's answers to today's follow-up questions. Fixed code only: no AI model is called here. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { athlete_id?: unknown; answers?: unknown };
    const a = getAthlete(String(body.athlete_id ?? ""));
    if (!a) return fail("Athlete not found.", 404);
    const today = a.checkins.find((c) => c.date === TODAY);
    if (!today) return fail("Do today's check-in first.", 400);
    const answers = Object.fromEntries(Object.entries((body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    const checkin = applyFollowups(today, answers);
    const risk = addCheckin(a.id, checkin);
    return ok({ checkin, risk, red_flag_message: checkin.red_flags.length ? RED_FLAG_MESSAGE : null });
  } catch (e) {
    console.error("[checkin/followup]", e);
    return fail(`Could not save your answers: ${errorMessage(e)}`, 500);
  }
}

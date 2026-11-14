import { ok, fail, readJson, errorMessage } from "@/lib/http.ts";
import { getAthlete } from "@/lib/store.ts";
import { demoTranscript, runAgentOnTranscript } from "@/lib/hitwatch.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scripted demo call. The transcript is fixed; the processing (function calls, rules, alert) is real. */
export async function POST(req: Request) {
  try {
    const { athlete_id, day, transcript } = await readJson<{ athlete_id: string; day?: number; transcript?: { role: "agent" | "athlete"; text: string }[] }>(req);
    const a = getAthlete(athlete_id);
    if (!a?.hitwatch) return fail("This athlete has no active HitWatch case.", 400);
    const d = day ?? Math.max(...a.hitwatch.calls.map((c) => c.day), -1) + 1;
    const t = transcript?.length ? transcript : demoTranscript(a.name.split(" ")[0], a.hitwatch.hit_description);
    const run = await runAgentOnTranscript(athlete_id, d, t);
    return ok({ day: d, transcript: t, run });
  } catch (e) {
    console.error("[simulate]", e);
    return fail(`HitWatch processing failed: ${errorMessage(e)}`, 500);
  }
}

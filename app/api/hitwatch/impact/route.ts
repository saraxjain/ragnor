import { ok, fail, readJson, errorMessage, toolAuthorized } from "@/lib/http.ts";
import { createHit, getAthlete } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

/** Mouthguard / impact-sensor webhook (simulated in the demo). Starts HitWatch above the threshold. */
const THRESHOLD_G = 60;

export async function POST(req: Request) {
  if (!toolAuthorized(req)) return fail("unauthorized", 401);
  try {
    const body = await readJson<{ athlete_id: string; impact_g?: number; description?: string; source?: string }>(req);
    if (!getAthlete(body.athlete_id)) return fail("Athlete not found", 404);
    const g = Number(body.impact_g ?? 68);
    if (g < THRESHOLD_G) return ok({ started: false, reason: `Impact ${g} g is under the ${THRESHOLD_G} g threshold. Logged only.` });
    const hit = createHit(body.athlete_id, {
      description: body.description ?? "in today's practice",
      source: body.source ?? "mouthguard_impact (simulated)",
      impact_g: g,
    });
    return ok({ started: true, hit });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

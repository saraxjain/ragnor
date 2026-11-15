import { ok, fail, readJson } from "@/lib/http.ts";
import { clearWearable, getAthlete, setSampleWearable, TODAY } from "@/lib/store.ts";
import { SAMPLE_SCENARIOS, isSampleScenario, sampleWearable } from "@/lib/sampleWearable.ts";

export const dynamic = "force-dynamic";

/** The sample scenarios on offer. */
export async function GET() {
  return ok({ scenarios: Object.entries(SAMPLE_SCENARIOS).map(([id, s]) => ({ id, label: s.label, blurb: s.blurb })) });
}

/** POST { athlete_id, scenario } loads 28 nights of sample watch data. scenario "none" removes watch data. */
export async function POST(req: Request) {
  let b: { athlete_id?: unknown; scenario?: unknown };
  try {
    b = await readJson(req);
  } catch {
    return fail("Request body must be JSON.");
  }
  const a = typeof b.athlete_id === "string" ? getAthlete(b.athlete_id) : undefined;
  if (!a) return fail("Athlete not found.", 404);
  if (b.scenario === "none") return ok({ scenario: null, risk: clearWearable(a.id) });
  if (!isSampleScenario(b.scenario)) return fail("Choose one of the sample scenarios.");
  const w = sampleWearable(b.scenario, a.id, TODAY);
  const risk = setSampleWearable(a.id, b.scenario, SAMPLE_SCENARIOS[b.scenario].label, w.recent, w.baseline_days, "Fitbit Charge");
  return ok({ scenario: b.scenario, label: SAMPLE_SCENARIOS[b.scenario].label, nights: w.recent.length + w.baseline_days.length, risk });
}

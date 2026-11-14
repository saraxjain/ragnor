import { ok, fail, readJson, errorMessage } from "@/lib/http.ts";
import { generateStructured, loadPrompt, live } from "@/lib/gemini.ts";
import { getAthlete, setFixPlan, type FixPlan } from "@/lib/store.ts";
import { sanitizeDeep } from "@/shared/lib/index.ts";

export const dynamic = "force-dynamic";

const schema = {
  type: "object",
  properties: {
    focus: { type: "string" },
    warmup: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          sets: { type: "string" },
          reps_or_time: { type: "string" },
          cue: { type: "string" },
          targets: { type: "array", items: { type: "string" } },
        },
        required: ["name", "sets", "reps_or_time", "cue", "targets"],
      },
    },
    retest_in_days: { type: "integer" },
  },
  required: ["focus", "warmup", "retest_in_days"],
};

const LIBRARY: Record<string, FixPlan["warmup"][number]> = {
  knee_valgus_contact: { name: "Lateral band walks", sets: "2", reps_or_time: "10 steps each way", cue: "Push your knees out against the band.", targets: ["knee_valgus_contact", "knee_valgus_max"] },
  knee_valgus_max: { name: "Single-leg squat to box", sets: "2", reps_or_time: "6 each leg", cue: "Knee tracks over your second toe.", targets: ["knee_valgus_max"] },
  stiff_landing_overall: { name: "Squat jumps with soft landing", sets: "2", reps_or_time: "6 reps", cue: "Land like a feather: hips back, knees bent.", targets: ["stiff_landing_overall", "knee_flexion_contact"] },
  knee_flexion_contact: { name: "Drop-and-stick landings", sets: "2", reps_or_time: "5 reps", cue: "Freeze for two seconds in a deep, quiet landing.", targets: ["knee_flexion_contact"] },
  asymmetric_foot_contact: { name: "Two-foot pogo hops", sets: "2", reps_or_time: "15 seconds", cue: "Both feet hit together, every time.", targets: ["asymmetric_foot_contact"] },
  trunk_flexion_contact: { name: "Hip hinge with dowel", sets: "2", reps_or_time: "8 reps", cue: "Chest over knees as you land.", targets: ["trunk_flexion_contact"] },
  lateral_trunk_lean: { name: "Side plank", sets: "2", reps_or_time: "20 seconds each side", cue: "Stay in one straight line.", targets: ["lateral_trunk_lean"] },
};

function fallbackPlan(errors: string[]): FixPlan {
  const picked = new Map<string, FixPlan["warmup"][number]>();
  for (const e of errors) if (LIBRARY[e]) picked.set(LIBRARY[e].name, LIBRARY[e]);
  const always = [
    { name: "Glute bridges", sets: "2", reps_or_time: "10 reps", cue: "Squeeze at the top for a second.", targets: ["knee_valgus_max"] },
    { name: "Single-leg balance, eyes forward", sets: "2", reps_or_time: "30 seconds each leg", cue: "Soft knee, steady hips.", targets: ["knee_valgus_contact"] },
    { name: "Nordic hamstring lowers (partner)", sets: "1", reps_or_time: "5 reps", cue: "Lower as slowly as you can.", targets: ["stiff_landing_overall"] },
  ];
  for (const x of always) if (picked.size < 6) picked.set(x.name, x);
  return {
    focus: errors.length ? "This week: land softly with your knees tracking over your toes." : "Keep your clean landing: soft knees and quiet feet.",
    warmup: [...picked.values()].slice(0, 6),
    retest_in_days: 7,
  };
}

export async function POST(req: Request) {
  try {
    const { athlete_id } = await readJson<{ athlete_id: string }>(req);
    const a = getAthlete(athlete_id);
    if (!a?.landing) return fail("Run LandingCheck first.", 400);
    const errors = a.landing.result.items.filter((i) => i.present && i.confidence >= 0.5).map((i) => i.id);
    let plan: FixPlan;
    let mode: "gemini" | "library" = "library";
    if (live.gemini()) {
      try {
        plan = await generateStructured<FixPlan>({
          parts: [{ text: `${loadPrompt("fixplan")}\n\nLandingCheck result:\n${JSON.stringify(a.landing.result.items.filter((i) => i.present && i.confidence >= 0.5))}` }],
          schema,
        });
        mode = "gemini";
      } catch (e) {
        console.error("[fixplan] gemini failed, using library", e);
        plan = fallbackPlan(errors);
      }
    } else plan = fallbackPlan(errors);
    const clean = sanitizeDeep(plan);
    setFixPlan(athlete_id, clean);
    return ok({ mode, plan: clean });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

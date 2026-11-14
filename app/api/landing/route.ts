import { ok, fail, errorMessage } from "@/lib/http.ts";
import { generateStructured, loadPrompt, live } from "@/lib/gemini.ts";
import { getAthlete, setLanding } from "@/lib/store.ts";
import { sanitizeDeep, type LandingResult } from "@/shared/lib/index.ts";
import landingSchema from "@/shared/schemas/landing.schema.json";
import seed from "@/shared/data/seed.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 18 * 1024 * 1024; // inline video limit (keep requests under ~20 MB)

function demoResult(): LandingResult {
  const jordan = seed.athletes.find((a) => a.id === "ath_02")!;
  return jordan.landing.result as LandingResult;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const athleteId = String(form.get("athlete_id") ?? "");
    const video = form.get("video");
    const useDemo = form.get("demo") === "1";
    if (!getAthlete(athleteId)) return fail("Choose an athlete first.", 404);

    let result: LandingResult;
    let mode: "gemini" | "demo";
    if (!useDemo && video instanceof File && video.size > 0) {
      if (!live.gemini()) return fail("Gemini isn't configured on this server yet (GEMINI_API_KEY). Try the demo clip.", 503);
      if (video.size > MAX_BYTES) return fail("That video is over 18 MB. Trim it to the 5-10 seconds around the landing.", 413);
      if (!video.type.startsWith("video/")) return fail("Please upload a video file (mp4, mov or webm).", 415);
      const data = Buffer.from(await video.arrayBuffer()).toString("base64");
      result = await generateStructured<LandingResult>({
        parts: [{ inlineData: { mimeType: video.type, data } }, { text: loadPrompt("landingcheck") }],
        schema: landingSchema,
      });
      mode = "gemini";
    } else {
      result = demoResult();
      mode = "demo";
    }

    const blocked: string[] = [];
    const clean = sanitizeDeep(result, blocked);
    clean.items = (clean.items ?? []).sort((x, y) => Number(y.present) - Number(x.present) || x.timestamp_s - y.timestamp_s);
    const score = setLanding(athleteId, clean);
    return ok({ mode, result: clean, score, guardrail_blocked: blocked });
  } catch (e) {
    console.error("[landing]", e);
    return fail(`LandingCheck couldn't analyze that video: ${errorMessage(e)}`, 500);
  }
}

import { ok, fail, errorMessage } from "@/lib/http.ts";
import { generateStructured, loadPrompt, live, friendlyGeminiError } from "@/lib/gemini.ts";
import { addCheckin, getAthlete, TODAY } from "@/lib/store.ts";
import { sanitizeDeep, RED_FLAG_MESSAGE, type CheckIn } from "@/shared/lib/index.ts";
import checkinSchema from "@/shared/schemas/checkin.schema.json";
import { parseCheckinText as roughParse, type Extracted } from "@/shared/lib/extract.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const athleteId = String(form.get("athlete_id") ?? "");
    const audio = form.get("audio");
    const structured = form.get("structured");
    const text = String(form.get("text") ?? "").trim();
    const a = getAthlete(athleteId);
    if (!a) return fail("Athlete not found.", 404);

    let ex: Extracted;
    let mode: "tap" | "gemini_audio" | "gemini_text" | "offline";
    let extras: { meals: number | null; effort: number | null; activities: string[] } = { meals: null, effort: null, activities: [] };
    if (typeof structured === "string" && structured) {
      // 60-second tap check-in (from the team's app design): already structured, no AI needed.
      const t = JSON.parse(structured) as { sleep_h: number; soreness: Record<string, number>; load_min: number; effort: number; activities: string[]; meals: number; took_hit: boolean; symptoms: string[] };
      const effort = Math.max(1, Math.min(10, Math.round(Number(t.effort) || 5)));
      ex = {
        sleep_h: Number(t.sleep_h) || null,
        soreness: Object.entries(t.soreness ?? {}).map(([area, level]) => ({ area, level: Number(level) })),
        load_min: Number(t.load_min) || 0,
        intensity: effort >= 8 ? "hard" : effort >= 5 ? "moderate" : "light",
        took_hit: Boolean(t.took_hit),
        symptoms: (t.symptoms ?? []).filter((x) => typeof x === "string"),
        red_flags: [],
        transcript_summary: "Tap check-in",
      };
      extras = { meals: Math.max(0, Math.min(3, Number(t.meals) || 0)), effort, activities: (t.activities ?? []).slice(0, 8) };
      mode = "tap";
    } else if (audio instanceof File && audio.size > 0) {
      if (!live.gemini()) return fail("Voice check-ins need Gemini (GEMINI_API_KEY). You can type your check-in instead.", 503);
      const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
      try {
        ex = await generateStructured<Extracted>({
          parts: [{ inlineData: { mimeType: audio.type || "audio/webm", data } }, { text: loadPrompt("checkin") + "\n\nThe audio is a finished recording; do not ask questions, just extract." }],
          schema: checkinSchema,
        });
      } catch (e) {
        return fail(`${friendlyGeminiError(e)} Meanwhile, the Tap check-in works without Gemini.`, 503);
      }
      mode = "gemini_audio";
    } else if (text) {
      if (live.gemini()) {
        try {
          ex = await generateStructured<Extracted>({
            parts: [{ text: `${loadPrompt("checkin")}\n\nThe athlete typed this check-in (extract only, do not ask questions):\n"""${text}"""` }],
            schema: checkinSchema,
          });
          mode = "gemini_text";
        } catch (e) {
          // Gemini busy or down: read the typed check-in with the offline parser instead of failing.
          console.warn("[checkin] Gemini failed, using offline parser:", friendlyGeminiError(e));
          ex = roughParse(text);
          mode = "offline";
        }
      } else {
        ex = roughParse(text);
        mode = "offline";
      }
      if (ex.meals != null) extras.meals = ex.meals;
    } else return fail("Record or type a check-in first.", 400);

    const clean = sanitizeDeep(ex);
    const checkin: CheckIn = {
      date: TODAY,
      sleep_h: clean.sleep_h ?? null,
      soreness: (clean.soreness ?? []).map((s) => ({ area: s.area, level: Math.max(0, Math.min(3, Math.round(s.level))) })),
      load_min: clean.load_min ?? null,
      intensity: clean.intensity ?? "unknown",
      took_hit: Boolean(clean.took_hit),
      symptoms: clean.symptoms ?? [],
      red_flags: clean.red_flags ?? [],
      meals: extras.meals,
      effort: extras.effort,
      activities: extras.activities,
    };
    const risk = addCheckin(athleteId, checkin);
    return ok({
      mode,
      checkin,
      summary: clean.transcript_summary,
      risk,
      red_flag_message: checkin.red_flags.length ? RED_FLAG_MESSAGE : null,
    });
  } catch (e) {
    console.error("[checkin]", e);
    return fail(`Check-in failed: ${errorMessage(e)}`, 500);
  }
}

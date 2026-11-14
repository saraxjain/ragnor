import { ok, fail, errorMessage } from "@/lib/http.ts";
import { generateStructured, loadPrompt, live, friendlyGeminiError, withGeminiRetry } from "@/lib/gemini.ts";
import { addCheckin, getAthlete, TODAY } from "@/lib/store.ts";
import { sanitizeDeep, RED_FLAG_MESSAGE, type CheckIn } from "@/shared/lib/index.ts";
import { withTimeout } from "@/lib/checkinResult.ts";
import checkinSchema from "@/shared/schemas/checkin.schema.json";
import { parseCheckinText as roughParse, type Extracted } from "@/shared/lib/extract.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const GEMINI_TIMEOUT_MS = 30_000; // a hung model becomes a friendly error instead of spinning forever

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
    let mode: "tap" | "gemini_audio" | "gemini_text" | "gemini_adk" | "offline";
    let extras: { meals: number | null; effort: number | null; activities: string[] } = { meals: null, effort: null, activities: [] };
    if (typeof structured === "string" && structured) {
      // 60-second tap check-in (from the team's app design): already structured, no AI needed.
      const t = JSON.parse(structured) as { sleep_h: number | null; soreness: Record<string, number>; load_min: number | null; effort: number | null; intensity?: string; activities: string[]; meals: number | null; took_hit: boolean; symptoms: string[]; red_flags?: string[] };
      const hasEffort = t.effort != null && Number(t.effort) > 0;
      const effort = hasEffort ? Math.max(1, Math.min(10, Math.round(Number(t.effort)))) : null;
      ex = {
        sleep_h: t.sleep_h == null ? null : Number(t.sleep_h) || null,
        soreness: Object.entries(t.soreness ?? {}).map(([area, level]) => ({ area, level: Number(level) })),
        load_min: t.load_min == null ? null : Number(t.load_min) || 0, // null stays null: never guessed (check-in edits keep what was not said)
        intensity: effort != null ? (effort >= 8 ? "hard" : effort >= 5 ? "moderate" : "light") : (["light", "moderate", "hard"].includes(String(t.intensity)) ? (t.intensity as CheckIn["intensity"]) : "unknown"),
        took_hit: Boolean(t.took_hit),
        symptoms: (t.symptoms ?? []).filter((x) => typeof x === "string"),
        red_flags: (t.red_flags ?? []).filter((x) => typeof x === "string").slice(0, 12),
        transcript_summary: "Tap check-in",
      };
      extras = { meals: t.meals == null ? null : Math.max(0, Math.min(3, Number(t.meals) || 0)), effort, activities: (t.activities ?? []).slice(0, 8) };
      mode = "tap";
    } else if (audio instanceof File && audio.size > 0) {
      if (!live.gemini()) return fail("Voice check-ins need Gemini (GEMINI_API_KEY). You can type your check-in instead.", 503);
      const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
      try {
        ex = await withTimeout(generateStructured<Extracted>({
          parts: [{ inlineData: { mimeType: audio.type || "audio/webm", data } }, { text: loadPrompt("checkin") + "\n\nThe audio is a finished recording; do not ask questions, just extract." }],
          schema: checkinSchema,
        }), GEMINI_TIMEOUT_MS);
      } catch (e) {
        return fail(`${friendlyGeminiError(e)} Meanwhile, the Tap check-in works without Gemini.`, 503);
      }
      mode = "gemini_audio";
    } else if (text) {
      // The check-in agent may have asked one follow-up question; the answer comes back with the original text.
      const followupQ = String(form.get("followup_question") ?? "").trim().slice(0, 200);
      const followupA = String(form.get("followup_answer") ?? "").trim().slice(0, 500);
      const fullText = [text, followupA].filter(Boolean).join("\n");
      if (live.gemini()) {
        try {
          // Default engine: an ADK agent that may ask one follow-up question. Set CHECKIN_ENGINE=genai for plain structured output.
          let viaAdk: Extracted | null = null;
          if ((process.env.CHECKIN_ENGINE || "adk") === "adk") {
            try {
              const { runCheckinAgent } = await import("@/lib/checkinAdk.ts");
              const asked = form.get("followup_done") === "1" || Boolean(followupQ);
              // Same retry and fallback-model chain as every other Gemini call (a busy model is common).
              const r = await withTimeout(withGeminiRetry((model) => runCheckinAgent<Extracted>({
                text,
                instruction: loadPrompt("checkin"),
                schema: checkinSchema,
                model,
                followup: asked ? { question: followupQ || "(skipped)", answer: followupA || "(the athlete skipped the question)" } : null,
              })), GEMINI_TIMEOUT_MS);
              // Nothing is saved yet: the athlete answers (or skips), then the check-in is sent again.
              if (r.kind === "followup") return ok({ mode: "followup", missing: r.missing, question: r.question });
              viaAdk = r.extracted;
            } catch (e) {
              console.error("[checkin] ADK agent failed, falling back to Gemini structured output", e);
            }
          }
          if (viaAdk) {
            ex = viaAdk;
            mode = "gemini_adk";
          } else {
            ex = await withTimeout(generateStructured<Extracted>({
              parts: [{ text: `${loadPrompt("checkin")}\n\nThe athlete typed this check-in (extract only, do not ask questions):\n"""${fullText}"""` }],
              schema: checkinSchema,
            }), GEMINI_TIMEOUT_MS);
            mode = "gemini_text";
          }
        } catch (e) {
          // Gemini busy or down: read the typed check-in with the offline parser instead of failing.
          console.warn("[checkin] Gemini failed, using offline parser:", friendlyGeminiError(e));
          ex = roughParse(fullText);
          mode = "offline";
        }
      } else {
        ex = roughParse(fullText);
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
    // Emergency signs can be added but never removed by a later edit of the same day's check-in.
    const prior = a.checkins.find((c) => c.date === TODAY);
    if (prior?.red_flags.length) checkin.red_flags = [...new Set([...prior.red_flags, ...checkin.red_flags])];
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

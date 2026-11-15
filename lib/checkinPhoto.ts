// Reads a photo attached to a check-in (a sore ankle, a bruise, a taped knee).
// Gemini only describes what is visible and picks from fixed lists. It never diagnoses, and it does not set the risk level:
// the description is used to choose follow-up questions (lib/followups.ts), and the athlete's answers go to the rules engine.
import { generateStructured, live } from "./gemini.ts";
import { sanitize } from "../shared/lib/index.ts";
import type { CheckinPhoto } from "../shared/lib/types.ts";

export const PHOTO_AREAS = ["neck", "shoulder_l", "shoulder_r", "lower_back", "hip_l", "hip_r", "hamstring_l", "hamstring_r", "quad_l", "quad_r", "knee_l", "knee_r", "calf_l", "calf_r", "ankle_l", "ankle_r", "other"] as const;
export const PHOTO_SIGNS = ["swelling", "bruising", "redness", "cut_or_scrape", "tape_or_brace"] as const;
export const PHOTO_MAX_BYTES = 6 * 1024 * 1024;
export const UNREAD_NOTE = "Photo attached. It was not read by AI, so the questions below are based on your check-in.";

const SCHEMA = {
  type: "object",
  properties: {
    shows_body_part: { type: "boolean", description: "True only if the photo clearly shows part of a person's body." },
    area: { type: "string", enum: [...PHOTO_AREAS], description: "The body area shown. Use 'other' if it is not in the list or the side (left/right) is unclear and no hint was given." },
    signs: { type: "array", items: { type: "string", enum: [...PHOTO_SIGNS] }, description: "Only what is clearly visible. Empty if nothing stands out." },
    note: { type: "string", description: "One short neutral sentence describing what is visible, addressed to the athlete. No diagnosis, no advice." },
  },
  required: ["shows_body_part", "area", "signs", "note"],
};

const PROMPT = `A high-school athlete attached this photo to their daily check-in to show a sore or injured spot.
Describe only what is visible. Do NOT name an injury or condition, do NOT judge how serious it is, and do NOT say whether they can train or play.
If the photo does not clearly show a body part, set shows_body_part to false and say so in the note.`;

/** Keeps only listed values and one sanitized sentence, whatever the model returned. */
export function cleanPhoto(raw: unknown): CheckinPhoto {
  const r = (raw ?? {}) as { shows_body_part?: unknown; area?: unknown; signs?: unknown; note?: unknown };
  const shows = r.shows_body_part === true;
  const area = shows ? PHOTO_AREAS.find((x) => x === r.area) ?? null : null;
  const signs = shows && Array.isArray(r.signs) ? PHOTO_SIGNS.filter((s) => (r.signs as unknown[]).includes(s)) : [];
  const text = typeof r.note === "string" ? r.note.trim().slice(0, 220) : "";
  const safe = sanitize(text);
  // A note the guardrail had to change is dropped for a fixed sentence rather than shown half-edited.
  const note = text && !safe.changed ? text : shows ? "The photo was received and looked at." : "The photo does not clearly show a body part.";
  return { read: true, area, signs: [...signs], note };
}

export async function readPhoto(photo: File, soreAreas: string[]): Promise<CheckinPhoto> {
  if (!live.gemini()) return { read: false, area: null, signs: [], note: UNREAD_NOTE };
  const data = Buffer.from(await photo.arrayBuffer()).toString("base64");
  const hint = soreAreas.length ? `\nThe athlete marked these areas as sore today: ${soreAreas.join(", ")}. Use that to decide left or right if the photo alone does not show it.` : "";
  const raw = await generateStructured<unknown>({ parts: [{ inlineData: { mimeType: photo.type || "image/jpeg", data } }, { text: PROMPT + hint }], schema: SCHEMA, temperature: 0.1 });
  return cleanPhoto(raw);
}

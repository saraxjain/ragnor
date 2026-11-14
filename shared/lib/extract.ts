// Deterministic check-in parser: the production fallback when Gemini is unavailable, and the eval baseline.
import type { CheckIn } from "./types.ts";

export interface Extracted {
  sleep_h: number | null;
  soreness: { area: string; level: number }[];
  load_min: number | null;
  intensity: CheckIn["intensity"];
  took_hit: boolean;
  symptoms: string[];
  red_flags: string[];
  transcript_summary: string;
  meals?: number | null;
}

export const RED_FLAGS: Record<string, RegExp> = {
  repeated_vomiting: /threw up|vomit|throwing up/,
  seizure: /seizure|convuls/,
  worsening_headache: /(headache|head)[^.]{0,40}(getting (much )?worse|worst|unbearable)/,
  confusion: /confus|can'?t remember (today|where|what day)/,
  slurred_speech: /slurr/,
  weakness_or_numbness: /numb|tingl|can'?t feel/,
  loss_of_consciousness: /passed out|blacked out|knocked out/,
  chest_pain: /chest (pain|hurts|tight)|heart (racing|pounding) (at rest|while resting)/,
  fainting: /faint/,
};
const NEG = /\b(no|not|never|didn'?t|haven'?t|wasn'?t)\b[^.,]{0,25}$/;
const negated = (t: string, i: number) => NEG.test(t.slice(Math.max(0, i - 30), i));
const AREAS: [RegExp, string][] = [
  [/left hamstring/, "hamstring_l"], [/right hamstring/, "hamstring_r"], [/hamstring/, "hamstring_l"],
  [/left knee/, "knee_l"], [/right knee/, "knee_r"], [/knee/, "knee_r"],
  [/left ankle/, "ankle_l"], [/right ankle/, "ankle_r"], [/ankle/, "ankle_r"],
  [/calf|calves/, "calf_l"], [/quad/, "quad_l"], [/(lower )?back/, "lower_back"], [/shoulder/, "shoulder_r"], [/neck/, "neck"], [/hip/, "hip_r"],
];
const WORDS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };

export function parseCheckinText(text: string): Extracted {
  const t = text.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => WORDS[w]);
  const num = (re: RegExp) => { const m = t.match(re); return m ? Number(m[1]) : null; };
  const soreness: Extracted["soreness"] = [];
  for (const [re, area] of AREAS) {
    const m = re.exec(t);
    if (!m || negated(t, m.index) || soreness.some((s) => s.area.split("_")[0] === area.split("_")[0])) continue;
    const near = t.slice(Math.max(0, m.index - 40), m.index + 50);
    if (!/sore|tight|hurt|ache|pain|tweak|stiff|\b[1-3]\s*(?:\/|out of)\s*3\b/.test(near)) continue;
    const lvl = near.match(/\b([1-3])\s*(?:\/|out of)\s*3\b/);
    soreness.push({ area, level: lvl ? Number(lvl[1]) : /really|very|bad|severe|can'?t (walk|run|put weight)|limp/.test(near) ? 3 : /sore|tight|hurt/.test(near) ? 2 : 1 });
  }
  const red_flags = Object.entries(RED_FLAGS).filter(([, re]) => { const m = re.exec(t); return m && !negated(t, m.index); }).map(([k]) => k);
  const meals = /skipped (breakfast and lunch|lunch and breakfast|every meal)|haven'?t eaten|didn'?t eat|no meals?/.test(t) ? (/haven'?t eaten|didn'?t eat|no meals?|every meal/.test(t) ? 0 : 1) : num(/(?:only|just) (?:had )?(\d) meals?/) ?? num(/(\d) meals?/);
  const hours = t.match(/(\d+(?:\.\d)?)\s*(?:hours?|hrs|h)\b(?! practice)/);
  return {
    sleep_h: hours && /sle(e|p)|night|bed/.test(t) ? Number(hours[1]) : null,
    soreness,
    load_min: num(/(\d+)\s*(?:min|minutes)/) ?? (t.match(/(\d+(?:\.\d)?)\s*(?:hour|hr) (?:practice|session|training)/) ? Number(t.match(/(\d+(?:\.\d)?)\s*(?:hour|hr) (?:practice|session|training)/)![1]) * 60 : null),
    intensity: /brutal|hard|intense|tough|conditioning/.test(t) ? "hard" : /easy|light|walkthrough|recovery/.test(t) ? "light" : "moderate",
    took_hit: /\b(collid|header|elbow to|knocked|got hit|took a hit)\b/.test(t),
    symptoms: ["headache", "dizzy", "nausea"].filter((s) => { const i = t.indexOf(s); return i >= 0 && !negated(t, i); }).map((s) => (s === "dizzy" ? "dizziness" : s)),
    red_flags,
    transcript_summary: text.slice(0, 160),
    meals: meals == null ? null : Math.max(0, Math.min(3, meals)),
  };
}

export const askedClearance = (text: string) => /(can|could|should) i (play|practice|go)|am i (cleared|ok to|good to|fine to)|cleared/i.test(text);

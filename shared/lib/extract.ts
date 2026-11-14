// Deterministic symptom + red-flag extractor for HitWatch call transcripts (offline engine and eval baseline).
export const SYMPTOMS: Record<string, RegExp> = {
  headache: /head ?ache|head (hurts|is pounding)/,
  pressure_in_head: /pressure/,
  dizziness: /dizz|spinning/,
  nausea: /nause|sick to (my|her|his) stomach|queasy/,
  light_sensitivity: /light/,
  noise_sensitivity: /noise|loud|sound/,
  feeling_in_a_fog: /fog|foggy|slowed down/,
  difficulty_concentrating: /concentrat|focus/,
  fatigue: /tired|fatigue|exhausted/,
  trouble_sleeping: /can'?t sleep|trouble sleeping|couldn'?t sleep/,
};
export const RED_FLAGS: Record<string, RegExp> = {
  repeated_vomiting: /(threw up|vomit|throwing up)/,
  seizure: /seizure|convuls/,
  worsening_headache: /(headache|head)[^.]{0,40}(getting much worse|worst|keeps getting worse|unbearable)/,
  confusion: /confus|don'?t know where|can'?t remember (today|where|what day)/,
  slurred_speech: /slurr/,
  weakness_or_numbness: /numb|tingl|weak(ness)? in|can'?t feel/,
  loss_of_consciousness: /passed out|blacked out|knocked out/,
  unequal_pupils: /pupil/,
  cannot_wake: /can'?t wake|hard to wake/,
};
const WORDS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6" };
const NEG = /\b(no|not|none|never|don'?t|didn'?t|haven'?t)\b[^.,]{0,25}$/;

export interface Extraction { symptoms: Record<string, number>; red_flags: string[]; worse_than_yesterday: boolean; asked_clearance: boolean }

export function extractOffline(athleteText: string): Extraction {
  const text = athleteText.toLowerCase().replace(/\b(zero|one|two|three|four|five|six)\b/g, (w) => WORDS[w]);
  const symptoms: Record<string, number> = {};
  for (const [name, re] of Object.entries(SYMPTOMS)) {
    const m = re.exec(text);
    if (!m) continue;
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (NEG.test(before)) continue;
    const after = text.slice(m.index, m.index + 70).match(/\b([0-6])\b/);
    symptoms[name] = after ? Number(after[1]) : 2;
  }
  const red_flags = Object.entries(RED_FLAGS).filter(([, re]) => {
    const m = re.exec(text);
    return m && !NEG.test(text.slice(Math.max(0, m.index - 30), m.index));
  }).map(([k]) => k);
  return {
    symptoms,
    red_flags,
    worse_than_yesterday: /worse than yesterday|worse today/.test(text),
    asked_clearance: /(can|could) i (play|practice)|am i (cleared|ok to|good to|fine)|cleared/.test(text),
  };
}

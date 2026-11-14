// Deterministic red-flag phrase scan of a conversation transcript. Independent of any model; the second check for HitWatch.
//
// UNVALIDATED: a small, explicit, hand-written synonym map. Not reviewed by a clinician; it will miss phrasings.
// Targets are the existing red-flag symptom ids (CDC HEADS UP danger signs and the founders' unvalidated list).
//
// Negation policy: a negated mention ("no numbness", "didn't pass out") STILL produces a prompt, flagged `negatedNearby`, so the
// athlete or a human answers yes/no. Asking is the safe default; no negation logic is ever relied on to suppress a prompt.
import { symptomLabel } from "../rules/symptoms";

interface Rule {
  id: string;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  { id: "cdc_loss_of_consciousness", patterns: [/\bpass(?:ed|ing)? out\b/i, /\bblack(?:ed|ing)?[ -]?out\b/i, /\bknocked (?:out|unconscious)\b/i, /\blost consciousness\b/i, /\bunconscious\b/i, /\bfaint(?:ed|ing)\b/i, /\bout cold\b/i] },
  { id: "cdc_repeated_vomiting", patterns: [/\bthr(?:ew|ow|owing|own) up\b/i, /\bvomit\w*/i, /\bpuk(?:e|ed|ing)\b/i] },
  { id: "cdc_seizure", patterns: [/\bseizure/i, /\bseizing\b/i, /\bconvuls\w*/i] },
  { id: "numbness", patterns: [/\bnumb(?:ness)?\b/i, /\b(?:can(?:'|’)?t|cannot|couldn(?:'|’)?t|can not) feel\b/i, /\bno feeling in\b/i] },
  { id: "cdc_slurred_speech", patterns: [/\bslurr(?:ed|ing)\b/i] },
  { id: "cdc_pupil_or_double_vision", patterns: [/\bdouble vision\b/i, /\bseeing double\b/i, /\bpupils?\b/i] },
  {
    id: "cdc_worsening_headache",
    patterns: [
      /\bworst headache\b/i,
      /\bheadache\b[^.!?]{0,40}\b(?:worse|worsening|won(?:'|’)?t (?:go away|stop)|not going away|doesn(?:'|’)?t go away|keeps? getting)\b/i,
      /\b(?:getting|gets|got) worse\b[^.!?]{0,30}\bheadache\b/i,
    ],
  },
  { id: "cdc_unusual_behavior", patterns: [/\bconfus(?:ed|ion)\b/i, /\bagitat(?:ed|ion)\b/i, /\brestless(?:ness)?\b/i] },
  { id: "cdc_not_recognizing", patterns: [/\b(?:didn(?:'|’)?t|did not|don(?:'|’)?t|do not|couldn(?:'|’)?t) (?:know|recogni[sz]e)\b[^.!?]{0,25}\b(?:where|who|people|place)\b/i, /\bnot able to recogni[sz]e\b/i] },
  { id: "swelling", patterns: [/\bswell(?:ing|s)\b/i, /\bswollen\b/i, /\bswelled\b/i] },
  { id: "pop", patterns: [/\ba pop\b/i, /\bpop(?:ped|ping)\b/i, /\bpopping sound\b/i, /\bheard (?:a )?pop\b/i, /\bfelt (?:a )?pop\b/i] },
  { id: "weakness", patterns: [/\bweakness\b/i, /\bweak\b/i] },
  { id: "recurring_spasms", patterns: [/\bspasm/i] },
];

export interface RedFlagHit {
  symptomId: string;
  label: string;
  /** The exact words matched in the transcript. */
  phrases: string[];
  /** A negation word appears shortly before a match. The athlete is still asked. */
  negatedNearby: boolean;
}

const NEGATION = /\b(?:no|not|never|without|n(?:'|’)?t|none|zero)\b[^.!?]{0,25}$/i;

export function scanRedFlags(transcript: string): RedFlagHit[] {
  const hits: RedFlagHit[] = [];
  for (const rule of RULES) {
    const phrases = new Set<string>();
    let negated = false;
    for (const re of rule.patterns) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      for (const m of transcript.matchAll(g)) {
        phrases.add(m[0]);
        const before = transcript.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
        if (NEGATION.test(before)) negated = true;
      }
    }
    if (phrases.size > 0) hits.push({ symptomId: rule.id, label: symptomLabel(rule.id), phrases: [...phrases], negatedNearby: negated });
  }
  return hits;
}

/** Every red-flag symptom id that has at least one scan rule (tests assert this covers the whole red-flag list). */
export const SCANNED_SYMPTOM_IDS: string[] = RULES.map((r) => r.id);

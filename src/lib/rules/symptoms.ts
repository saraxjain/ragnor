// Symptom vocabulary used by the check-in, the impact follow-up and the rules engine.
//
// UNVALIDATED PLACEHOLDER CONTENT: nothing in this file has been reviewed by a clinician.

export interface SymptomDef {
  id: string;
  label: string;
  redFlag: boolean;
  source: "cdc-heads-up" | "founders-doc-unvalidated" | "general-checklist-unvalidated";
}

// ---------------------------------------------------------------------------------------------
// Red-flag list 1: CDC HEADS UP concussion danger signs.
// Source: https://www.cdc.gov/heads-up/signs-symptoms/index.html
//   ("Signs and Symptoms of Concussion | HEADS UP | CDC", danger signs section)
// Accessed: 2026-11-14 (page fetched successfully, HTTP 200; wording below matches the page).
// The page also lists extra danger signs for infants and toddlers ("Will not stop crying and cannot
// be consoled", "Will not nurse or eat"); they are intentionally omitted because Ragnor is for athletes.
// ---------------------------------------------------------------------------------------------
export const CDC_DANGER_SIGNS: SymptomDef[] = [
  { id: "cdc_seizure", label: "Convulsions or seizures (shaking or twitching)" },
  { id: "cdc_not_recognizing", label: "Not able to recognize people or places" },
  { id: "cdc_repeated_vomiting", label: "Repeated nausea or vomiting" },
  { id: "cdc_unusual_behavior", label: "Unusual behavior, increased confusion, restlessness, or agitation" },
  {
    id: "cdc_loss_of_consciousness",
    label: "Loss of consciousness with increasing drowsiness, inability to wake up, or inability to stay awake",
  },
  { id: "cdc_slurred_speech", label: "Slurred speech, weakness, numbness, or decreased coordination" },
  { id: "cdc_worsening_headache", label: "A headache that gets worse and does not go away" },
  { id: "cdc_pupil_or_double_vision", label: "One pupil larger than the other or double vision" },
].map((s) => ({ ...s, redFlag: true, source: "cdc-heads-up" as const }));

// ---------------------------------------------------------------------------------------------
// Red-flag list 2: non-concussion red flags from the founders' design doc.
// UNVALIDATED: not taken from a published source and not clinician-reviewed.
// ---------------------------------------------------------------------------------------------
export const FOUNDERS_RED_FLAGS_UNVALIDATED: SymptomDef[] = [
  { id: "numbness", label: "Numbness" },
  { id: "weakness", label: "Weakness" },
  { id: "swelling", label: "Swelling" },
  { id: "pop", label: "A pop felt or heard at the time of an injury" },
  { id: "recurring_spasms", label: "Spasms that keep returning" },
].map((s) => ({ ...s, redFlag: true, source: "founders-doc-unvalidated" as const }));

// Everyday symptom checklist (non-red-flag). UNVALIDATED placeholder; needs clinician review.
export const GENERAL_SYMPTOMS_UNVALIDATED: SymptomDef[] = [
  { id: "headache", label: "Headache" },
  { id: "dizziness", label: "Dizziness" },
  { id: "nausea", label: "Nausea" },
  { id: "light_sensitivity", label: "Sensitivity to light" },
  { id: "noise_sensitivity", label: "Sensitivity to noise" },
  { id: "foggy", label: "Feeling foggy or slowed down" },
  { id: "concentration", label: "Trouble concentrating" },
  { id: "balance", label: "Balance problems" },
  { id: "fatigue", label: "Unusual tiredness" },
].map((s) => ({ ...s, redFlag: false, source: "general-checklist-unvalidated" as const }));

export const RED_FLAG_SYMPTOMS: SymptomDef[] = [...CDC_DANGER_SIGNS, ...FOUNDERS_RED_FLAGS_UNVALIDATED];
export const ALL_SYMPTOMS: SymptomDef[] = [...RED_FLAG_SYMPTOMS, ...GENERAL_SYMPTOMS_UNVALIDATED];

const byId = new Map(ALL_SYMPTOMS.map((s) => [s.id, s]));
export const isKnownSymptom = (id: string): boolean => byId.has(id);
export const isRedFlagSymptom = (id: string): boolean => byId.get(id)?.redFlag === true;
export const symptomLabel = (id: string): string => byId.get(id)?.label ?? id;

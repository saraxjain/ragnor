// Plain-language "how a result is decided" data for the judges page. Everything numeric is read from THRESHOLDS and the
// rule objects at call time, never typed by hand, so changing a threshold changes the text.
import { RULES } from "../rules/rules";
import { THRESHOLDS, type THRESHOLDS as ThresholdsType } from "../rules/thresholds";
import { CDC_DANGER_SIGNS, FOUNDERS_RED_FLAGS_UNVALIDATED, GENERAL_SYMPTOMS_UNVALIDATED } from "../rules/symptoms";
import { FOLLOWUP_DAYS } from "../time";

type T = typeof ThresholdsType;

export interface ThresholdRow {
  key: string;
  value: number;
  meaning: string;
}

const MEANINGS: Record<keyof T, (t: T) => string> = {
  SHORT_SLEEP_HOURS: (t) => `A night is short when sleep is under ${t.SHORT_SLEEP_HOURS} hours (exactly ${t.SHORT_SLEEP_HOURS} is not short)`,
  SHORT_SLEEP_NIGHTS: (t) => `Short nights needed: ${t.SHORT_SLEEP_NIGHTS} or more`,
  WINDOW_DAYS: (t) => `Rolling window: the last ${t.WINDOW_DAYS} days ("this week") against the ${t.WINDOW_DAYS} before ("prior week")`,
  LOAD_INCREASE_PERCENT: (t) => `Load must rise by more than ${t.LOAD_INCREASE_PERCENT}% over the prior week (exactly ${t.LOAD_INCREASE_PERCENT}% does not count)`,
  SORENESS_PERSISTING_LEVEL: (t) => `Soreness counts as persisting at level ${t.SORENESS_PERSISTING_LEVEL} or higher (scale 0 to 3)`,
  SORENESS_PERSISTING_DAYS: (t) => `Persisting soreness needs ${t.SORENESS_PERSISTING_DAYS} consecutive days`,
  SORENESS_SEVERE_LEVEL: (t) => `Severe soreness is level ${t.SORENESS_SEVERE_LEVEL}`,
  SORENESS_SEVERE_DAYS: (t) => `Severe soreness escalates to high after ${t.SORENESS_SEVERE_DAYS} consecutive days`,
  MIN_SLEEP_NIGHTS_REPORTED: (t) => `Minimum nights with sleep reported: ${t.MIN_SLEEP_NIGHTS_REPORTED} of ${t.WINDOW_DAYS}`,
  MIN_LOAD_DAYS_PER_WEEK: (t) => `Minimum days with load reported in each week: ${t.MIN_LOAD_DAYS_PER_WEEK} of ${t.WINDOW_DAYS}`,
  LOOKBACK_DAYS: (t) => `Look-back window for stored inputs and red-flag checks: ${t.LOOKBACK_DAYS} days`,
  WEARABLE_BASELINE_DAYS: (t) => `Personal wearable baseline: the median of the previous ${t.WEARABLE_BASELINE_DAYS} days (heart-rate variability, resting heart rate, sleep)`,
  WEARABLE_MIN_BASELINE_DAYS: (t) => `Minimum baseline days with wearable data: ${t.WEARABLE_MIN_BASELINE_DAYS}`,
  HRV_DROP_PERCENT: (t) => `Heart-rate variability counts as low when it is ${t.HRV_DROP_PERCENT}% or more below the athlete's own baseline`,
  HITWATCH_ESCALATE_DELTA: (t) => `HitWatch escalates when today's symptom total is ${t.HITWATCH_ESCALATE_DELTA} or more points above the athlete's own baseline`,
  HITWATCH_SINGLE_SYMPTOM_SEVERE: (t) => `HitWatch also escalates when any single symptom is rated ${t.HITWATCH_SINGLE_SYMPTOM_SEVERE} (scale 0 to 3)`,
  LANDING_FLAG_BANDS: (t) => `A landing check raises a flag when its band is moderate or high (placeholder: ${t.LANDING_FLAG_BANDS} of 3 bands)`,
};

export function thresholdRows(t: T): ThresholdRow[] {
  return (Object.keys(MEANINGS) as (keyof T)[]).map((key) => ({ key, value: t[key] as number, meaning: MEANINGS[key](t) }));
}

/** "Fires when ..." sentences, written from the thresholds passed in. */
export function firesWhen(t: T): Record<string, string> {
  return {
    "sleep-load": `Sleep under ${t.SHORT_SLEEP_HOURS} hours on ${t.SHORT_SLEEP_NIGHTS} or more of the last ${t.WINDOW_DAYS} nights, and this week's training load more than ${t.LOAD_INCREASE_PERCENT}% above the prior week's. Result: moderate, general.`,
    "soreness-persisting": `Soreness of ${t.SORENESS_PERSISTING_LEVEL} or more in the same body area on ${t.SORENESS_PERSISTING_DAYS} consecutive days gives moderate for that area. It becomes high with the load increase above, or with soreness of ${t.SORENESS_SEVERE_LEVEL} on ${t.SORENESS_SEVERE_DAYS} consecutive days.`,
    "post-impact-symptom": `Any symptom logged in the ${FOLLOWUP_DAYS}-day window after a reported head impact gives high and alerts the trainer. A symptom first appearing on day 2 or later is labelled a delayed symptom.`,
    "red-flag": `Any red-flag symptom in the last ${t.LOOKBACK_DAYS} days gives urgent, "see a clinician now", and a trainer alert. Only this rule can produce urgent.`,
    "hrv-sleep": `Heart-rate variability ${t.HRV_DROP_PERCENT}% or more below the athlete's own ${t.WEARABLE_BASELINE_DAYS}-day median baseline, together with sleep under ${t.SHORT_SLEEP_HOURS} hours. Result: moderate, general. Needs at least ${t.WEARABLE_MIN_BASELINE_DAYS} baseline days.`,
    "landing-band": "A landing check from the video pipeline whose band is moderate or high becomes a flag at that level, with the items that were present. Placeholder mapping, not clinically validated.",
    "hitwatch-escalation": `On a HitWatch follow-up day, today's symptom total is ${t.HITWATCH_ESCALATE_DELTA} or more points above the athlete's own pre-impact baseline, or any single symptom is rated ${t.HITWATCH_SINGLE_SYMPTOM_SEVERE}. Result: high, with a reviewer alert.`,
    "unconfirmed-red-flag": "A follow-up conversation mentioned a red-flag phrase that the athlete did not confirm in their answers. Result: high, so a human asks the athlete directly.",
    "missed-followup": `A day before today in an active ${FOLLOWUP_DAYS}-day follow-up with no symptom log prompts the athlete and adds a note for the trainer. The risk level does not change.`,
    "insufficient-data": `If fewer than ${t.MIN_SLEEP_NIGHTS_REPORTED} of ${t.WINDOW_DAYS} nights have sleep, or fewer than ${t.MIN_LOAD_DAYS_PER_WEEK} of ${t.WINDOW_DAYS} days in either week have load, or a check-in is missing from the last ${t.SORENESS_PERSISTING_DAYS} days, the trend rules do not fire and a low-confidence note names what is missing.`,
  };
}

export interface Explanation {
  rules: { id: string; description: string; firesWhen: string }[];
  thresholds: ThresholdRow[];
  redFlags: { source: string; label: string; items: string[]; validated: boolean; url?: string }[];
  dataIn: string[];
  dataOut: string[];
  statement: string;
}

export function buildExplanation(t: T = THRESHOLDS): Explanation {
  const fw = firesWhen(t);
  return {
    rules: RULES.map((r) => ({ id: r.id, description: r.description, firesWhen: fw[r.id] ?? r.description })),
    thresholds: thresholdRows(t),
    redFlags: [
      {
        source: "CDC HEADS UP concussion danger signs",
        label: "From a published source",
        url: "https://www.cdc.gov/heads-up/signs-symptoms/index.html",
        validated: true,
        items: CDC_DANGER_SIGNS.map((s) => s.label),
      },
      {
        source: "Founders' design doc (non-concussion red flags)",
        label: "Unvalidated: not from a published source, not clinician-reviewed",
        validated: false,
        items: FOUNDERS_RED_FLAGS_UNVALIDATED.map((s) => s.label),
      },
      {
        source: "Everyday symptom checklist (not red flags)",
        label: "Unvalidated placeholder list",
        validated: false,
        items: GENERAL_SYMPTOMS_UNVALIDATED.map((s) => s.label),
      },
    ],
    dataIn: [
      "Daily check-in: sleep hours, practice minutes and intensity (1 to 10), soreness per body area (0 to 3, only touched areas), a symptom checklist",
      `Head-impact report and its ${FOLLOWUP_DAYS}-day symptom follow-up (symptoms and severity per day)`,
      "Athlete's own time zone, used only to decide which calendar day a record belongs to",
      "Wearable daily values (heart-rate variability, resting heart rate, sleep) compared with the athlete's own baseline (mock data in the demo)",
      "A landing-check result from the video pipeline (band, score, items), and a simulated mouthguard impact event",
      "HitWatch follow-up answers: symptom ratings 0 to 3 per day, compared with the athlete's own pre-impact baseline",
    ],
    dataOut: [
      "Raw video, raw audio or full call transcripts: the app stores ratings and a short wording-filtered summary only",
      "Anything the athlete did not report: a missing value is never guessed or treated as zero",
      "Names, contact details, medical history or clinical records",
      "For the AI panel: names, initials, ids, date of birth, free-text notes, school, team and calendar dates are removed before anything is sent to Gemini",
      "Unapproved alerts: a coach or parent never sees one; a human reviewer must approve it first",
    ],
    statement:
      "Every threshold on this page is an unvalidated placeholder from the founders' design doc, pending clinician review. A rules engine decides the risk level; Gemini only extracts and explains; a human approves every alert before it reaches a coach, parent or clinician. This is a risk flag, not a medical evaluation. A clinician decides.",
  };
}

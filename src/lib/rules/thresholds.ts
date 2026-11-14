// UNVALIDATED PLACEHOLDERS. These numbers come from the founders' design doc and are pending
// clinician review. They are not derived from, or backed by, any study. Do not treat them as
// clinical thresholds.

export const THRESHOLDS = {
  /** A night counts as short when sleep is strictly below this many hours (exactly 6 is not short). */
  SHORT_SLEEP_HOURS: 6,
  /** Short nights needed (inclusive) within the 7-night window. */
  SHORT_SLEEP_NIGHTS: 3,
  /** Rolling window, in days, for sleep and "this week". */
  WINDOW_DAYS: 7,
  /** Load must rise by strictly more than this percent versus the prior week (exactly 25 does not count). */
  LOAD_INCREASE_PERCENT: 25,
  /** Soreness level that counts as "persisting" (>=). */
  SORENESS_PERSISTING_LEVEL: 2,
  /** Consecutive days at that level needed (inclusive). */
  SORENESS_PERSISTING_DAYS: 3,
  /** Soreness level and consecutive days that escalate straight to high. */
  SORENESS_SEVERE_LEVEL: 3,
  SORENESS_SEVERE_DAYS: 2,
  /** Data sufficiency (placeholders): nights of sleep reported out of 7, and load days reported per week. */
  MIN_SLEEP_NIGHTS_REPORTED: 5,
  MIN_LOAD_DAYS_PER_WEEK: 5,
  /** How far back the engine looks when persisting inputs and checking red flags. */
  LOOKBACK_DAYS: 14,
  /** Wearables (unvalidated placeholders): rolling window for the personal baseline (median), minimum days needed, and the HRV drop that counts. */
  WEARABLE_BASELINE_DAYS: 14,
  WEARABLE_MIN_BASELINE_DAYS: 7,
  HRV_DROP_PERCENT: 20,
  /** HitWatch (unvalidated placeholders): escalate when today's symptom total is this many points above the personal baseline, or any one symptom is this severe (scale 0 to 3). */
  HITWATCH_ESCALATE_DELTA: 3,
  HITWATCH_SINGLE_SYMPTOM_SEVERE: 3,
  /** Landing check (unvalidated placeholder): bands that raise a flag. */
  LANDING_FLAG_BANDS: 2,
} as const;

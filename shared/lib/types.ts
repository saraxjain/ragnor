// Shared types for Ragnor. Framework-free; import from Next.js, Node or anywhere TS runs.

export type Band = "low" | "moderate" | "high";
export type Urgency = "routine" | "same_day" | "urgent";

export interface WearableDay {
  date: string; // YYYY-MM-DD
  hrv_ms: number | null; // nightly HRV (RMSSD), ms
  rhr_bpm: number | null; // resting heart rate
  sleep_h: number | null; // hours asleep
}

export interface Baseline {
  hrv_ms: number | null;
  rhr_bpm: number | null;
  sleep_h: number | null;
  days_used: number;
}

export interface WearableComparison {
  data_available: boolean;
  hrv_pct_vs_baseline: number | null; // e.g. -18 means 18% below baseline
  rhr_delta_bpm: number | null; // e.g. +6
  sleep_h_avg_3d: number | null;
  below_baseline: boolean;
  reasons: string[];
}

export interface SorenessEntry {
  area: string;
  level: number; // 0-3
}

export interface CheckIn {
  date: string;
  sleep_h: number | null;
  soreness: SorenessEntry[];
  load_min: number | null;
  intensity: "light" | "moderate" | "hard" | "unknown";
  took_hit: boolean;
  symptoms: string[];
  red_flags: string[];
  meals?: number | null; // meals eaten today (0-3), from the tap check-in
  effort?: number | null; // session effort 1-10
  activities?: string[]; // e.g. sprints, lower_body_lift
  photo?: CheckinPhoto | null; // what a photo the athlete attached shows (the image itself is not kept)
  followups?: FollowupAnswer[]; // answers to the follow-up questions asked after the check-in
}

export interface CheckinPhoto {
  read: boolean; // false when no AI model was available to look at it
  area: string | null; // a soreness area id, or null
  signs: string[]; // swelling, bruising, redness, cut_or_scrape, tape_or_brace
  note: string; // one neutral sentence: what is visible, never a diagnosis
}

export interface FollowupAnswer {
  id: string;
  question: string;
  answer: string;
}

export interface LandingItem {
  id: string;
  present: boolean;
  side: "left" | "right" | "both" | "none";
  timestamp_s: number;
  confidence: number;
  plain_language: string;
}

export interface LandingResult {
  video_ok: boolean;
  video_issue?: string;
  view: string;
  initial_contact_s?: number;
  items: LandingItem[];
  summary: string;
}

export interface Flag {
  rule_id: string;
  band: Band;
  area?: string; // body area, when the flag is area-specific
  reason: string; // plain language, with the numbers
}

export interface RiskResult {
  athlete_id: string;
  date: string;
  band: Band;
  flags: Flag[];
  low_confidence: boolean; // key inputs missing
  rules_version: string;
}

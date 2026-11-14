// Plain-language copy for each rule: a title, the "do this" action and a short cause label.
// Shared by the athlete flag-detail screen and the coach briefing fallback.
import type { Flag } from "../shared/lib/index.ts";

const AREA: Record<string, string> = {
  knee: "Knee", head: "Head", hamstring_l: "Left hamstring", hamstring_r: "Right hamstring", knee_l: "Left knee", knee_r: "Right knee",
  lower_back: "Lower back", calf_l: "Left calf", calf_r: "Right calf", quad_l: "Left quad", quad_r: "Right quad", ankle_l: "Left ankle", ankle_r: "Right ankle",
  hip_l: "Left hip", hip_r: "Right hip", shoulder_l: "Left shoulder", shoulder_r: "Right shoulder", neck: "Neck",
};

export interface FlagCopy {
  title: string;
  cause: string;
  doThis: string;
  causeKind: "load" | "sleep" | "soreness" | "wearable" | "landing" | "head" | "fuel";
  athleteAction: string; // second-person, for the athlete
}

export function flagCopy(f: Flag): FlagCopy {
  const where = f.area ? (AREA[f.area] ?? f.area) : null;
  const band = f.band === "high" ? "high risk" : f.band === "moderate" ? "moderate risk" : "low risk";
  switch (f.rule_id) {
    case "R1_sleep_load":
      return { title: `Training load: ${band}`, cause: "Load spike + short sleep", causeKind: "sleep", doThis: "Lighter session today and an early night.", athleteAction: "Take an easier session today and aim for 8+ hours tonight." };
    case "R2_load_spike":
      return { title: `Training load: ${band}`, cause: "Load spike", causeKind: "load", doThis: "Cut sprint volume for 2 days.", athleteAction: "Cut sprints for 2 days." };
    case "R3_persistent_soreness":
      return { title: `${where ?? "Soreness"}: ${band}`, cause: "Sore 2+ days in a row", causeKind: "soreness", doThis: "Reduce load on that area for 2 days and recheck.", athleteAction: `Go easy on your ${(where ?? "sore area").toLowerCase()} for 2 days. Mobility work, no max-effort sprints.` };
    case "R4_severe_soreness":
      return { title: `${where ?? "Soreness"}: ${band}`, cause: "Severe soreness today", causeKind: "soreness", doThis: "Hold out of jumping drills today and check in with a parent or clinician.", athleteAction: "Sit out jumping and sprinting today and tell your coach." };
    case "R5_wearable_below_baseline":
      return { title: `Recovery: ${band}`, cause: "Watch data below your normal", causeKind: "wearable", doThis: "Lighter session today and an early night.", athleteAction: "Your body isn't back to its normal yet. Take it easier today and sleep early." };
    case "R6_landing":
      return { title: `${where ?? "Knee"}: ${band}`, cause: "Risky landing mechanics", causeKind: "landing", doThis: "Add the FixPlan warm-up and re-film a landing next week.", athleteAction: "Do your 10-minute FixPlan warm-up before practice." };
    case "R8_red_flag":
      return { title: "Get medical care now", cause: "Emergency sign reported", causeKind: "head", doThis: "Contact a parent now and make sure the athlete gets medical care today.", athleteAction: "Tell a parent or adult right now and get medical care. In an emergency, call 911." };
    case "R9_fuel":
      return { title: `Fueling: ${band}`, cause: "Under-fueled on a hard day", causeKind: "fuel", doThis: "Remind the athlete to eat before and after practice.", athleteAction: "Eat a real meal before practice and a snack with protein after." };
    default:
      return { title: band, cause: f.reason, causeKind: "load", doThis: "Check in with the athlete.", athleteAction: "Check in with your coach." };
  }
}

// Deterministic scripted debate built from the real brief and rules output. No model is involved.
// It is always labelled "Scripted example: no AI model was used" and never presented as model output.
// The agents debate how to explain the flag, what the reviewer should look at first, confidence and what is missing.
// They never state or change the risk level: a rules engine decides it.
import { THRESHOLDS as T } from "../rules/thresholds";
import type { Level } from "../types";
import type { CaseBrief } from "./brief";
import type { ConclusionContent, ConfidenceView, DebaterRole, TurnContent } from "./types";

const fired = (b: CaseBrief, id: string) => b.rulesFired.filter((f) => f.ruleId === id);
const has = (b: CaseBrief, id: string) => fired(b, id).length > 0;

export interface ScriptedDebate {
  round1: Record<DebaterRole, TurnContent>;
  round2: Record<DebaterRole, TurnContent>;
  conclusion: ConclusionContent;
}

const rebuttal = (concedes: string, stillDisputes: string, view: ConfidenceView, focus: string, dataPoints: string[]): TurnContent => ({
  confidenceView: view,
  reviewerFocus: focus,
  concedes,
  stillDisputes,
  argument: `Concedes: ${concedes} Still disputes: ${stillDisputes}`,
  dataPoints,
});

export function scriptedDebate(brief: CaseBrief, rulesLevel: Level): ScriptedDebate {
  const w = brief.weekly;
  const checkedIn = brief.days.filter((d) => d.checkedIn).length;
  const pctText = w.loadChangePercent === null ? "" : ` (${w.loadChangePercent >= 0 ? "+" : ""}${w.loadChangePercent}%)`;
  const thin = fired(brief, "insufficient-data");
  const redFlags = fired(brief, "red-flag");
  const postImpact = fired(brief, "post-impact-symptom");
  const soreness = fired(brief, "soreness-persisting");
  const symptomEvidence = [...redFlags, ...postImpact, ...soreness];
  const top = brief.rulesFired[0];
  const lowData = thin.length > 0 || brief.rulesFired.some((f) => f.confidence === "low");
  const baseView: ConfidenceView = lowData ? "low" : "normal";

  const loadLine =
    w.avgDailyLoadThisWeek !== null && w.avgDailyLoadPriorWeek !== null
      ? `Average daily load was ${w.avgDailyLoadThisWeek} this week against ${w.avgDailyLoadPriorWeek} the week before${pctText}.`
      : "There is not enough load data to compare this week with the week before.";
  const sleepLine = `Sleep was under ${T.SHORT_SLEEP_HOURS} hours on ${w.nightsUnderSleepThreshold} of ${w.nightsReportedOfLast7} reported nights.`;
  const hrv = brief.wearables;
  const hrvLine = hrv?.hrvDeltaPercent != null ? ` Heart-rate variability was ${hrv.hrvDeltaPercent}% against the athlete's own baseline.` : "";

  const loadAnalyst: TurnContent = {
    confidenceView: w.avgDailyLoadThisWeek === null ? "low" : baseView,
    reviewerFocus: has(brief, "sleep-load") || has(brief, "hrv-sleep") ? "Ask about recent training volume and sleep before looking at anything else." : "Load and sleep do not need attention first.",
    argument: `${loadLine} ${sleepLine}${hrvLine} ${has(brief, "sleep-load") || has(brief, "hrv-sleep") ? "Together that is the load-and-sleep pattern a rule flagged." : "No load-and-sleep rule fired."}`,
    dataPoints: [
      `Average daily load this week: ${w.avgDailyLoadThisWeek ?? "not enough data"}`,
      `Average daily load prior week: ${w.avgDailyLoadPriorWeek ?? "not enough data"}`,
      `Nights under ${T.SHORT_SLEEP_HOURS} h: ${w.nightsUnderSleepThreshold} of ${w.nightsReportedOfLast7} reported`,
    ],
  };

  const anySymptom = brief.days.some((d) => d.symptoms.length > 0);
  const watcher: TurnContent = {
    confidenceView: baseView,
    reviewerFocus:
      redFlags.length > 0
        ? "Danger sign first: contact the athlete now."
        : postImpact.length > 0
          ? "The post-impact symptoms first: ask how they are today."
          : soreness.length > 0
            ? "The sore area first: ask how it has changed."
            : "No symptom pattern to look at first.",
    argument:
      symptomEvidence.length > 0
        ? `The rules engine reported: ${symptomEvidence.map((f) => f.summary).join(" ")} I lean cautious on what to look at first.`
        : anySymptom
          ? "A symptom was ticked on at least one check-in but no rule-level pattern formed, so I would only watch the next check-ins."
          : `No symptoms, soreness runs or post-impact follow-up appear in the ${brief.days.length} days of check-ins supplied.`,
    dataPoints: symptomEvidence.length > 0 ? symptomEvidence.map((f) => `${f.ruleId} (${f.level})`) : [`Check-ins with a symptom ticked: ${brief.days.filter((d) => d.symptoms.length > 0).length}`, `Impacts in window: ${brief.impacts.length}`],
  };

  const sceptic: TurnContent = {
    confidenceView: baseView,
    reviewerFocus: thin.length > 0 ? "Fill the missing days before relying on the trend rules." : "Check that the days used were really reported, not assumed.",
    argument:
      thin.length > 0
        ? `The data is thin: ${thin[0].summary} Anything built on missing days deserves low confidence.`
        : brief.rulesFired.length > 0
          ? `I looked for a one-day blip: ${checkedIn} of ${brief.days.length} days have a check-in, and each flag rests on the numbers quoted above. I find no benign explanation in the data supplied, so I only question confidence, never the level.`
          : `No rule fired and ${checkedIn} of ${brief.days.length} days have a check-in. There is nothing to explain, and a quiet result is not a statement about the athlete's condition.`,
    dataPoints: [`Days with a check-in: ${checkedIn} of ${brief.days.length}`, `Rules fired: ${brief.rulesFired.length}`, `Rules level: ${rulesLevel}`],
  };

  const round2: Record<DebaterRole, TurnContent> = {
    load_analyst: rebuttal(
      symptomEvidence.length > 0 ? "The symptom evidence should come first for the reviewer." : "Nothing the others raised changes the load and sleep numbers.",
      `The load comparison rests on ${w.avgDailyLoadThisWeek === null ? "too little data" : "the reported days only"}.`,
      loadAnalyst.confidenceView,
      symptomEvidence.length > 0 ? watcher.reviewerFocus : loadAnalyst.reviewerFocus,
      [loadLine, sleepLine],
    ),
    symptom_watcher: rebuttal(
      thin.length > 0 ? "The data is thin in places, which limits confidence." : "The sceptic is right that every flag depends on the check-ins supplied.",
      symptomEvidence.length > 0 || anySymptom ? "Treating the symptom evidence as noise; it stays in the explanation." : "No symptom evidence is in dispute.",
      watcher.confidenceView,
      watcher.reviewerFocus,
      symptomEvidence.length > 0 ? symptomEvidence.map((f) => f.summary) : ["No symptom-level evidence"],
    ),
    sceptic: rebuttal(
      redFlags.length > 0 || postImpact.length > 0 ? "Danger signs and post-impact symptoms cannot be treated as a false alarm." : "Nothing here shows a false alarm that would change what the reviewer should do.",
      thin.length > 0 ? "How much weight the missing days deserve; confidence stays low." : "Only the wording of the confidence.",
      sceptic.confidenceView,
      redFlags.length > 0 || postImpact.length > 0 ? watcher.reviewerFocus : sceptic.reviewerFocus,
      [`Days with a check-in: ${checkedIn} of ${brief.days.length}`],
    ),
  };

  const missing = thin.length > 0 ? [thin[0].summary] : [];
  const conclusion: ConclusionContent = {
    explanation: top ? top.summary : "No rule produced a flag and the debaters found no pattern in the supplied numbers.",
    reviewerFocus: symptomEvidence.length > 0 ? watcher.reviewerFocus : loadAnalyst.reviewerFocus,
    confidence: baseView,
    missing,
    action: top ? actionFor(top.ruleId, brief) : "Keep logging the daily check-in.",
    agreements: [
      `All three debaters read the same ${brief.days.length} days of numbers.`,
      `All three accept the rules engine level (${rulesLevel}) as final.`,
    ],
    disputes: thin.length > 0 ? ["How much weight the thin data deserves."] : [],
    statedLevel: null,
  };
  return { round1: { load_analyst: loadAnalyst, symptom_watcher: watcher, sceptic }, round2, conclusion };
}

function actionFor(ruleId: string, brief: CaseBrief): string {
  switch (ruleId) {
    case "red-flag":
      return "Urgent: see a clinician now.";
    case "post-impact-symptom":
    case "hitwatch-escalation":
      return "Pause training today and tell your athletic trainer.";
    case "soreness-persisting":
      return "Ease off training that loads the sore area today and check in again tomorrow.";
    case "sleep-load":
    case "hrv-sleep":
      return "Plan a lighter training session today and aim for more sleep tonight.";
    case "missed-followup":
      return "Log today's symptoms now.";
    default:
      return brief.rulesFired[0]?.ruleId === "insufficient-data" ? "Complete today's check-in so trends can be calculated." : "Keep logging the daily check-in.";
  }
}

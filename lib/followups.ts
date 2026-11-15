// Follow-up questions asked after a check-in, so a coach or clinician sees the circumstances and not only a number.
// Everything here is fixed code: which questions are asked, the answer options, and what an answer changes.
// An answer can only make the check-in more cautious (raise a soreness level, record a hit or a symptom). It never lowers anything.
import type { CheckIn, FollowupAnswer } from "../shared/lib/types.ts";

export interface FollowupQuestion {
  id: string; // "<kind>:<area>" or "<kind>"
  text: string;
  options: { id: string; label: string }[];
}

export const MAX_QUESTIONS = 5;
const LOWER = /^(hip|hamstring|quad|knee|calf|ankle)_/;

export function areaName(area: string): string {
  const side = area.endsWith("_l") ? "left " : area.endsWith("_r") ? "right " : "";
  return side + area.replace(/_(l|r)$/, "").replaceAll("_", " ");
}

const opts = (...pairs: [string, string][]) => pairs.map(([id, label]) => ({ id, label }));

/** The questions for this check-in, most useful first. Same check-in in, same questions out. */
export function followupQuestions(c: CheckIn): FollowupQuestion[] {
  const q: FollowupQuestion[] = [];
  const level = new Map(c.soreness.map((s) => [s.area, s.level]));
  const photoArea = c.photo?.area && c.photo.area !== "other" ? c.photo.area : null;

  // The area to ask about: the one in the photo, otherwise the sorest one (level 2 or 3).
  const worst = [...c.soreness].filter((s) => s.level >= 2 && s.area !== "other").sort((a, b) => b.level - a.level)[0]?.area ?? null;
  const area = photoArea ?? worst;

  if (area) {
    const name = areaName(area);
    if (!level.has(area)) q.push({ id: `sore:${area}`, text: `How sore is your ${name} right now?`, options: opts(["0", "Not sore"], ["1", "A little"], ["2", "Quite sore"], ["3", "Very sore"]) });
    q.push({ id: `onset:${area}`, text: `When did your ${name} start bothering you?`, options: opts(["today", "Today"], ["days", "A few days ago"], ["week", "Over a week ago"]) });
    q.push({ id: `cause:${area}`, text: "What set it off?", options: opts(["moment", "One moment (a landing, twist or hit)"], ["gradual", "Built up over time"], ["unsure", "Not sure"]) });
    q.push(LOWER.test(area)
      ? { id: `weight:${area}`, text: "Can you put your full weight on it?", options: opts(["yes", "Yes, normally"], ["pain", "Yes, but it hurts"], ["no", "No"]) }
      : { id: `move:${area}`, text: "Can you move it through its full range?", options: opts(["yes", "Yes, normally"], ["pain", "Yes, but it hurts"], ["no", "No"]) });
    // No need to ask about swelling when the photo already shows it.
    if (!c.photo?.signs.some((s) => s === "swelling" || s === "bruising")) q.push({ id: `swelling:${area}`, text: "Any swelling or bruising?", options: opts(["none", "None"], ["some", "A little"], ["lot", "A lot"]) });
  }

  // A sore neck may come from a knock to the head, which the check-in would otherwise miss.
  if (!c.took_hit && (level.get("neck") ?? 0) >= 1) {
    q.push({ id: "hit", text: "Did your neck get sore after a hit or fall that jolted your head?", options: opts(["no", "No"], ["yes", "Yes"]) });
  }
  if (c.took_hit && c.symptoms.length === 0) {
    q.push({ id: "since_hit", text: "Since the hit, have you noticed any of these?", options: opts(["none", "None"], ["headache", "Headache"], ["dizziness", "Dizziness"], ["nausea", "Feeling sick"]) });
  }
  if (c.sleep_h != null && c.sleep_h < 6) {
    q.push({ id: "sleep_why", text: "What kept you from sleeping more?", options: opts(["school", "Schoolwork"], ["stress", "Stress or worry"], ["pain", "Pain or discomfort"], ["screens", "Phone or screens"], ["other", "Something else"]) });
  }
  return q.slice(0, MAX_QUESTIONS);
}

const bump = (c: CheckIn, area: string, atLeast: number) => {
  const cur = c.soreness.find((s) => s.area === area);
  if (cur) cur.level = Math.max(cur.level, atLeast);
  else if (atLeast > 0) c.soreness.push({ area, level: atLeast });
};

/**
 * Records the answers on the check-in and applies their fixed effects. `answers` maps question id to option id;
 * anything that is not a current question or a listed option is ignored, so a client cannot invent an effect.
 */
export function applyFollowups(checkin: CheckIn, answers: Record<string, string>): CheckIn {
  const c: CheckIn = { ...checkin, soreness: checkin.soreness.map((s) => ({ ...s })), symptoms: [...checkin.symptoms] };
  const recorded: FollowupAnswer[] = [];
  for (const q of followupQuestions(checkin)) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (!opt) continue;
    recorded.push({ id: q.id, question: q.text, answer: opt.label });
    const [kind, area] = q.id.split(":");
    if (kind === "sore") bump(c, area, Number(opt.id));
    else if ((kind === "weight" || kind === "move") && opt.id === "no") bump(c, area, 3);
    else if (kind === "swelling" && opt.id === "lot") bump(c, area, 2);
    else if (kind === "hit" && opt.id === "yes") c.took_hit = true;
    else if (kind === "since_hit" && opt.id !== "none" && !c.symptoms.includes(opt.id)) c.symptoms.push(opt.id);
  }
  c.followups = recorded;
  return c;
}

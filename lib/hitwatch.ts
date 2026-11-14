// HitWatch tools: one implementation shared by the ElevenLabs webhooks, the browser web-call client tools,
// and the Gemini function-calling agent that processes call transcripts.
import type { Content, Part } from "@google/genai";
import toolsFile from "../shared/agent/tools.json";
import { sanitize, RED_FLAG_MESSAGE, type HitWatchDecision, type Urgency } from "../shared/lib/index.ts";
import { compareHitWatch, draftAlert, getAthlete, logHitWatch, audit, type HitCall } from "./store.ts";
import { config, live } from "./config.ts";
import { gemini, functionDeclarations, loadAgentPrompt } from "./gemini.ts";

export type ToolName = "log_symptoms" | "compare_to_baseline" | "draft_alert" | "schedule_followup";

const listToMap = (items: { name: string; severity: number }[] = []) =>
  Object.fromEntries(items.filter((i) => i?.name).map((i) => [String(i.name).toLowerCase().replace(/[\s-]+/g, "_"), Math.max(0, Math.min(6, Math.round(Number(i.severity) || 0)))]));

export function runTool(name: ToolName, args: Record<string, unknown>, transcript?: HitCall["transcript"]) {
  const athlete_id = String(args.athlete_id ?? "");
  const day = Number(args.day ?? 0);
  switch (name) {
    case "log_symptoms": {
      const call = logHitWatch({
        athlete_id,
        hit_id: args.hit_id as string | undefined,
        day,
        symptoms: listToMap(args.symptoms as { name: string; severity: number }[]),
        red_flags: ((args.red_flags as string[]) ?? []).map((r) => String(r).toLowerCase().replace(/[\s-]+/g, "_")),
        worse_than_yesterday: Boolean(args.worse_than_yesterday),
        athlete_quote: args.athlete_quote ? sanitize(String(args.athlete_quote)).text : undefined,
        transcript,
      });
      return { saved: true, day: call.day, symptom_total: Object.values(call.symptoms).reduce((s, v) => s + v, 0), red_flag_message: call.red_flags.length ? RED_FLAG_MESSAGE : undefined };
    }
    case "compare_to_baseline": {
      const d = compareHitWatch(athlete_id, day);
      return {
        escalate: d.escalate,
        urgency: d.urgency,
        reasons: d.reasons,
        symptom_total_today: d.symptom_total_today,
        symptom_total_baseline: d.symptom_total_baseline,
        wearable: d.wearable,
      };
    }
    case "draft_alert": {
      const a = draftAlert({
        athlete_id,
        hit_id: args.hit_id as string | undefined,
        urgency: (args.urgency as Urgency) ?? "same_day",
        summary: sanitize(String(args.summary ?? "")).text,
        recipients_suggested: (args.recipients_suggested as string[]) ?? ["coach"],
      });
      return { drafted: true, alert_id: a.id, status: a.status, note: "Waiting for a staff member to approve. Nothing has been sent." };
    }
    case "schedule_followup": {
      const a = getAthlete(athlete_id);
      if (a?.hitwatch) a.hitwatch.next_call = String(args.when_iso ?? "");
      audit("hitwatch_agent", "followup_scheduled", `Next call ${String(args.when_iso ?? "")} (${String(args.reason ?? "daily")})`, athlete_id);
      return { scheduled: true, when_iso: args.when_iso };
    }
  }
}

// ---------- demo transcript (Maya, day 2) ----------

export function demoTranscript(firstName: string, description: string) {
  return [
    { role: "agent" as const, text: `Hi ${firstName}, it's Ragnor, your team's check-in assistant. I'm calling about the hit you took ${description}. Do you have two minutes for a few quick questions?` },
    { role: "athlete" as const, text: "Yeah, I can talk." },
    { role: "agent" as const, text: "Thanks. Any headache or pressure in your head today? From zero to six, how bad?" },
    { role: "athlete" as const, text: "Honestly my headache's worse than yesterday. Maybe a three. It started getting bad in class this morning." },
    { role: "agent" as const, text: "Thanks for telling me. Is light or noise bothering you more than usual?" },
    { role: "athlete" as const, text: "The lights in class were really bugging me. Like a two. Noise is fine." },
    { role: "agent" as const, text: "Any trouble concentrating, or feeling slowed down or foggy?" },
    { role: "athlete" as const, text: "Kind of foggy, I guess a two. And I'm tired, but I'm always tired, so a one." },
    { role: "agent" as const, text: "Any nausea, dizziness, or balance problems?" },
    { role: "athlete" as const, text: "No, none of that." },
    { role: "agent" as const, text: "A few important ones: any vomiting more than once, a headache that keeps getting worse, confusion, slurred speech, numbness or weakness, or did you pass out?" },
    { role: "athlete" as const, text: "No, nothing like that. It's not getting worse right now, it's just worse than yesterday." },
    { role: "agent" as const, text: `Thanks, ${firstName}. I'm letting your coach know so a person can follow up with you today. I'll check in again tomorrow. If anything gets worse before then, tell a parent or your coach right away.` },
  ];
}

// ---------- Gemini agent over a transcript ----------

export interface AgentRun {
  mode: "gemini" | "rules_only";
  tool_calls: { name: string; args: Record<string, unknown>; result: unknown }[];
  final_text: string;
  decision: HitWatchDecision | null;
}

/** Gemini reads the call transcript and calls the HitWatch tools (log -> compare -> draft) by function calling. */
export async function runAgentOnTranscript(athleteId: string, day: number, transcript: NonNullable<HitCall["transcript"]>): Promise<AgentRun> {
  const a = getAthlete(athleteId);
  if (!a?.hitwatch) throw new Error("no active HitWatch case");
  const hit = a.hitwatch;

  if (!live.gemini()) return rulesOnlyRun(athleteId, day, transcript);

  const vars: Record<string, string> = {
    athlete_first_name: a.name.split(" ")[0],
    athlete_id: a.id,
    hit_id: hit.hit_id,
    day: String(day),
    hit_description: hit.hit_description,
    coach_name: "Coach",
  };
  const system =
    loadAgentPrompt().replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "") +
    "\n\nYou are now processing a call that has just finished. Read the transcript, then call log_symptoms, then compare_to_baseline, then draft_alert if compare_to_baseline says escalate or any red flag was reported, then schedule_followup for tomorrow at 4pm local time. Finish with one sentence for the coach summarizing what happened. Never diagnose.";

  const transcriptText = transcript.map((t) => `${t.role === "agent" ? "Ragnor" : vars.athlete_first_name}: ${t.text}`).join("\n");
  const contents: Content[] = [
    { role: "user", parts: [{ text: `athlete_id=${a.id}, hit_id=${hit.hit_id}, day=${day}, today=${new Date().toISOString().slice(0, 10)}\n\nCall transcript:\n${transcriptText}` }] },
  ];
  const tools = [{ functionDeclarations: functionDeclarations(toolsFile.tools) }];
  const calls: AgentRun["tool_calls"] = [];
  let finalText = "";

  for (let step = 0; step < 8; step++) {
    const res = await gemini().models.generateContent({
      model: config.geminiModel,
      contents,
      config: { systemInstruction: system, tools, temperature: 0.1 },
    });
    const fcs = res.functionCalls ?? [];
    const modelContent = res.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);
    if (!fcs.length) {
      finalText = res.text ?? "";
      break;
    }
    const responses: Part[] = [];
    for (const fc of fcs) {
      const args = { athlete_id: a.id, hit_id: hit.hit_id, day, ...(fc.args ?? {}) } as Record<string, unknown>;
      let result: unknown;
      try {
        result = runTool(fc.name as ToolName, args, fc.name === "log_symptoms" ? transcript : undefined);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      calls.push({ name: fc.name ?? "", args, result });
      responses.push({ functionResponse: { name: fc.name, id: fc.id, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }

  // Safety net: the rules must always run even if the model skipped a step.
  if (!calls.some((c) => c.name === "compare_to_baseline") && calls.some((c) => c.name === "log_symptoms")) {
    const result = runTool("compare_to_baseline", { athlete_id: a.id, day });
    calls.push({ name: "compare_to_baseline", args: { athlete_id: a.id, day }, result });
  }
  const decision = getAthlete(athleteId)?.hitwatch?.today_decision ?? null;
  if (decision?.escalate && !calls.some((c) => c.name === "draft_alert")) {
    const args = { athlete_id: a.id, hit_id: hit.hit_id, urgency: decision.urgency, summary: `${vars.athlete_first_name}: ${decision.reasons[0] ?? "change after a hit"}. Please review today.`, recipients_suggested: ["coach", "parent"] };
    calls.push({ name: "draft_alert", args, result: runTool("draft_alert", args) });
  }
  return { mode: "gemini", tool_calls: calls, final_text: sanitize(finalText).text, decision };
}

/** No Gemini key: parse the demo transcript deterministically so the demo still works end to end. */
function rulesOnlyRun(athleteId: string, day: number, transcript: NonNullable<HitCall["transcript"]>): AgentRun {
  const a = getAthlete(athleteId)!;
  const WORDS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6" };
  const text = transcript
    .filter((t) => t.role === "athlete")
    .map((t) => t.text.toLowerCase())
    .join(" ")
    .replace(/\b(zero|one|two|three|four|five|six)\b/g, (w) => WORDS[w]);
  const sev = (re: RegExp) => {
    const m = text.match(re);
    return m ? Number(m[1]) : 0;
  };
  const symptoms = [
    { name: "headache", severity: sev(/headache[\s\S]{0,60}?\b([0-6])\b/) },
    { name: "light_sensitivity", severity: sev(/light[\s\S]{0,60}?\b([0-6])\b/) },
    { name: "feeling_in_a_fog", severity: sev(/fog[\s\S]{0,40}?\b([0-6])\b/) },
    { name: "fatigue", severity: sev(/tired[\s\S]{0,40}?\b([0-6])\b/) || (text.includes("tired") ? 1 : 0) },
    { name: "dizziness", severity: /\bno\b[^.]{0,20}dizz/.test(text) ? 0 : sev(/dizz[\s\S]{0,40}?\b([0-6])\b/) },
  ].filter((s) => s.severity > 0);
  const calls: AgentRun["tool_calls"] = [];
  const logArgs = { athlete_id: a.id, hit_id: a.hitwatch!.hit_id, day, symptoms, red_flags: [], worse_than_yesterday: text.includes("worse than yesterday"), athlete_quote: "Headache worse than yesterday (3/6); classroom lights bothering her; a bit foggy." };
  calls.push({ name: "log_symptoms", args: logArgs, result: runTool("log_symptoms", logArgs, transcript) });
  const cmp = runTool("compare_to_baseline", { athlete_id: a.id, day }) as { escalate: boolean; urgency: Urgency; reasons: string[] };
  calls.push({ name: "compare_to_baseline", args: { athlete_id: a.id, day }, result: cmp });
  if (cmp.escalate) {
    const first = a.name.split(" ")[0];
    const args = { athlete_id: a.id, hit_id: a.hitwatch!.hit_id, urgency: cmp.urgency, summary: `${first} reported a stronger headache and light sensitivity on day ${day} after the hit, and her overnight HRV is below her normal. Please review and contact a parent or clinician today.`, recipients_suggested: ["coach", "parent"] };
    calls.push({ name: "draft_alert", args, result: runTool("draft_alert", args) });
  }
  const when = new Date(Date.now() + 86_400_000).toISOString();
  calls.push({ name: "schedule_followup", args: { athlete_id: a.id, when_iso: when, reason: "daily" }, result: runTool("schedule_followup", { athlete_id: a.id, when_iso: when, reason: "daily" }) });
  return { mode: "rules_only", tool_calls: calls, final_text: cmp.escalate ? "Symptoms rose since yesterday and wearable data is below baseline; a same-day alert is waiting for staff approval." : "No change from baseline today.", decision: getAthlete(athleteId)?.hitwatch?.today_decision ?? null };
}

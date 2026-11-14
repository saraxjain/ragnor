// Runs the debate: round 1 (three debaters in parallel), round 2 (rebuttals in parallel), moderator, guardrail.
// The model client is injected, so everything here is testable with a fake.
import type { z } from "zod";
import { levelRank, type Level } from "../types";
import { findBanned } from "../wording";
import { WORDING_RULES_PROMPT } from "./prompts";
import { applyGuardrail } from "./guardrail";
import type { CaseBrief } from "./brief";
import { MODERATOR_INSTRUCTION, ROUND1_INSTRUCTION, ROUND2_INSTRUCTION, SYSTEM_PROMPTS } from "./prompts";
import { scriptedDebate } from "./scripted";
import {
  DEBATER_ROLES,
  ROLE_NAMES,
  SCRIPTED_LABEL,
  checkLimits,
  moderatorSchema,
  openingSchema,
  rebuttalSchema,
  type ConclusionContent,
  type DebaterRole,
  type GuardrailResult,
  type ModelClient,
  type Opening,
  type PanelEvent,
  type Rebuttal,
  type ModeratorOut,
  type TurnContent,
} from "./types";
import type { FlagDraft } from "../rules";

export const WITHHELD_MARKER = "[message withheld: broke the wording rules]";
export const CONCLUSION_FRAMING = "Explanation for the human reviewer. The rules engine decided the level. A clinician decides.";

export class TurnFailedError extends Error {
  constructor(
    readonly turn: string,
    readonly reason: string,
  ) {
    super(`Turn "${turn}" failed after one retry: ${reason}`);
    this.name = "TurnFailedError";
  }
}

// The wording filter must not flag our own marker or framing text.
const allow = new Set<string>([WORDING_RULES_PROMPT]);
export const checkWording = (texts: string[]): string[] => [...new Set(texts.flatMap((t) => findBanned(t, allow)))];

const turnTexts = (c: TurnContent): string[] => [c.reviewerFocus, c.argument, c.concedes ?? "", c.stillDisputes ?? "", ...c.dataPoints];
const conclusionTexts = (c: ConclusionContent): string[] => [c.explanation, c.reviewerFocus, c.action, ...c.missing, ...c.agreements, ...c.disputes];

export function filterTurn(c: TurnContent): { content: TurnContent; matched: string[] } {
  const matched = checkWording(turnTexts(c));
  if (matched.length === 0) return { content: c, matched };
  return { matched, content: { confidenceView: c.confidenceView, reviewerFocus: WITHHELD_MARKER, argument: WITHHELD_MARKER, concedes: c.concedes ? WITHHELD_MARKER : undefined, stillDisputes: c.stillDisputes ? WITHHELD_MARKER : undefined, dataPoints: [] } };
}

export function filterConclusion(c: ConclusionContent): { content: ConclusionContent; matched: string[] } {
  const matched = checkWording(conclusionTexts(c));
  if (matched.length === 0) return { content: c, matched };
  return { matched, content: { ...c, explanation: WITHHELD_MARKER, reviewerFocus: WITHHELD_MARKER, action: WITHHELD_MARKER, missing: [], agreements: [], disputes: [] } };
}

async function runTurn<T>(
  client: ModelClient,
  turn: string,
  kind: "opening" | "rebuttal" | "moderator",
  schema: z.ZodType<T>,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<T> {
  let lastReason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      const raw = await client.complete({ system, user, schema, signal });
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        lastReason = "response was not valid JSON";
        continue;
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        lastReason = `schema validation failed: ${parsed.error.issues[0]?.message ?? "unknown"}`;
        continue;
      }
      const limit = checkLimits(kind, parsed.data as Opening | Rebuttal | ModeratorOut);
      if (limit) {
        lastReason = limit;
        continue;
      }
      return parsed.data;
    } catch (e) {
      if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw e;
      lastReason = e instanceof Error ? `${e.name}: ${e.message}` : "request failed";
    }
  }
  throw new TurnFailedError(turn, lastReason);
}

export const topLevelOf = (flags: Pick<FlagDraft, "level">[]): Level =>
  flags.reduce<Level>((t, f) => (levelRank(f.level) > levelRank(t) ? f.level : t), "low");

const briefJson = (b: CaseBrief) => JSON.stringify(b, null, 2);
const toTurn = (o: Opening): TurnContent => ({ confidenceView: o.confidence_view, reviewerFocus: o.reviewer_focus, argument: o.argument, dataPoints: o.data_points });
const toRebuttal = (r: Rebuttal): TurnContent => ({
  confidenceView: r.updated_confidence_view,
  reviewerFocus: r.updated_reviewer_focus,
  concedes: r.concedes,
  stillDisputes: r.still_disputes,
  argument: `Concedes: ${r.concedes} Still disputes: ${r.still_disputes}`,
  dataPoints: r.data_points,
});

export interface PanelRun {
  brief: CaseBrief;
  flags: Pick<FlagDraft, "level" | "confidence">[];
  emit: (e: PanelEvent) => void;
  signal?: AbortSignal;
}

/** Live debate with an injected model client. Throws TurnFailedError (or the client's error) if a turn cannot be completed. */
export async function runLivePanel(run: PanelRun, client: ModelClient): Promise<void> {
  const { brief, emit, signal } = run;
  const rulesLevel = topLevelOf(run.flags);
  const withheld: GuardrailResult["withheld"] = [];
  const bj = briefJson(brief);

  const emitTurn = (round: 1 | 2, role: DebaterRole, raw: TurnContent): TurnContent => {
    const { content, matched } = filterTurn(raw);
    if (matched.length) withheld.push({ round, role, matched });
    emit({ type: "turn", round, role, name: ROLE_NAMES[role], source: "live", withheld: matched.length > 0, content });
    return content;
  };

  // Round 1: three debaters in parallel; each event is emitted as that turn completes.
  const opens = {} as Record<DebaterRole, TurnContent>;
  await Promise.all(
    DEBATER_ROLES.map(async (role) => {
      const out = await runTurn(client, `round 1 ${role}`, "opening", openingSchema, SYSTEM_PROMPTS[role], `${ROUND1_INSTRUCTION}\n\nCase brief (JSON):\n${bj}`, signal);
      opens[role] = emitTurn(1, role, toTurn(out));
    }),
  );

  // Round 2: each debater sees the other two openings (as filtered, so withheld text is never passed on).
  const rebuts = {} as Record<DebaterRole, TurnContent>;
  await Promise.all(
    DEBATER_ROLES.map(async (role) => {
      const others = DEBATER_ROLES.filter((r) => r !== role)
        .map((r) => `${ROLE_NAMES[r]} (confidence ${opens[r].confidenceView}; focus: ${opens[r].reviewerFocus}): ${opens[r].argument}\nData points: ${opens[r].dataPoints.join("; ") || "none"}`)
        .join("\n\n");
      const user = `${ROUND2_INSTRUCTION}\n\nYour own opening (confidence ${opens[role].confidenceView}): ${opens[role].argument}\n\nOther openings:\n${others}\n\nCase brief (JSON):\n${bj}`;
      const out = await runTurn(client, `round 2 ${role}`, "rebuttal", rebuttalSchema, SYSTEM_PROMPTS[role], user, signal);
      rebuts[role] = emitTurn(2, role, toRebuttal(out));
    }),
  );

  // Moderator
  const transcript = (["Round 1", "Round 2"] as const)
    .map((label, i) => {
      const src = i === 0 ? opens : rebuts;
      return `${label}\n${DEBATER_ROLES.map((r) => `- ${ROLE_NAMES[r]} (confidence ${src[r].confidenceView}): ${src[r].argument}`).join("\n")}`;
    })
    .join("\n\n");
  const modUser = `${MODERATOR_INSTRUCTION}\n\nThe rules engine level is ${rulesLevel} and it is final. Do not restate or change it.\n\n${transcript}\n\nCase brief (JSON):\n${bj}`;
  const mod = await runTurn(client, "moderator", "moderator", moderatorSchema, SYSTEM_PROMPTS.moderator, modUser, signal);
  const rawConclusion: ConclusionContent = {
    explanation: mod.explanation,
    reviewerFocus: mod.reviewer_focus,
    confidence: mod.confidence,
    missing: mod.missing,
    action: mod.action,
    agreements: mod.agreements,
    disputes: mod.disputes,
    statedLevel: mod.stated_level === "none" ? null : mod.stated_level,
  };
  const { content: conclusion, matched } = filterConclusion(rawConclusion);
  if (matched.length) withheld.push({ round: "conclusion", role: "moderator", matched });
  emit({ type: "conclusion", source: "live", withheld: matched.length > 0, framing: CONCLUSION_FRAMING, content: conclusion });
  emit({
    type: "guardrail",
    result: applyGuardrail({
      rulesLevel,
      statedLevel: mod.stated_level === "none" ? null : mod.stated_level,
      moderatorConfidence: mod.confidence,
      rulesLowConfidence: run.flags.some((f) => f.confidence === "low"),
      withheld,
    }),
  });
}

/** Scripted debate from the real brief and rules output. Same event shapes, source "scripted". */
export function runScriptedPanel(run: PanelRun): void {
  const { brief, emit } = run;
  const rulesLevel = topLevelOf(run.flags);
  const d = scriptedDebate(brief, rulesLevel);
  const withheld: GuardrailResult["withheld"] = [];
  for (const round of [1, 2] as const) {
    for (const role of DEBATER_ROLES) {
      const { content, matched } = filterTurn((round === 1 ? d.round1 : d.round2)[role]);
      if (matched.length) withheld.push({ round, role, matched });
      emit({ type: "turn", round, role, name: ROLE_NAMES[role], source: "scripted", withheld: matched.length > 0, content });
    }
  }
  const { content, matched } = filterConclusion(d.conclusion);
  if (matched.length) withheld.push({ round: "conclusion", role: "moderator", matched });
  emit({ type: "conclusion", source: "scripted", withheld: matched.length > 0, framing: CONCLUSION_FRAMING, content });
  emit({
    type: "guardrail",
    result: applyGuardrail({
      rulesLevel,
      statedLevel: d.conclusion.statedLevel,
      moderatorConfidence: d.conclusion.confidence,
      rulesLowConfidence: run.flags.some((f) => f.confidence === "low"),
      withheld,
    }),
  });
}

export function rulesEvent(flags: FlagDraft[]): PanelEvent {
  return {
    type: "rules",
    level: topLevelOf(flags),
    flags: flags.map((f) => ({
      ruleId: f.ruleId,
      level: f.level,
      bodyArea: f.bodyArea,
      confidence: f.confidence,
      reason: f.reason,
      action: f.action,
      trainerAlert: f.trainerAlert,
    })),
  };
}

/**
 * Whole session: mode, brief, rules, debate, done. Uses the live client when one is given; if the live run fails
 * for any reason (not an abort) it announces the switch and replays as a clearly labelled scripted example.
 * `flags` here are the real rules output; the rules event carries the full reasons (they include dates only
 * server-side; the brief itself is de-identified).
 */
export async function runPanelSession(opts: {
  brief: CaseBrief;
  flags: FlagDraft[];
  client: ModelClient | null;
  noClientReason?: string;
  emit: (e: PanelEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { brief, flags, emit, signal, client } = opts;
  const run: PanelRun = { brief, flags, emit, signal };
  const scripted = (reason: string) => {
    emit({ type: "mode", mode: "scripted", label: SCRIPTED_LABEL, reason });
    emit({ type: "brief", brief });
    emit(rulesEvent(flags));
    runScriptedPanel(run);
  };
  try {
    if (!client) {
      scripted(opts.noClientReason ?? "No model client configured.");
    } else {
      emit({ type: "mode", mode: "live", model: client.model, label: "Live AI" });
      emit({ type: "brief", brief });
      emit(rulesEvent(flags));
      try {
        await runLivePanel(run, client);
      } catch (e) {
        if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw e;
        scripted(`The live run failed (${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}); showing the scripted example instead.`);
      }
    }
    emit({ type: "done" });
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) return;
    emit({ type: "error", message: e instanceof Error ? e.message : "Unexpected error" });
  }
}

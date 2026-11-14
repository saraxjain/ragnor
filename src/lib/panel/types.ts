import { z } from "zod";
import { LEVELS, type Level } from "../types";

export const DEBATER_ROLES = ["load_analyst", "symptom_watcher", "sceptic"] as const;
export type DebaterRole = (typeof DEBATER_ROLES)[number];
export type PanelRole = DebaterRole | "moderator";

export const ROLE_NAMES: Record<PanelRole, string> = {
  load_analyst: "Load analyst",
  symptom_watcher: "Symptom and impact watcher",
  sceptic: "Sceptic",
  moderator: "Moderator",
};

/**
 * The panel never decides the level: a deterministic rules engine does. The agents argue about how to EXPLAIN the flag,
 * what the reviewer should look at first, how confident the data is, and what is missing.
 */
export const CONFIDENCE_VIEWS = ["normal", "low"] as const;
export type ConfidenceView = (typeof CONFIDENCE_VIEWS)[number];

// ---- structured-output schemas (plain types so the API's JSON-schema subset accepts them) ----
export const openingSchema = z.object({
  confidence_view: z.enum(CONFIDENCE_VIEWS),
  reviewer_focus: z.string(),
  argument: z.string(),
  data_points: z.array(z.string()),
});
export type Opening = z.infer<typeof openingSchema>;

export const rebuttalSchema = z.object({
  concedes: z.string(),
  still_disputes: z.string(),
  updated_confidence_view: z.enum(CONFIDENCE_VIEWS),
  updated_reviewer_focus: z.string(),
  data_points: z.array(z.string()),
});
export type Rebuttal = z.infer<typeof rebuttalSchema>;

export const moderatorSchema = z.object({
  explanation: z.string(),
  reviewer_focus: z.string(),
  confidence: z.enum(CONFIDENCE_VIEWS),
  missing: z.array(z.string()),
  action: z.string(),
  agreements: z.array(z.string()),
  disputes: z.array(z.string()),
  /** Must be "none": the rules engine decides the level. If a model states one anyway the guardrail records it as overridden. */
  stated_level: z.enum(["none", ...LEVELS]),
});
export type ModeratorOut = z.infer<typeof moderatorSchema>;

/** Extra validation on top of the schema (the API schema subset cannot express these limits). */
export function checkLimits(kind: "opening" | "rebuttal" | "moderator", v: Opening | Rebuttal | ModeratorOut): string | null {
  const texts: string[] =
    kind === "opening"
      ? [(v as Opening).argument, (v as Opening).reviewer_focus]
      : kind === "rebuttal"
        ? [(v as Rebuttal).concedes, (v as Rebuttal).still_disputes, (v as Rebuttal).updated_reviewer_focus]
        : [(v as ModeratorOut).explanation, (v as ModeratorOut).reviewer_focus, (v as ModeratorOut).action];
  if (texts.some((t) => t.trim().length === 0)) return "empty text field";
  if (texts.some((t) => t.length > 1200)) return "text field too long";
  const lists: string[][] =
    kind === "moderator"
      ? [(v as ModeratorOut).agreements, (v as ModeratorOut).disputes, (v as ModeratorOut).missing]
      : [(v as Opening | Rebuttal).data_points];
  if (lists.some((l) => l.length > 12 || l.some((x) => x.length > 300))) return "list too long";
  return null;
}

// ---- streamed events (newline-delimited JSON) ----
export const SCRIPTED_LABEL = "Scripted example: no AI model was used";

export interface TurnContent {
  confidenceView: ConfidenceView;
  reviewerFocus: string;
  argument: string; // for rebuttals: "Concedes: ... Still disputes: ..."
  concedes?: string;
  stillDisputes?: string;
  dataPoints: string[];
}

export interface ConclusionContent {
  explanation: string;
  reviewerFocus: string;
  confidence: ConfidenceView;
  missing: string[];
  action: string;
  agreements: string[];
  disputes: string[];
  /** A level the model tried to state. Never used; recorded by the guardrail. */
  statedLevel: Level | null;
}

export interface GuardrailResult {
  rulesLevel: Level;
  /** What the model stated, if anything. */
  statedLevel: Level | null;
  /** Always equal to rulesLevel: a rules engine decides the risk level; the model only extracts and explains. */
  finalLevel: Level;
  confidence: ConfidenceView;
  overrodeModerator: boolean;
  overrideReasons: string[];
  withheld: { round: number | "conclusion"; role: PanelRole; matched: string[] }[];
}

export type PanelEvent =
  | { type: "mode"; mode: "live" | "scripted"; model?: string; label: string; reason?: string }
  | { type: "brief"; brief: unknown }
  | { type: "rules"; level: Level; flags: { ruleId: string; level: Level; bodyArea: string | null; confidence: string; reason: string; action: string; trainerAlert: boolean }[] }
  | { type: "turn"; round: 1 | 2; role: DebaterRole; name: string; source: "live" | "scripted"; withheld: boolean; content: TurnContent }
  | { type: "conclusion"; source: "live" | "scripted"; withheld: boolean; framing: string; content: ConclusionContent }
  | { type: "guardrail"; result: GuardrailResult }
  | { type: "done" }
  | { type: "error"; message: string };

/** Model client seam: the only thing the orchestrator needs. Injected so tests can use a fake. */
export interface ModelClient {
  readonly model: string;
  /** Returns the model's raw text (JSON). The orchestrator parses and validates it. */
  complete(req: { system: string; user: string; schema: z.ZodType; signal?: AbortSignal }): Promise<string>;
}

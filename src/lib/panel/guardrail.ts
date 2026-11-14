// Code guardrail. A rules engine decides the risk level; the model only extracts and explains.
import { LEVELS, type Level } from "../types";
import type { GuardrailResult } from "./types";

const isLevel = (v: unknown): v is Level => typeof v === "string" && (LEVELS as readonly string[]).includes(v);

/**
 * final level = rules level, always. Any level the model states that differs from the rules level is recorded as an
 * override attempt and ignored. Confidence can only be lowered (by the model or by low-confidence rule flags), never raised.
 */
export function applyGuardrail(input: {
  rulesLevel: Level;
  statedLevel: unknown;
  moderatorConfidence: "normal" | "low";
  rulesLowConfidence?: boolean;
  withheld?: GuardrailResult["withheld"];
}): GuardrailResult {
  const reasons: string[] = [];
  const stated: Level | null = isLevel(input.statedLevel) ? input.statedLevel : null;
  if (input.statedLevel != null && stated === null) reasons.push("The model stated an unrecognised level; it was ignored.");
  const overrode = stated !== null && stated !== input.rulesLevel;
  if (overrode) {
    reasons.push(`The model stated "${stated}" but the level comes only from the rules engine, so the final level stays "${input.rulesLevel}".`);
  }
  const confidence: "normal" | "low" = input.moderatorConfidence === "low" || input.rulesLowConfidence ? "low" : "normal";
  return {
    rulesLevel: input.rulesLevel,
    statedLevel: stated,
    finalLevel: input.rulesLevel,
    confidence,
    overrodeModerator: overrode,
    overrideReasons: reasons,
    withheld: input.withheld ?? [],
  };
}

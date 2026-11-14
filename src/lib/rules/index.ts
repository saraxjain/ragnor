// Ragnor rules engine entry point.
// UNVALIDATED PLACEHOLDERS: thresholds in this engine come from the founders' design doc and are
// pending clinician review. They are not backed by any cited study.

import { levelRank } from "../types";
import { RULES } from "./rules";
import type { FlagDraft, Rule, RuleContext } from "./types";

export const RULES_VERSION = "0.1.0-unvalidated";

/** Registry of rule sets by version so old logs can be replayed. Add a new entry on every rule change. */
const RULESETS: Record<string, Rule[]> = {
  [RULES_VERSION]: RULES,
};

export class UnknownRulesVersionError extends Error {
  constructor(version: string) {
    super(`No rule set registered for rules version "${version}"`);
    this.name = "UnknownRulesVersionError";
  }
}

export { RULES };
export { THRESHOLDS } from "./thresholds";
export * from "./symptoms";
export type * from "./types";

/** Run every rule over the context. Pure and deterministic: same inputs + version => same flags. */
export function runRules(ctx: RuleContext, version: string = RULES_VERSION, only?: string): FlagDraft[] {
  const rules = RULESETS[version];
  if (!rules) throw new UnknownRulesVersionError(version);
  const drafts: FlagDraft[] = [];
  for (const rule of rules) {
    if (only && rule.id !== only) continue;
    for (const out of rule.evaluate(ctx)) {
      drafts.push({
        ...out,
        // Invariant: an urgent flag always alerts the trainer, whatever the rule returned.
        trainerAlert: out.trainerAlert || out.level === "urgent",
        ruleId: rule.id,
        rulesVersion: version,
        inputs: structuredClone(ctx),
      });
    }
  }
  return drafts.sort(
    (a, b) =>
      levelRank(b.level) - levelRank(a.level) ||
      a.ruleId.localeCompare(b.ruleId) ||
      (a.bodyArea ?? "").localeCompare(b.bodyArea ?? ""),
  );
}

/** Replay a stored flag: re-run its rule on its stored inputs under its stored rules version. */
export function replayFlag(flag: { ruleId: string; rulesVersion: string; inputs: unknown }): FlagDraft[] {
  return runRules(flag.inputs as RuleContext, flag.rulesVersion, flag.ruleId);
}

/** Replay a whole logged context under a given rules version. */
export const replay = (ctx: RuleContext, version: string): FlagDraft[] => runRules(ctx, version);

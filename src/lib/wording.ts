// Wording rules shared by the build-time source scan and the runtime panel filter.
// Product rule 1: never say cleared / fine / safe / healthy, never present the product as diagnosing.
import { DISCLAIMER_LONG } from "./copy";

export const BANNED: { name: string; re: RegExp }[] = [
  { name: "clearance-claim", re: /\bclear(ed|s)?\b(?!\s*(?:ly)\b)/i },
  { name: "safety-claim", re: /\bsafe(ly)?\b/i },
  { name: "fine-claim", re: /\b(you(?:'|’)?re|you are|is|are|looks?|seems?)\s+(?:totally\s+|completely\s+)?(fine|okay|ok|good|healthy|healed|recovered)\b/i },
  { name: "health-claim", re: /\bhealth(y|ier)\b/i },
  { name: "recovery-claim", re: /\b(recovered|healed)\b/i },
  { name: "medical-opinion-claim", re: /\bdiagnos/i },
  { name: "all-good-claim", re: /\b(all good|good to go|no problem|nothing to worry|no risk|risk[- ]free|injury[- ]free|in the clear)\b/i },
];

/** Strings allowed to contain banned words because they state what the product does NOT do. Exact match only. */
export const ALLOWLIST = new Set<string>([DISCLAIMER_LONG]);

export function findBanned(text: string, allow: ReadonlySet<string> = ALLOWLIST): string[] {
  if (allow.has(text.trim())) return [];
  return BANNED.filter((b) => b.re.test(text)).map((b) => b.name);
}

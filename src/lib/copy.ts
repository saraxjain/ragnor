// User-facing wording shared across screens. The banned-phrase test scans app, components and lib.
import type { Level } from "./types";

export const DISCLAIMER = "This is not medical advice. A clinician decides.";

// Explicit allowlist for the banned-phrase scan: this longer disclaimer states what the product does NOT do,
// so it necessarily contains words the scan otherwise rejects. Keep it exact; tests/banned-phrases.test.ts
// allowlists this string and nothing else.
export const DISCLAIMER_LONG =
  "Ragnor does not diagnose injuries and cannot clear anyone to play. Only a clinician decides.";

export const LEVEL_LABEL: Record<Level, string> = {
  low: "Lower risk right now",
  moderate: "Moderate risk",
  high: "High risk",
  urgent: "Urgent: see a clinician now",
};

export const URGENT_MESSAGE =
  "Urgent: see a clinician now. This has been queued for your athletic trainer to review. If symptoms are severe or getting worse, call 911 or go to the nearest emergency department.";

export const DEMO_BADGE = "Demo data";
export const DEMO_NOTE = "Example data only. No real athletes or health information.";

export interface FlagView {
  id: string;
  level: "low" | "moderate" | "high" | "urgent";
  bodyArea: string | null;
  reason: string;
  action: string;
  confidence: "normal" | "low";
  trainerAlert: boolean;
}

export interface FormState {
  errors: Record<string, string>;
  /** Set after a successful submit. */
  flags?: FlagView[];
  asOf?: string;
  replaced?: boolean;
}

export const emptyState: FormState = { errors: {} };

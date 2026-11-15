// Client-safe labels (lib/brief.ts imports server-only modules).
export const AGENT_NAME = { signal: "Signal-quality agent", baseline: "Baseline agent", clinical: "Clinical-relevance agent", skeptic: "Skeptic agent", lead: "Lead agent" } as const;

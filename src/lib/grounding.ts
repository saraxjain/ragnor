// STUB: Grounding with Google Search for the coach-view "source".
// The Gemini docs (https://aistudio.google.com/docs/google-search, accessed 2026-11-14) describe `tools: [{ type: "google_search" }]`
// and `url_citation` annotations, but do not say whether grounding can be combined with structured output, and no Gemini key was
// available to test the response shape. Until that is verified, no grounded source is ever attached: the coach row's
// `source.grounding` is always null and the UI shows only the rule id and version.
export interface GroundedSource {
  title: string;
  url: string;
}

export interface GroundingProvider {
  /** A cited public source for the rule's topic, or null. */
  sourceFor(ruleId: string): Promise<GroundedSource | null>;
}

export const stubGrounding: GroundingProvider = {
  async sourceFor() {
    return null;
  },
};

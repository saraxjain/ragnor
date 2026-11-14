import { createMockWearables, type MockStory } from "./mock";
import { createGoogleHealthProvider, createMemoryTokenStore, googleHealthConfigured, type TokenStore } from "./google-health";
import type { WearableProvider } from "./types";

export * from "./types";

const g = globalThis as typeof globalThis & { __ragnorTokens?: TokenStore; __ragnorMock?: WearableProvider };

/** Shared token store for the process (memory in the demo). */
export const tokenStore = (): TokenStore => (g.__ragnorTokens ??= createMemoryTokenStore());

/** Mock stays the default. The Google provider is used only for an athlete who connected an account AND when OAuth is configured. */
export function getWearableProvider(opts: { useGoogle?: boolean } = {}): WearableProvider {
  if (opts.useGoogle && googleHealthConfigured()) return createGoogleHealthProvider({ tokens: tokenStore() });
  return (g.__ragnorMock ??= createMockWearables());
}

/** Used by the demo seed so the mock data tells the demo stories (e.g. an HRV drop after an impact). */
export function setMockWearableStories(stories: Record<string, MockStory>): void {
  g.__ragnorMock = createMockWearables(stories);
}

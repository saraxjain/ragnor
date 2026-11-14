// Mock wearable provider: realistic, deterministic sample data for the fictional demo athletes. NOT real data.
import { addDays, dayDiff } from "../time";
import { DEMO_IDS } from "../data/demo-ids";
import type { WearableDay, WearableProvider } from "./types";

// Small deterministic pseudo-random in [-1, 1] from a string (no Math.random, so demos and tests are repeatable).
function noise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (((h >>> 0) % 2000) / 1000) - 1;
}

const PROFILE: Record<string, { hrv: number; rhr: number; sleep: number }> = {
  [DEMO_IDS.jm]: { hrv: 68, rhr: 54, sleep: 7.4 },
  [DEMO_IDS.ak]: { hrv: 74, rhr: 58, sleep: 7.6 },
  [DEMO_IDS.dw]: { hrv: 63, rhr: 56, sleep: 7.5 },
  [DEMO_IDS.sl]: { hrv: 70, rhr: 52, sleep: 7.8 },
  [DEMO_IDS.mp]: { hrv: 66, rhr: 55, sleep: 7.2 },
  [DEMO_IDS.rt]: { hrv: 78, rhr: 60, sleep: 8.0 },
};

export interface MockStory {
  /** Local date from which the story applies. */
  from: string;
  hrvFactor?: number;
  rhrDelta?: number;
  sleepOverrides?: Record<string, number>;
}

/** `stories` lets the demo seed say "this athlete's HRV drops from this date". */
export function createMockWearables(stories: Record<string, MockStory> = {}): WearableProvider {
  return {
    name: "mock",
    async getDays(athleteId, fromDate, toDate) {
      const base = PROFILE[athleteId];
      if (!base) return [];
      const story = stories[athleteId];
      const out: WearableDay[] = [];
      for (let i = 0; i <= dayDiff(fromDate, toDate); i++) {
        const date = addDays(fromDate, i);
        const inStory = story && date >= story.from;
        const n1 = noise(`${athleteId}|${date}|hrv`);
        const n2 = noise(`${athleteId}|${date}|rhr`);
        const n3 = noise(`${athleteId}|${date}|sleep`);
        out.push({
          localDate: date,
          hrvMs: Math.round(base.hrv * (1 + n1 * 0.06) * (inStory ? (story.hrvFactor ?? 1) : 1)),
          restingHr: Math.round(base.rhr + n2 * 1.5 + (inStory ? (story.rhrDelta ?? 0) : 0)),
          sleepHours: story?.sleepOverrides?.[date] ?? Math.round((base.sleep + n3 * 0.4) * 10) / 10,
        });
      }
      return out;
    },
  };
}

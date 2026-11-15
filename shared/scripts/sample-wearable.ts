// Print sample watch data as JSON, for tests or for posting to the ingest API.
//   npm run sample:wearable                      -> lists the scenarios
//   npm run sample:wearable -- hrv_drop ath_01   -> 28 nights for that athlete, ending today's demo date
//   npm run sample:wearable -- hrv_drop ath_01 2026-11-14 --ingest   -> body for POST /api/v1/ingest/wearable (last 7 nights)
import { SAMPLE_SCENARIOS, isSampleScenario, sampleWearable } from "../../lib/sampleWearable.ts";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ingest = process.argv.includes("--ingest");
const [scenario, athlete = "ath_01", end = JSON.parse(readFileSync("shared/data/seed.json", "utf8")).generated_for] = args;

if (!isSampleScenario(scenario)) {
  console.log("Scenarios:");
  for (const [id, s] of Object.entries(SAMPLE_SCENARIOS)) console.log(`  ${id.padEnd(14)} ${s.label}: ${s.blurb}`);
  console.log("\nUsage: npm run sample:wearable -- <scenario> [athlete_id] [end_date YYYY-MM-DD] [--ingest]");
} else {
  const w = sampleWearable(scenario, athlete, end);
  console.log(JSON.stringify(ingest ? { athlete_id: athlete, days: w.recent } : { athlete_id: athlete, ...w }, null, 2));
}

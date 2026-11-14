// DEMO DATA ONLY. Every person below is fictional and shown by initials. Nothing here is real.
import { addDays, localDateOf, DEFAULT_TIMEZONE } from "../time";
import { DEMO_IDS } from "./demo-ids";
import type { Profile } from "../types";
import { evaluateAthlete } from "../services";
import { GuardedDataAccess } from "./guarded";
import { setMockWearableStories } from "../wearables";
import { MemoryDataAccess, type SeedData } from "./memory";
import type { CheckinWrite, DataAccess } from "./types";

export { DEMO_IDS };


export const DEMO_DESCRIPTIONS: Record<string, string> = {
  [DEMO_IDS.jm]: "adult; short sleep and a jump in training load",
  [DEMO_IDS.ak]: "under 18; consent on file; repeated knee soreness",
  [DEMO_IDS.rt]: "under 18; NO consent yet, so submissions are blocked",
  [DEMO_IDS.dw]: "adult; reported a head impact 2 days ago, delayed symptom",
  [DEMO_IDS.sl]: "adult; steady data, no flags",
  [DEMO_IDS.mp]: "adult; reported a red-flag symptom today",
};

export function demoSeed(now: Date): SeedData {
  const year = now.getUTCFullYear();
  const p = (id: string, role: Profile["role"], displayLabel: string, dateOfBirth: string | null): Profile => ({
    id,
    role,
    displayLabel,
    dateOfBirth,
    timezone: DEFAULT_TIMEZONE,
    schoolId: DEMO_IDS.school,
  });
  const profiles = [
    p(DEMO_IDS.trainer, "trainer", "T.R.", `${year - 40}-03-02`),
    p(DEMO_IDS.coach, "coach", "C.H.", `${year - 45}-07-19`),
    p(DEMO_IDS.parent, "parent", "P.K.", `${year - 44}-11-05`),
    p(DEMO_IDS.jm, "athlete", "J.M.", `${year - 21}-05-14`),
    p(DEMO_IDS.ak, "athlete", "A.K.", `${year - 16}-06-15`),
    p(DEMO_IDS.rt, "athlete", "R.T.", `${year - 15}-09-30`),
    p(DEMO_IDS.dw, "athlete", "D.W.", `${year - 20}-01-22`),
    p(DEMO_IDS.sl, "athlete", "S.L.", `${year - 22}-12-08`),
    p(DEMO_IDS.mp, "athlete", "M.P.", `${year - 19}-04-27`),
  ];
  return {
    profiles,
    teams: [{ id: DEMO_IDS.team, name: "Example Team (demo)", schoolId: DEMO_IDS.school }],
    memberships: profiles.filter((x) => x.role !== "parent").map((x) => ({ teamId: DEMO_IDS.team, profileId: x.id })),
    guardians: [
      { guardianId: DEMO_IDS.parent, athleteId: DEMO_IDS.ak },
      { guardianId: DEMO_IDS.parent, athleteId: DEMO_IDS.rt },
    ],
  };
}

const steady = (athleteId: string, date: string, over: Partial<CheckinWrite> = {}): CheckinWrite => ({
  athleteId,
  localDate: date,
  sleepHours: 7.5,
  workloadMinutes: 60,
  workloadIntensity: 6,
  soreness: {},
  symptoms: [],
  note: null,
  submittedAt: `${date}T18:00:00.000Z`,
  ...over,
});

/** Fresh in-memory store with example data, evaluated through the real rules engine. */
export async function createDemoStore(now: Date = new Date()): Promise<DataAccess> {
  const inner = new MemoryDataAccess(demoSeed(now));
  const da = new GuardedDataAccess(inner);
  const today = localDateOf(now, DEFAULT_TIMEZONE);
  // Mock wearable stories: J.M.'s HRV and sleep drop over the last three days; D.W.'s HRV dips and resting HR rises after the impact.
  setMockWearableStories({
    [DEMO_IDS.jm]: { from: addDays(today, -2), hrvFactor: 0.68, sleepOverrides: { [today]: 5.5 } },
    [DEMO_IDS.dw]: { from: addDays(today, -2), hrvFactor: 0.8, rhrDelta: 7 },
  });
  const trainer = { id: DEMO_IDS.trainer, role: "trainer" as const };
  const sys = trainer; // seeding writes bypass the consent gate on purpose; R.T. stays empty
  const put = (c: CheckinWrite) => inner.upsertCheckin(sys, c);

  for (let back = 13; back >= 0; back--) {
    const date = addDays(today, -back);
    const thisWeek = back <= 6;
    // J.M.: short sleep on 4 of the last 7 nights and a big jump in training load.
    await put(
      steady(DEMO_IDS.jm, date, {
        sleepHours: thisWeek && [5, 3, 2, 0].includes(back) ? 5.5 : 7.2,
        workloadMinutes: thisWeek ? 75 : 45,
        workloadIntensity: thisWeek ? 8 : 5,
      }),
    );
    // A.K.: knee soreness 2 on the last three days (consent is granted below).
    await put(steady(DEMO_IDS.ak, date, { soreness: back <= 2 ? { knee: 2 } : {} }));
    // D.W. and S.L.: steady, complete data.
    await put(steady(DEMO_IDS.dw, date));
    await put(steady(DEMO_IDS.sl, date));
    // M.P.: steady, plus a red-flag symptom reported today.
    await put(steady(DEMO_IDS.mp, date, { symptoms: back === 0 ? ["numbness"] : [] }));
  }

  await inner.grantConsent({ id: DEMO_IDS.parent, role: "parent" }, DEMO_IDS.ak, now.toISOString());

  // D.W.: head impact two days ago; day 1 logged with no symptoms, day 2 a delayed symptom.
  const impact = await inner.createImpact(sys, {
    athleteId: DEMO_IDS.dw,
    occurredAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
    context: "Example: contact in practice",
  });
  await inner.upsertSymptomLog(sys, { impactEventId: impact.id, athleteId: DEMO_IDS.dw, day: 1, symptoms: [], severity: 0, loggedAt: impact.occurredAt });
  await inner.upsertSymptomLog(sys, { impactEventId: impact.id, athleteId: DEMO_IDS.dw, day: 2, symptoms: ["headache"], severity: 1, loggedAt: now.toISOString() });

  for (const id of [DEMO_IDS.jm, DEMO_IDS.ak, DEMO_IDS.rt, DEMO_IDS.dw, DEMO_IDS.sl, DEMO_IDS.mp]) {
    await evaluateAthlete(da, trainer, id, now);
  }
  return da;
}

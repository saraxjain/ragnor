import { addDays } from "@/lib/time";
import type { CheckinInput, ImpactInput, RuleContext } from "@/lib/rules";

export const TODAY = "2026-03-15";
export const TZ = "America/Los_Angeles";

type Make = (daysAgo: number) => Partial<CheckinInput> | null; // null = no check-in that day

/** 14 days of check-ins ending TODAY. Defaults: 7.5 h sleep, 60 min at intensity 5 (load 300), no soreness. */
export function ctxWith(make: Make = () => ({}), extra: Partial<RuleContext> = {}): RuleContext {
  const checkins: CheckinInput[] = [];
  for (let back = 13; back >= 0; back--) {
    const o = make(back);
    if (o === null) continue;
    checkins.push({
      localDate: addDays(TODAY, -back),
      sleepHours: 7.5,
      workloadMinutes: 60,
      workloadIntensity: 5,
      soreness: {},
      symptoms: [],
      ...o,
    });
  }
  return { today: TODAY, timezone: TZ, checkins, impacts: [], ...extra };
}

export const impactAt = (daysAgo: number, logs: ImpactInput["symptomLogs"] = [], id = "imp-1"): ImpactInput => ({
  id,
  // 18:00 UTC is 10:00/11:00 in Los Angeles, safely inside the same local day.
  occurredAt: `${addDays(TODAY, -daysAgo)}T18:00:00.000Z`,
  symptomLogs: logs,
});

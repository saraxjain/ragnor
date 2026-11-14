import { describe, expect, it } from "vitest";
import {
  RED_FLAG_SYMPTOMS,
  RULES,
  RULES_VERSION,
  THRESHOLDS,
  UnknownRulesVersionError,
  replay,
  replayFlag,
  runRules,
  CDC_DANGER_SIGNS,
  FOUNDERS_RED_FLAGS_UNVALIDATED,
} from "@/lib/rules";
import { ctxWith, impactAt, TODAY } from "./helpers";

const byRule = (ctx: Parameters<typeof runRules>[0], id: string) => runRules(ctx).filter((f) => f.ruleId === id);

describe("rule set", () => {
  it("exports every starting rule with id, description and evaluate", () => {
    expect(RULES.map((r) => r.id).sort()).toEqual(
      ["hitwatch-escalation", "hrv-sleep", "insufficient-data", "landing-band", "missed-followup", "post-impact-symptom", "red-flag", "sleep-load", "soreness-persisting", "unconfirmed-red-flag"].sort(),
    );
    for (const r of RULES) {
      expect(r.description.length).toBeGreaterThan(10);
      expect(typeof r.evaluate).toBe("function");
    }
    expect(RULES_VERSION).toMatch(/unvalidated/);
  });

  it("produces no flags for 14 complete, benign days", () => {
    expect(runRules(ctxWith())).toEqual([]);
  });
});

describe("sleep-load (boundaries)", () => {
  // Prior week load is 300/day. Intensity 5: 75 min = 375 = exactly +25%.
  const shortOn = (n: number, hours: number) => (back: number) =>
    back <= 6 ? { sleepHours: back < n ? hours : 7.5, workloadMinutes: 76, workloadIntensity: 5 } : {};

  it("fires moderate/general with the numbers in the reason (4 short nights, +31%)", () => {
    const ctx = ctxWith((b) => (b <= 6 ? { sleepHours: b < 4 ? 5 : 7.5, workloadMinutes: 131, workloadIntensity: 3 } : {}));
    const [f] = byRule(ctx, "sleep-load");
    expect(f.level).toBe("moderate");
    expect(f.bodyArea).toBeNull();
    expect(f.confidence).toBe("normal");
    expect(f.reason).toBe("Sleep was under 6 hours on 4 of the last 7 nights while training load rose 31%.");
  });

  it("exactly 6 h is not short", () => {
    expect(byRule(ctxWith(shortOn(7, 6)), "sleep-load")).toHaveLength(0);
  });

  it("just under 6 h on exactly 3 nights counts", () => {
    expect(byRule(ctxWith(shortOn(3, 5.99)), "sleep-load")).toHaveLength(1);
  });

  it("only 2 short nights does not fire", () => {
    expect(byRule(ctxWith(shortOn(2, 4)), "sleep-load")).toHaveLength(0);
  });

  it("exactly +25% load does not fire, a little more does", () => {
    const exact = (b: number) => (b <= 6 ? { sleepHours: b < 3 ? 5 : 7.5, workloadMinutes: 75, workloadIntensity: 5 } : {});
    expect(byRule(ctxWith(exact), "sleep-load")).toHaveLength(0);
    const over = (b: number) => (b <= 6 ? { sleepHours: b < 3 ? 5 : 7.5, workloadMinutes: 76, workloadIntensity: 5 } : {});
    expect(byRule(ctxWith(over), "sleep-load")).toHaveLength(1);
  });

  it("short sleep with flat load does not fire", () => {
    expect(byRule(ctxWith((b) => (b <= 6 ? { sleepHours: 4 } : {})), "sleep-load")).toHaveLength(0);
  });
});

describe("soreness-persisting (boundaries)", () => {
  const knee = (levels: Record<number, 1 | 2 | 3>) => (b: number) => (levels[b] ? { soreness: { knee: levels[b] } } : {});

  it("2 on exactly 3 consecutive days => moderate for that area", () => {
    const [f] = byRule(ctxWith(knee({ 0: 2, 1: 2, 2: 2 })), "soreness-persisting");
    expect(f.level).toBe("moderate");
    expect(f.bodyArea).toBe("knee");
    expect(f.reason).toBe("Knee soreness was 2 or higher on 3 days in a row (2, 2, 2).");
  });

  it("only 2 consecutive days does not fire", () => {
    expect(byRule(ctxWith(knee({ 0: 2, 1: 2 })), "soreness-persisting")).toHaveLength(0);
  });

  it("a day at level 1 breaks the run", () => {
    expect(byRule(ctxWith(knee({ 0: 2, 1: 1, 2: 2 })), "soreness-persisting")).toHaveLength(0);
  });

  it("non-consecutive days do not count", () => {
    expect(byRule(ctxWith(knee({ 0: 2, 2: 2, 3: 2 })), "soreness-persisting")).toHaveLength(0);
  });

  it("combined with a load increase => high", () => {
    const ctx = ctxWith((b) => ({
      ...(b <= 6 ? { workloadMinutes: 90, workloadIntensity: 5 } : {}),
      ...(b <= 2 ? { soreness: { knee: 2 as const } } : {}),
    }));
    const [f] = byRule(ctx, "soreness-persisting");
    expect(f.level).toBe("high");
    expect(f.reason).toMatch(/while training load rose 50%/);
  });

  it("soreness 3 on 2 consecutive days => high", () => {
    const [f] = byRule(ctxWith(knee({ 0: 3, 1: 3 })), "soreness-persisting");
    expect(f.level).toBe("high");
    expect(f.bodyArea).toBe("knee");
  });

  it("soreness 3 on only 1 day, or on non-consecutive days, does not reach high", () => {
    expect(byRule(ctxWith(knee({ 0: 3 })), "soreness-persisting")).toHaveLength(0);
    expect(byRule(ctxWith(knee({ 0: 3, 2: 3 })), "soreness-persisting")).toHaveLength(0);
  });

  it("areas are independent", () => {
    const ctx = ctxWith((b) => (b <= 2 ? { soreness: { knee: 2 as const, hip: 1 as const } } : {}));
    const out = byRule(ctx, "soreness-persisting");
    expect(out.map((f) => f.bodyArea)).toEqual(["knee"]);
  });
});

describe("post-impact-symptom", () => {
  it("any symptom in the window => high + trainer alert; day 1 is not delayed", () => {
    const ctx = ctxWith(() => ({}), { impacts: [impactAt(0, [{ day: 1, symptoms: ["headache"], severity: 1 }])] });
    const [f] = byRule(ctx, "post-impact-symptom");
    expect(f.level).toBe("high");
    expect(f.trainerAlert).toBe(true);
    expect(f.reason).not.toMatch(/delayed/i);
  });

  it("first appearing on day 2 or later is labelled a delayed symptom", () => {
    const ctx = ctxWith(() => ({}), {
      impacts: [impactAt(1, [{ day: 1, symptoms: [], severity: 0 }, { day: 2, symptoms: ["dizziness"], severity: 1 }])],
    });
    const [f] = byRule(ctx, "post-impact-symptom");
    expect(f.reason).toMatch(/^Delayed symptom: dizziness first reported on day 2/);
  });

  it("a symptom ticked on the daily check-in inside the window counts", () => {
    const ctx = ctxWith((b) => (b === 0 ? { symptoms: ["nausea"] } : {}), { impacts: [impactAt(2)] });
    const [f] = byRule(ctx, "post-impact-symptom");
    expect(f.reason).toMatch(/^Delayed symptom: nausea first reported on day 3/);
  });

  it("no symptoms => no flag; symptoms after day 7 are outside the window", () => {
    expect(byRule(ctxWith(() => ({}), { impacts: [impactAt(0, [{ day: 1, symptoms: [], severity: 0 }])] }), "post-impact-symptom")).toHaveLength(0);
    // impact 9 days ago: today is day 10, outside the 7-day window
    const late = ctxWith((b) => (b === 0 ? { symptoms: ["headache"] } : {}), { impacts: [impactAt(9)] });
    expect(byRule(late, "post-impact-symptom")).toHaveLength(0);
  });

  it("day 7 is inside the window, day 8 is not", () => {
    const d7 = ctxWith((b) => (b === 0 ? { symptoms: ["headache"] } : {}), { impacts: [impactAt(6)] });
    expect(byRule(d7, "post-impact-symptom")).toHaveLength(1);
    const d8 = ctxWith((b) => (b === 0 ? { symptoms: ["headache"] } : {}), { impacts: [impactAt(7)] });
    expect(byRule(d8, "post-impact-symptom")).toHaveLength(0);
  });
});

describe("red-flag (rule 2): every red-flag symptom escalates", () => {
  it("covers the CDC list (8 danger signs) and the unvalidated founders list (5)", () => {
    expect(CDC_DANGER_SIGNS).toHaveLength(8);
    expect(FOUNDERS_RED_FLAGS_UNVALIDATED.map((s) => s.id).sort()).toEqual(["numbness", "pop", "recurring_spasms", "swelling", "weakness"]);
  });

  it.each(RED_FLAG_SYMPTOMS.map((s) => [s.id, s.label] as const))("check-in symptom %s => urgent + trainer alert", (id) => {
    const ctx = ctxWith((b) => (b === 0 ? { symptoms: [id] } : {}));
    const flags = byRule(ctx, "red-flag");
    expect(flags).toHaveLength(1);
    expect(flags[0].level).toBe("urgent");
    expect(flags[0].trainerAlert).toBe(true);
    expect(flags[0].action.toLowerCase()).toContain("see a clinician now");
    expect(runRules(ctx)[0].level).toBe("urgent"); // ranked first
  });

  it.each(RED_FLAG_SYMPTOMS.map((s) => [s.id] as const))("follow-up log symptom %s => urgent, even with no other data", (id) => {
    const ctx = { today: TODAY, timezone: "America/Los_Angeles", checkins: [], impacts: [impactAt(0, [{ day: 1, symptoms: [id], severity: 3 }])] };
    const urgent = runRules(ctx).filter((f) => f.level === "urgent");
    expect(urgent).toHaveLength(1);
    expect(urgent[0].ruleId).toBe("red-flag");
    expect(urgent[0].trainerAlert).toBe(true);
    expect(urgent[0].confidence).toBe("normal");
  });

  it("nothing demotes an urgent flag: engine forces trainerAlert on any urgent result", () => {
    const ctx = ctxWith((b) => (b === 0 ? { symptoms: ["cdc_seizure"], sleepHours: null, workloadMinutes: null, workloadIntensity: null } : {}));
    const flags = runRules(ctx);
    expect(flags.filter((f) => f.level === "urgent").every((f) => f.trainerAlert)).toBe(true);
    expect(flags.some((f) => f.ruleId === "insufficient-data")).toBe(false); // data is present except load; still urgent below
  });
});

describe("missed-followup", () => {
  it("a missed day in an active follow-up prompts the athlete, without raising the level", () => {
    const ctx = ctxWith(() => ({}), { impacts: [impactAt(3, [{ day: 1, symptoms: [], severity: 0 }, { day: 3, symptoms: [], severity: 0 }])] });
    const flags = byRule(ctx, "missed-followup");
    expect(flags).toHaveLength(1);
    expect(flags[0].level).toBe("low");
    expect(flags[0].reason).toBe("No symptom log for day 2 of the 7-day follow-up after a head impact.");
    expect(flags[0].action).toMatch(/Log today/);
    expect(runRules(ctx).every((f) => f.level === "low")).toBe(true);
  });

  it("today's log is not yet missed; day 1 of a fresh impact has nothing missed", () => {
    expect(byRule(ctxWith(() => ({}), { impacts: [impactAt(0)] }), "missed-followup")).toHaveLength(0);
    expect(byRule(ctxWith(() => ({}), { impacts: [impactAt(1, [{ day: 1, symptoms: [], severity: 0 }])] }), "missed-followup")).toHaveLength(0);
  });

  it("lists several missed days, and stops once the window is over", () => {
    const f = byRule(ctxWith(() => ({}), { impacts: [impactAt(4)] }), "missed-followup")[0];
    expect(f.reason).toMatch(/days 1, 2, 3 and 4/);
    expect(byRule(ctxWith(() => ({}), { impacts: [impactAt(7)] }), "missed-followup")).toHaveLength(0);
  });
});

describe("insufficient-data (rule 5: missing data never becomes a guess)", () => {
  it("one day of data: low-confidence note naming what is missing, and no moderate/high", () => {
    const ctx = ctxWith((b) => (b === 0 ? { sleepHours: 4, soreness: { knee: 3 } } : null));
    const flags = runRules(ctx);
    expect(flags.every((f) => f.level === "low")).toBe(true);
    const note = flags.find((f) => f.ruleId === "insufficient-data")!;
    expect(note.confidence).toBe("low");
    expect(note.reason).toMatch(/sleep hours for 6 of the last 7 nights/);
    expect(note.reason).toMatch(/training load for 6 of the last 7 days/);
    expect(note.reason).toMatch(/check-ins for 2026-03-13, 2026-03-14/);
  });

  it("sleep-load does not fire when too few nights were reported, even if the reported ones are short and load is up", () => {
    const ctx = ctxWith((b) => ({
      sleepHours: b <= 3 ? 4 : null, // only 4 of 7 nights reported (< 5 needed)
      ...(b <= 6 ? { workloadMinutes: 200 } : {}),
    }));
    expect(byRule(ctx, "sleep-load")).toHaveLength(0);
    expect(byRule(ctx, "insufficient-data")[0].reason).toMatch(/sleep hours for 3 of the last 7 nights/);
  });

  it("a missing check-in inside the soreness window blocks the soreness rule and is named", () => {
    const ctx = ctxWith((b) => (b === 1 ? null : b <= 2 ? { soreness: { knee: 2 as const } } : {}));
    expect(byRule(ctx, "soreness-persisting")).toHaveLength(0);
    expect(byRule(ctx, "insufficient-data")[0].reason).toMatch(/check-ins for 2026-03-14/);
  });

  it("an unreported load is not treated as zero (prior week missing => no percent change)", () => {
    const ctx = ctxWith((b) => (b >= 7 ? { workloadMinutes: null, workloadIntensity: null } : { sleepHours: 4, workloadMinutes: 300 }));
    expect(byRule(ctx, "sleep-load")).toHaveLength(0);
    expect(byRule(ctx, "insufficient-data")[0].reason).toMatch(/days before that/);
  });

  it("a prior week of zero load cannot give a percent change and says so", () => {
    const ctx = ctxWith((b) => (b >= 7 ? { workloadMinutes: 0 } : { sleepHours: 4, workloadMinutes: 100 }));
    expect(byRule(ctx, "sleep-load")).toHaveLength(0);
    expect(byRule(ctx, "insufficient-data")[0].reason).toMatch(/non-zero training load in the prior week/);
  });
});

describe("rule 4: stored rule id, rules version, inputs snapshot, and replay", () => {
  const ctx = ctxWith((b) => ({
    sleepHours: b < 4 ? 5 : 7.5,
    workloadMinutes: b <= 6 ? 131 : 60,
    workloadIntensity: b <= 6 ? 3 : 5,
    soreness: b <= 2 ? { knee: 2 as const } : {},
    symptoms: b === 0 ? ["numbness"] : [],
  }), { impacts: [impactAt(1, [{ day: 2, symptoms: ["headache"], severity: 2 }])] });

  it("every flag carries ruleId, rulesVersion and a deep copy of its inputs", () => {
    const flags = runRules(ctx);
    expect(flags.length).toBeGreaterThanOrEqual(4);
    for (const f of flags) {
      expect(f.ruleId).toBeTruthy();
      expect(f.rulesVersion).toBe(RULES_VERSION);
      expect(f.inputs).toEqual(ctx);
      expect(f.inputs).not.toBe(ctx);
    }
    ctx.checkins[0].sleepHours = 0; // mutate the original afterwards
    expect(flags[0].inputs.checkins[0].sleepHours).not.toBe(0);
    ctx.checkins[0].sleepHours = 7.5;
  });

  it("same inputs + same rules version => identical flags", () => {
    const a = runRules(ctx, RULES_VERSION);
    const b = replay(JSON.parse(JSON.stringify(ctx)), RULES_VERSION); // as if reloaded from the database
    expect(b).toEqual(a);
  });

  it("each stored flag can be replayed from its own snapshot and reproduces itself", () => {
    for (const f of runRules(ctx)) {
      const stored = JSON.parse(JSON.stringify(f)); // simulate a jsonb round trip
      const again = replayFlag(stored);
      expect(again.some((x) => x.ruleId === f.ruleId && x.level === f.level && x.reason === f.reason && x.bodyArea === f.bodyArea)).toBe(true);
    }
  });

  it("an unknown rules version is refused rather than silently replayed with different rules", () => {
    expect(() => replay(ctx, "0.0.0-nope")).toThrow(UnknownRulesVersionError);
  });

  it("thresholds are the documented placeholders", () => {
    expect(THRESHOLDS).toMatchObject({ SHORT_SLEEP_HOURS: 6, SHORT_SLEEP_NIGHTS: 3, LOAD_INCREASE_PERCENT: 25, SORENESS_PERSISTING_DAYS: 3 });
  });
});

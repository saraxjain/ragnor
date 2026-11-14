import { describe, expect, it } from "vitest";
import { addDays, ageOn, dayDiff, followUpDayNumber, followUpSchedule, isMinorOn, localDateOf } from "@/lib/time";
import { runRules } from "@/lib/rules";
import { ctxWith } from "./helpers";

const LA = "America/Los_Angeles";
const TOKYO = "Asia/Tokyo";

describe("local day from a UTC instant", () => {
  it("the same instant is a different calendar day in different zones", () => {
    const t = "2026-03-09T06:30:00.000Z";
    expect(localDateOf(t, "UTC")).toBe("2026-03-09");
    expect(localDateOf(t, LA)).toBe("2026-03-08"); // 23:30 PDT the evening before
    expect(localDateOf(t, TOKYO)).toBe("2026-03-09");
  });

  it("midnight boundary in Los Angeles (PDT, UTC-7)", () => {
    expect(localDateOf("2026-03-15T06:59:59.000Z", LA)).toBe("2026-03-14");
    expect(localDateOf("2026-03-15T07:00:00.000Z", LA)).toBe("2026-03-15");
  });

  it("midnight boundary in winter (PST, UTC-8)", () => {
    expect(localDateOf("2026-01-15T07:59:59.000Z", LA)).toBe("2026-01-14");
    expect(localDateOf("2026-01-15T08:00:00.000Z", LA)).toBe("2026-01-15");
  });
});

describe("7-day follow-up schedule", () => {
  it("day 1 is the athlete's local calendar day of the impact; day 7 is six days later", () => {
    const s = followUpSchedule("2026-03-09T06:30:00.000Z", LA);
    expect(s).toHaveLength(7);
    expect(s[0]).toEqual({ day: 1, localDate: "2026-03-08" });
    expect(s[6]).toEqual({ day: 7, localDate: "2026-03-14" });
    // The same instant for a UTC-zone athlete starts a day later.
    expect(followUpSchedule("2026-03-09T06:30:00.000Z", TOKYO)[0].localDate).toBe("2026-03-09");
  });

  it("day numbers and the window end follow the local midnight, not UTC midnight", () => {
    const impact = "2026-03-09T06:30:00.000Z"; // 2026-03-08 local (LA)
    // Just before local midnight at the end of day 7 (2026-03-14 23:59 PDT = 2026-03-15T06:59Z)
    expect(followUpDayNumber(impact, localDateOf("2026-03-15T06:59:00.000Z", LA), LA)).toBe(7);
    // One minute later it is local day 8: the window is over
    expect(followUpDayNumber(impact, localDateOf("2026-03-15T07:00:00.000Z", LA), LA)).toBe(8);
    // A UTC clock would already call 2026-03-15T06:59Z day 7 of a window that began 2026-03-09 UTC, i.e. a different day entirely
    expect(followUpDayNumber(impact, localDateOf("2026-03-15T06:59:00.000Z", "UTC"), "UTC")).toBe(7);
  });

  it("is stable across the spring-forward and fall-back changes", () => {
    const spring = followUpSchedule("2026-03-06T20:00:00.000Z", LA); // DST starts 2026-03-08
    expect(spring.map((d) => d.localDate)).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12"]);
    const fall = followUpSchedule("2026-10-31T20:00:00.000Z", LA); // DST ends 2026-11-01
    expect(fall.map((d) => d.localDate)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(followUpDayNumber("2026-10-31T20:00:00.000Z", "2026-11-06", LA)).toBe(7);
  });

  it("the rules engine computes follow-up days in the athlete's zone", () => {
    // Impact 2026-03-09T06:30Z. On local 2026-03-09 a Los Angeles athlete is on day 2, a Tokyo athlete on day 1.
    const impact = { id: "i", occurredAt: "2026-03-09T06:30:00.000Z", symptomLogs: [] };
    const base = ctxWith((b) => (b === 6 ? { localDate: "2026-03-09", symptoms: ["headache"] } : {}), { today: "2026-03-09", impacts: [impact] });
    // Re-key check-ins so one falls on 2026-03-09
    const ctx = { ...base, checkins: [{ localDate: "2026-03-09", sleepHours: 7, workloadMinutes: 0, workloadIntensity: null, soreness: {}, symptoms: ["headache"] }] };
    const la = runRules({ ...ctx, timezone: LA }).find((f) => f.ruleId === "post-impact-symptom")!;
    const tk = runRules({ ...ctx, timezone: TOKYO }).find((f) => f.ruleId === "post-impact-symptom")!;
    expect(la.reason).toMatch(/^Delayed symptom: .* day 2/);
    expect(tk.reason).not.toMatch(/Delayed/);
    expect(tk.reason).toMatch(/day 1/);
  });
});

describe("date helpers and the age boundary", () => {
  it("addDays and dayDiff are calendar-based", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(dayDiff("2026-03-08", "2026-03-15")).toBe(7);
  });

  it("turns 18 exactly on the birthday", () => {
    expect(ageOn("2008-03-15", "2026-03-14")).toBe(17);
    expect(ageOn("2008-03-15", "2026-03-15")).toBe(18);
    expect(isMinorOn("2008-03-15", "2026-03-14")).toBe(true);
    expect(isMinorOn("2008-03-15", "2026-03-15")).toBe(false);
  });

  it("an unknown date of birth fails closed (treated as a minor)", () => {
    expect(isMinorOn(null, "2026-03-15")).toBe(true);
  });
});

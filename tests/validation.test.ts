import { describe, expect, it } from "vitest";
import { parseCheckin, parseImpact, parseSymptomLog } from "@/lib/validation";

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => fd.append(k, x));
  return fd;
};
const bad = (o: Record<string, string | string[]>) => {
  const r = parseCheckin(form(o));
  return r.ok ? null : r.errors;
};

describe("check-in validation (server side)", () => {
  it("accepts an empty check-in (everything is optional; nothing is guessed)", () => {
    const r = parseCheckin(form({}));
    expect(r).toEqual({ ok: true, value: { sleepHours: null, workloadMinutes: null, workloadIntensity: null, soreness: {}, symptoms: [], note: null } });
  });

  it("sleep 0-24", () => {
    expect(bad({ sleepHours: "0" })).toBeNull();
    expect(bad({ sleepHours: "24" })).toBeNull();
    expect(bad({ sleepHours: "-0.5" })).toHaveProperty("sleepHours");
    expect(bad({ sleepHours: "24.5" })).toHaveProperty("sleepHours");
    expect(bad({ sleepHours: "abc" })).toHaveProperty("sleepHours");
  });

  it("minutes 0-600 and whole numbers", () => {
    expect(bad({ workloadMinutes: "600", workloadIntensity: "5" })).toBeNull();
    expect(bad({ workloadMinutes: "601", workloadIntensity: "5" })).toHaveProperty("workloadMinutes");
    expect(bad({ workloadMinutes: "-1" })).toHaveProperty("workloadMinutes");
    expect(bad({ workloadMinutes: "30.5", workloadIntensity: "5" })).toHaveProperty("workloadMinutes");
  });

  it("intensity 1-10, required when minutes are above 0", () => {
    expect(bad({ workloadMinutes: "30", workloadIntensity: "1" })).toBeNull();
    expect(bad({ workloadMinutes: "30", workloadIntensity: "10" })).toBeNull();
    expect(bad({ workloadMinutes: "30", workloadIntensity: "0" })).toHaveProperty("workloadIntensity");
    expect(bad({ workloadMinutes: "30", workloadIntensity: "11" })).toHaveProperty("workloadIntensity");
    expect(bad({ workloadMinutes: "30" })).toHaveProperty("workloadIntensity");
    expect(bad({ workloadMinutes: "0" })).toBeNull();
  });

  it("soreness 0-3 per area, and only touched (non-zero) areas are stored", () => {
    const ok = parseCheckin(form({ soreness_knee: "2", soreness_hip: "0", soreness_quad: "3" }));
    expect(ok).toMatchObject({ ok: true, value: { soreness: { knee: 2, quad: 3 } } });
    expect(ok.ok && Object.keys(ok.value.soreness)).not.toContain("hip");
    expect(bad({ soreness_knee: "4" })).toHaveProperty("soreness_knee");
    expect(bad({ soreness_knee: "-1" })).toHaveProperty("soreness_knee");
    expect(bad({ soreness_knee: "1.5" })).toHaveProperty("soreness_knee");
  });

  it("rejects unknown symptoms and over-long notes; de-duplicates symptoms", () => {
    expect(bad({ symptoms: ["not_a_symptom"] })).toHaveProperty("symptoms");
    expect(bad({ note: "x".repeat(501) })).toHaveProperty("note");
    const r = parseCheckin(form({ symptoms: ["headache", "headache"] }));
    expect(r.ok && r.value.symptoms).toEqual(["headache"]);
  });
});

describe("follow-up and impact validation", () => {
  it("severity 0-3, required when symptoms are ticked", () => {
    expect(parseSymptomLog(form({ symptoms: ["headache"], severity: "3" })).ok).toBe(true);
    expect(parseSymptomLog(form({ symptoms: ["headache"], severity: "4" })).ok).toBe(false);
    expect(parseSymptomLog(form({ symptoms: ["headache"] })).ok).toBe(false);
    expect(parseSymptomLog(form({}))).toEqual({ ok: true, value: { symptoms: [], severity: 0 } });
  });

  it("impact description is limited to 500 characters", () => {
    expect(parseImpact(form({ context: "x".repeat(500) })).ok).toBe(true);
    expect(parseImpact(form({ context: "x".repeat(501) })).ok).toBe(false);
  });
});

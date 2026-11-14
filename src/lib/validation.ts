import { z } from "zod";
import { BODY_AREAS, type BodyArea, type Soreness, type SorenessLevel } from "./types";
import { isKnownSymptom } from "./rules/symptoms";

// Server-side validation of every form. Ranges: sleep 0-24, soreness 0-3, intensity 1-10, minutes 0-600.

export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const optionalNumber = (min: number, max: number, label: string, integer = false) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v) : v),
    (integer
      ? z.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`)
      : z.number({ error: `${label} must be a number` })
    )
      .min(min, `${label} must be between ${min} and ${max}`)
      .max(max, `${label} must be between ${min} and ${max}`)
      .optional(),
  );

const symptomList = z
  .array(z.string())
  .max(40)
  .refine((l) => l.every(isKnownSymptom), "Unknown symptom selected");

export const checkinSchema = z
  .object({
    sleepHours: optionalNumber(0, 24, "Sleep hours"),
    workloadMinutes: optionalNumber(0, 600, "Practice minutes", true),
    workloadIntensity: optionalNumber(1, 10, "Intensity", true),
    soreness: z.record(z.string(), z.number().int().min(0).max(3)),
    symptoms: symptomList,
    note: z.string().trim().max(500, "Note must be 500 characters or fewer").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.workloadMinutes !== undefined && v.workloadMinutes > 0 && v.workloadIntensity === undefined) {
      ctx.addIssue({ code: "custom", path: ["workloadIntensity"], message: "Intensity (1 to 10) is needed when minutes are above 0" });
    }
  });

export const symptomLogSchema = z.object({
  symptoms: symptomList,
  severity: optionalNumber(0, 3, "Severity", true),
});

export const impactSchema = z.object({
  context: z.string().trim().max(500, "Description must be 500 characters or fewer").optional(),
});

function toErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function formValue(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" ? v : undefined;
}

export type CheckinForm = {
  sleepHours: number | null;
  workloadMinutes: number | null;
  workloadIntensity: number | null;
  soreness: Soreness;
  symptoms: string[];
  note: string | null;
};

/** Parse a check-in from FormData or a plain object. Only touched (non-zero) soreness areas are kept. */
export function parseCheckin(fd: FormData): Parsed<CheckinForm> {
  const soreness: Record<string, number> = {};
  const errors: FieldErrors = {};
  for (const area of BODY_AREAS) {
    const raw = formValue(fd, `soreness_${area}`);
    if (raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 3) {
      errors[`soreness_${area}`] = "Soreness must be 0, 1, 2 or 3";
      continue;
    }
    soreness[area] = n;
  }
  const res = checkinSchema.safeParse({
    sleepHours: formValue(fd, "sleepHours"),
    workloadMinutes: formValue(fd, "workloadMinutes"),
    workloadIntensity: formValue(fd, "workloadIntensity"),
    soreness,
    symptoms: fd.getAll("symptoms").filter((x): x is string => typeof x === "string"),
    note: formValue(fd, "note") || undefined,
  });
  if (!res.success) return { ok: false, errors: { ...toErrors(res.error), ...errors } };
  if (Object.keys(errors).length) return { ok: false, errors };
  const v = res.data;
  const touched: Soreness = {};
  for (const [k, n] of Object.entries(v.soreness)) if (n > 0) touched[k as BodyArea] = n as SorenessLevel;
  return {
    ok: true,
    value: {
      sleepHours: v.sleepHours ?? null,
      workloadMinutes: v.workloadMinutes ?? null,
      workloadIntensity: v.workloadMinutes === 0 ? null : (v.workloadIntensity ?? null),
      soreness: touched,
      symptoms: [...new Set(v.symptoms)],
      note: v.note ?? null,
    },
  };
}

export function parseSymptomLog(fd: FormData): Parsed<{ symptoms: string[]; severity: number | null }> {
  const res = symptomLogSchema.safeParse({
    symptoms: fd.getAll("symptoms").filter((x): x is string => typeof x === "string"),
    severity: formValue(fd, "severity"),
  });
  if (!res.success) return { ok: false, errors: toErrors(res.error) };
  const symptoms = [...new Set(res.data.symptoms)];
  if (symptoms.length > 0 && res.data.severity === undefined) {
    return { ok: false, errors: { severity: "Pick a severity (0 to 3) when you select symptoms" } };
  }
  return { ok: true, value: { symptoms, severity: symptoms.length === 0 ? 0 : (res.data.severity ?? null) } };
}

export function parseImpact(fd: FormData): Parsed<{ context: string | null }> {
  const res = impactSchema.safeParse({ context: formValue(fd, "context") || undefined });
  if (!res.success) return { ok: false, errors: toErrors(res.error) };
  return { ok: true, value: { context: res.data.context ?? null } };
}

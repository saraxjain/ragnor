// Shared JSON shapes between teammates' pieces, exactly as drafted in docs/PLAN.md ("Shared JSON shapes (draft)"):
//   {"landing":  {"items":[{"id":"knee_valgus","present":true,"side":"left","timestamp_s":1.4,"confidence":0.8}],"score":6,"band":"moderate"}}
//   {"checkin":  {"sleep_h":5,"soreness":{"hamstring_l":2},"load_min":120,"symptoms":[]}}
//   {"hitwatch": {"day":2,"symptoms":{"headache":3,"light_sensitivity":2},"baseline_total":1,"today_total":5,"escalate":true}}
// Extensions beyond the draft (all optional, so the drafted examples validate unchanged): `checkin.intensity` (1 to 10) and
// `checkin.note`; nothing else. Adapters convert to and from the app's internal types.
import { z } from "zod";
import { BODY_AREAS, type BodyArea, type Checkin, type Side, type Soreness, type SorenessLevel } from "./types";
import { isKnownSymptom } from "./rules/symptoms";
import type { LandingWrite, CheckinWrite } from "./data/types";
import type { HitwatchShape } from "./hitwatch/compute";

export const landingShape = z.object({
  landing: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1).max(60),
        present: z.boolean(),
        side: z.enum(["left", "right"]).nullable().optional(),
        timestamp_s: z.number().min(0).max(600).nullable().optional(),
        confidence: z.number().min(0).max(1).nullable().optional(),
      }),
    ).max(50),
    score: z.number().min(0).max(100),
    band: z.enum(["low", "moderate", "high"]),
  }),
});
export type LandingShape = z.infer<typeof landingShape>;

export const checkinShape = z.object({
  checkin: z.object({
    sleep_h: z.number().min(0).max(24).nullable().optional(),
    soreness: z.record(z.string(), z.number().int().min(0).max(3)).default({}),
    load_min: z.number().int().min(0).max(600).nullable().optional(),
    symptoms: z.array(z.string()).default([]),
    // extensions (optional)
    intensity: z.number().int().min(1).max(10).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }),
});
export type CheckinShape = z.infer<typeof checkinShape>;

export const hitwatchShape = z.object({
  hitwatch: z.object({
    day: z.number().int().min(1).max(7),
    symptoms: z.record(z.string(), z.number().int().min(0).max(3)),
    baseline_total: z.number().min(0),
    today_total: z.number().min(0),
    escalate: z.boolean(),
  }),
});
export type HitwatchWrapped = z.infer<typeof hitwatchShape>;

// ---- soreness keys: "hamstring_l" = hamstring, left. Unsided keys ("lower_back") are accepted as is.
const SIDE_SUFFIX: Record<string, Side> = { l: "left", r: "right" };

export function parseSorenessKey(key: string): { area: BodyArea; side: Side | null } | null {
  if ((BODY_AREAS as readonly string[]).includes(key)) return { area: key as BodyArea, side: null };
  const m = /^(.+)_([lr])$/.exec(key);
  if (m && (BODY_AREAS as readonly string[]).includes(m[1])) return { area: m[1] as BodyArea, side: SIDE_SUFFIX[m[2]] };
  return null;
}

export class ShapeError extends Error {
  constructor(message: string, readonly errors: string[] = []) {
    super(message);
    this.name = "ShapeError";
  }
}

export function checkinFromShape(input: unknown, ctx: { athleteId: string; localDate: string; now: Date }): CheckinWrite {
  const parsed = checkinShape.safeParse(input);
  if (!parsed.success) throw new ShapeError("Invalid checkin shape", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const c = parsed.data.checkin;
  const errors: string[] = [];
  const soreness: Soreness = {};
  const sides: Partial<Record<BodyArea, Side>> = {};
  for (const [key, level] of Object.entries(c.soreness)) {
    const k = parseSorenessKey(key);
    if (!k) {
      errors.push(`soreness.${key}: unknown body area`);
      continue;
    }
    if (level === 0) continue; // only touched areas are stored
    const prev = soreness[k.area];
    soreness[k.area] = Math.max(prev ?? 0, level) as SorenessLevel;
    if (k.side) sides[k.area] = prev !== undefined && sides[k.area] && sides[k.area] !== k.side ? "both" : k.side;
  }
  for (const s of c.symptoms) if (!isKnownSymptom(s)) errors.push(`symptoms: unknown symptom "${s}"`);
  if (errors.length) throw new ShapeError("Invalid checkin shape", errors);
  const minutes = c.load_min ?? null;
  if (minutes !== null && minutes > 0 && (c.intensity ?? null) === null) {
    // Intensity is not in the drafted shape: it stays unknown (null), never guessed. The rules treat the day's load as missing.
  }
  return {
    athleteId: ctx.athleteId,
    localDate: ctx.localDate,
    sleepHours: c.sleep_h ?? null,
    workloadMinutes: minutes,
    workloadIntensity: minutes === 0 ? null : (c.intensity ?? null),
    soreness,
    sorenessSides: sides,
    symptoms: [...new Set(c.symptoms)],
    note: c.note ?? null,
    submittedAt: ctx.now.toISOString(),
  };
}

export function checkinToShape(c: Pick<Checkin, "sleepHours" | "soreness" | "sorenessSides" | "workloadMinutes" | "workloadIntensity" | "symptoms">): CheckinShape {
  const soreness: Record<string, number> = {};
  for (const [area, level] of Object.entries(c.soreness)) {
    const side = c.sorenessSides?.[area as BodyArea];
    if (side === "left") soreness[`${area}_l`] = level as number;
    else if (side === "right") soreness[`${area}_r`] = level as number;
    else if (side === "both") {
      soreness[`${area}_l`] = level as number;
      soreness[`${area}_r`] = level as number;
    } else soreness[area] = level as number;
  }
  return {
    checkin: {
      sleep_h: c.sleepHours,
      soreness,
      load_min: c.workloadMinutes,
      symptoms: c.symptoms,
      intensity: c.workloadIntensity,
    },
  };
}

export function landingFromShape(input: unknown, ctx: { athleteId: string; localDate: string; now: Date }): LandingWrite {
  const parsed = landingShape.safeParse(input);
  if (!parsed.success) throw new ShapeError("Invalid landing shape", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const l = parsed.data.landing;
  return {
    athleteId: ctx.athleteId,
    localDate: ctx.localDate,
    receivedAt: ctx.now.toISOString(),
    items: l.items.map((i) => ({ id: i.id, present: i.present, side: i.side ?? null, timestampS: i.timestamp_s ?? null, confidence: i.confidence ?? null })),
    score: l.score,
    band: l.band,
  };
}

export const hitwatchToShape = (h: HitwatchShape): HitwatchWrapped => ({ hitwatch: h });

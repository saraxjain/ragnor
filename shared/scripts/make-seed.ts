// Generates shared/data/seed.json: a fictional 12-athlete roster with wearable history, check-ins,
// landing screens, plus the rules-engine output for "today".
// Run: node shared/scripts/make-seed.ts
// All names and data are invented for the demo.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeBaseline,
  dailyRisk,
  scoreLanding,
  RULES_VERSION,
  type CheckIn,
  type LandingResult,
  type WearableDay,
} from "../lib/index.ts";

const TODAY = "2026-11-14";

// Deterministic pseudo-random so the demo looks the same every run.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const jitter = (base: number, spread: number) => Math.round((base + (rand() - 0.5) * 2 * spread) * 10) / 10;

const dateMinus = (n: number) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

type Scenario = "normal" | "sleep_load" | "sore_hamstring" | "landing_risk" | "wearable_dip" | "severe_knee";

const roster: { id: string; name: string; sport: string; grade: number; scenario: Scenario; device: string }[] = [
  { id: "ath_01", name: "Maya Torres", sport: "Girls Soccer", grade: 11, scenario: "wearable_dip", device: "Pixel Watch" },
  { id: "ath_02", name: "Jordan Lee", sport: "Girls Soccer", grade: 12, scenario: "landing_risk", device: "Fitbit Charge" },
  { id: "ath_03", name: "Priya Nair", sport: "Girls Basketball", grade: 10, scenario: "sleep_load", device: "Fitbit Sense" },
  { id: "ath_04", name: "Ava Johnson", sport: "Girls Basketball", grade: 11, scenario: "normal", device: "Pixel Watch" },
  { id: "ath_05", name: "Sofia Ramirez", sport: "Girls Volleyball", grade: 12, scenario: "sore_hamstring", device: "Fitbit Charge" },
  { id: "ath_06", name: "Chloe Kim", sport: "Girls Volleyball", grade: 10, scenario: "normal", device: "Fitbit Inspire" },
  { id: "ath_07", name: "Hannah Brooks", sport: "Gymnastics", grade: 11, scenario: "severe_knee", device: "Pixel Watch" },
  { id: "ath_08", name: "Lena Okafor", sport: "Gymnastics", grade: 12, scenario: "normal", device: "Fitbit Sense" },
  { id: "ath_09", name: "Riley Chen", sport: "Girls Soccer", grade: 10, scenario: "normal", device: "Fitbit Charge" },
  { id: "ath_10", name: "Grace Patel", sport: "Girls Basketball", grade: 12, scenario: "normal", device: "none" },
  { id: "ath_11", name: "Zoe Martinez", sport: "Girls Volleyball", grade: 11, scenario: "landing_risk", device: "Pixel Watch" },
  { id: "ath_12", name: "Emma Wilson", sport: "Gymnastics", grade: 10, scenario: "normal", device: "Fitbit Inspire" },
];

function wearableHistory(scenario: Scenario, device: string): { baseline_days: WearableDay[]; recent: WearableDay[] } {
  if (device === "none") return { baseline_days: [], recent: [] };
  const hrv0 = jitter(68, 12);
  const rhr0 = jitter(56, 4);
  const baseline_days: WearableDay[] = [];
  for (let i = 30; i >= 15; i--) baseline_days.push({ date: dateMinus(i), hrv_ms: jitter(hrv0, 4), rhr_bpm: jitter(rhr0, 1.5), sleep_h: jitter(8, 0.6) });
  const recent: WearableDay[] = [];
  for (let i = 6; i >= 0; i--) {
    let hrv = jitter(hrv0, 4), rhr = jitter(rhr0, 1.5), sleep = jitter(7.9, 0.6);
    if (scenario === "wearable_dip" && i <= 2) { hrv = jitter(hrv0 * 0.78, 2); rhr = jitter(rhr0 + 5.5, 1); sleep = jitter(6.3, 0.3); }
    if (scenario === "sleep_load" && i <= 2) sleep = jitter(5.3, 0.3);
    recent.push({ date: dateMinus(i), hrv_ms: hrv, rhr_bpm: rhr, sleep_h: sleep });
  }
  return { baseline_days, recent };
}

function checkins(scenario: Scenario, recent: WearableDay[]): CheckIn[] {
  const out: CheckIn[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = dateMinus(i);
    const w = recent.find((d) => d.date === date);
    let load = Math.round(jitter(90, 10));
    let sleep = w?.sleep_h ?? jitter(7.8, 0.6);
    const soreness: CheckIn["soreness"] = [];
    if (scenario === "sleep_load" && i < 7) load = Math.round(jitter(125, 8));
    if (scenario === "sleep_load" && i <= 2) sleep = w?.sleep_h ?? 5.4;
    if (scenario === "sore_hamstring" && i <= 2) soreness.push({ area: "hamstring_l", level: 2 });
    if (scenario === "severe_knee" && i === 0) soreness.push({ area: "knee_r", level: 3 });
    out.push({
      date,
      sleep_h: sleep,
      soreness,
      load_min: load,
      intensity: load > 110 ? "hard" : "moderate",
      took_hit: false,
      symptoms: [],
      red_flags: [],
    });
  }
  return out;
}

function landing(scenario: Scenario): LandingResult {
  const mk = (id: string, present: boolean, side: "left" | "right" | "both" | "none", t: number, text: string) => ({
    id, present, side, timestamp_s: t, confidence: present ? 0.82 : 0.75, plain_language: text,
  });
  if (scenario === "landing_risk") {
    return {
      video_ok: true, view: "front", initial_contact_s: 1.2,
      items: [
        mk("knee_valgus_contact", true, "left", 1.3, "Your left knee starts caving inward as your feet touch down."),
        mk("knee_valgus_max", true, "left", 1.4, "At the bottom of the landing, your left knee collapses inward past your big toe."),
        mk("stiff_landing_overall", true, "both", 1.4, "You land with straight, stiff legs instead of sinking into the landing."),
        mk("asymmetric_foot_contact", false, "none", 1.2, "Both feet land at the same time. Nice."),
        mk("stance_width", false, "none", 1.2, "Your feet land about shoulder-width apart. Good."),
      ],
      summary: "Your left knee caves inward when you land. Focus on pushing your knees out over your toes and landing softly.",
    };
  }
  return {
    video_ok: true, view: "front", initial_contact_s: 1.1,
    items: [
      mk("knee_valgus_contact", false, "none", 1.2, "Your knees stay in line with your toes."),
      mk("stiff_landing_overall", false, "none", 1.3, "You bend your hips and knees to absorb the landing."),
    ],
    summary: "Clean landing. Keep landing softly with knees over toes.",
  };
}

const athletes = roster.map((a) => {
  const { baseline_days, recent } = wearableHistory(a.scenario, a.device);
  const baseline = computeBaseline(baseline_days);
  const cis = checkins(a.scenario, recent);
  const landingResult = landing(a.scenario);
  const landingScore = scoreLanding(landingResult);

  const risk = dailyRisk({
    athlete_id: a.id,
    date: TODAY,
    checkins: cis,
    wearable_recent: recent.length ? recent : undefined,
    wearable_baseline: recent.length ? baseline : undefined,
    latest_landing: landingScore,
  });

  return { ...a, wearable: { baseline, baseline_days, recent }, checkins: cis, landing: { result: landingResult, score: landingScore, video_date: dateMinus(3) }, risk_today: risk };
});

const order = { high: 0, moderate: 1, low: 2 } as const;
const summary = athletes
  .map((a) => ({ id: a.id, name: a.name, band: a.risk_today.band, reasons: a.risk_today.flags.map((f) => f.reason) }))
  .sort((x, y) => order[x.band] - order[y.band] || y.reasons.length - x.reasons.length);

const seasonReport = {
  season: "Fall 2026 (demo)",
  school: "Westbrook High School (fictional)",
  athletes_enrolled: athletes.length,
  landing_screens_completed: athletes.length,
  athletes_flagged_for_landing_work: athletes.filter((a) => a.landing.score.band !== "low").length,
  alerts_drafted: 0,
  alerts_approved_by_staff: 0,
  avg_checkin_completion_pct: 86,
  est_staff_hours_saved: 14,
  note: "Demo figures. Hours saved = estimated minutes per manual check-in/screen avoided x count.",
};

const out = { generated_for: TODAY, rules_version: RULES_VERSION, team: "Westbrook High (fictional)", roster_summary: summary, season_report: seasonReport, athletes };

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, "..", "data", "seed.json");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`Wrote ${path}`);
console.table(summary.map((s) => ({ name: s.name, band: s.band, top_reason: s.reasons[0] ?? "" })));

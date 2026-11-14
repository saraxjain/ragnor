// Trains the Ragnor risk model and writes shared/data/model.json.
// Run: node shared/scripts/train-model.ts
//
// DATA: there are no real injury outcomes yet, so this builds a SYNTHETIC season cohort (labeled as such
// everywhere it's shown). Injury hazard follows directions reported in the sports-science literature
// (load spikes / high ACWR, short sleep, persistent soreness, suppressed HRV, poor landing mechanics,
// under-fueling) plus an unobserved per-athlete susceptibility and noise, so the model can't be perfect.
// The pipeline is identical for real data: swap the generator for real check-ins + recorded outcomes.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFeatures, FEATURE_NAMES } from "../lib/features.ts";
import { dailyRisk, computeBaseline, type CheckIn, type WearableDay } from "../lib/index.ts";
import { train, predictRaw, toProbability, auroc, auprc, confusion, calibration, r3, type Sample, type TrainedModel } from "../lib/model.ts";

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const day = (i: number) => new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10);

const ATHLETES = 420;
const DAYS = 70; // first 28 days are warm-up history; samples from day 28
const samples: Sample[] = [];

for (let a = 0; a < ATHLETES; a++) {
  const id = `syn_${a}`;
  const susceptibility = gauss() * 0.6; // unobserved
  const baseLoad = 70 + rand() * 50;
  const sleepHabit = 7.2 + gauss() * 0.7;
  const hrvBase = 55 + rand() * 35;
  const rhrBase = 52 + rand() * 10;
  const landingErrors = clamp(Math.round(1.5 + gauss() * 1.6 + (rand() < 0.25 ? 2 : 0)), 0, 8);
  const spikeWeek = Math.floor(28 + rand() * 35);
  const checkins: CheckIn[] = [];
  const wear: WearableDay[] = [];
  let soreCarry = 0;
  const hazards: number[] = [];

  for (let i = 0; i < DAYS; i++) {
    const weekday = i % 7;
    const spike = i >= spikeWeek && i < spikeWeek + 7 && rand() < 0.7 ? 1.4 + rand() * 0.5 : 1;
    const rest = weekday === 6 ? 0.2 : 1;
    const load = Math.round(clamp(baseLoad * spike * rest * (0.85 + rand() * 0.3), 0, 240));
    const sleep = +clamp(sleepHabit + gauss() * 0.8 - (spike > 1 ? 0.6 : 0), 4, 10).toFixed(1);
    soreCarry = clamp(soreCarry * 0.55 + (load > baseLoad * 1.25 ? 1.1 : 0) + (rand() < 0.08 ? 1.5 : 0), 0, 3);
    const sore = Math.round(soreCarry);
    const hrv = +(hrvBase * (1 - (spike > 1 ? 0.12 : 0) - (sleep < 6 ? 0.08 : 0)) + gauss() * 4).toFixed(1);
    const rhr = +(rhrBase + (spike > 1 ? 3 : 0) + (sleep < 6 ? 2 : 0) + gauss() * 1.5).toFixed(1);
    const meals = rand() < 0.12 ? 1 : rand() < 0.4 ? 2 : 3;
    const date = day(i);
    checkins.push({
      date,
      sleep_h: sleep,
      load_min: load,
      intensity: load > baseLoad * 1.2 ? "hard" : "moderate",
      soreness: sore ? [{ area: rand() < 0.5 ? "hamstring_l" : "knee_r", level: sore }] : [],
      took_hit: false,
      symptoms: [],
      red_flags: [],
      meals,
      effort: clamp(Math.round(5 + (load - baseLoad) / 20), 1, 10),
    });
    wear.push({ date, hrv_ms: hrv, rhr_bpm: rhr, sleep_h: sleep });

    if (i < 28) continue;
    const baselineDays = wear.slice(0, 21);
    const baseline = computeBaseline(baselineDays);
    const x = computeFeatures({ date, checkins, wearable_recent: wear.slice(-7), wearable_baseline_days: baselineDays, baseline, landing_errors: landingErrors });

    // "True" daily hazard (log-odds), unknown to the model.
    const logit =
      -7.4 +
      1.9 * Math.max(0, x.acwr - 1.25) +
      0.32 * x.sleep_debt_3d +
      0.45 * x.soreness_max +
      0.35 * x.soreness_days_3d +
      0.28 * Math.max(0, -x.hrv_z) +
      0.07 * Math.max(0, x.rhr_delta) +
      0.22 * x.landing_errors +
      0.5 * x.under_fueled +
      0.12 * Math.max(0, x.monotony - 2) +
      susceptibility +
      gauss() * 0.35;
    hazards.push(1 / (1 + Math.exp(-logit)));

    const rules = dailyRisk({
      athlete_id: id,
      date,
      checkins,
      wearable_recent: wear.slice(-7),
      wearable_baseline: baseline,
      latest_landing: { score: landingErrors, band: landingErrors >= 5 ? "high" : landingErrors >= 3 ? "moderate" : "low", knee_errors: Math.min(landingErrors, 2), errors: [], rules_version: "" },
    });
    samples.push({ x, y: 0, group: id, rules_flag: rules.band === "low" ? 0 : 1 });
  }
  // Label: injury in the next 7 days, drawn from the hazard over that window.
  const start = samples.length - hazards.length;
  for (let k = 0; k < hazards.length; k++) {
    let pNone = 1;
    for (let j = k; j < Math.min(k + 7, hazards.length); j++) pNone *= 1 - hazards[j];
    samples[start + k].y = rand() < 1 - pNone ? 1 : 0;
  }
}

// Split by athlete (70/30) so the test set contains only athletes the model never saw.
const athletes = [...new Set(samples.map((s) => s.group))];
const testSet = new Set(athletes.filter((_, i) => i % 10 >= 7));
const trainS = samples.filter((s) => !testSet.has(s.group));
const testS = samples.filter((s) => testSet.has(s.group));
const prevalence = trainS.filter((s) => s.y).length / trainS.length;
const wPos = (trainS.length - trainS.filter((s) => s.y).length) / Math.max(1, trainS.filter((s) => s.y).length);

const m = train(trainS);
const probOf = (x: Sample["x"]) => toProbability(predictRaw(m, x), prevalence, wPos);

// Operating threshold: highest threshold that still catches >= 80% of injuries on the TRAINING set.
const trainP = trainS.map((s) => probOf(s.x));
const sorted = [...trainP].sort((a, b) => b - a);
const target = 0.8;
let threshold = sorted[sorted.length - 1];
for (const t of sorted) {
  if (confusion(trainP.map((p) => (p >= t ? 1 : 0)), trainS.map((s) => s.y)).sensitivity >= target) {
    threshold = t;
    break;
  }
}

const ys = testS.map((s) => s.y);
const probs = testS.map((s) => probOf(s.x));
const { auc, roc } = auroc(probs, ys);
const at = confusion(probs.map((p) => (p >= threshold ? 1 : 0)), ys);
const base = confusion(testS.map((s) => s.rules_flag ?? 0), ys);

const model: TrainedModel = {
  version: "risk-lr-2026.11.14",
  trained_at: new Date().toISOString(),
  features: FEATURE_NAMES,
  means: m.means.map(r3),
  stds: m.stds.map(r3),
  weights: m.weights.map(r3),
  bias: r3(m.bias),
  threshold: +threshold.toFixed(4),
  metrics: {
    auroc: r3(auc),
    auprc: r3(auprc(probs, ys)),
    brier: r3(probs.reduce((a, p, i) => a + (p - ys[i]) ** 2, 0) / probs.length),
    sensitivity: r3(at.sensitivity),
    specificity: r3(at.specificity),
    ppv: r3(at.ppv),
    npv: r3(at.npv),
    calibration: calibration(probs, ys),
    roc,
  },
  baseline_metrics: { sensitivity: r3(base.sensitivity), specificity: r3(base.specificity), ppv: r3(base.ppv) },
  data: {
    source: "SYNTHETIC season cohort (simulated; no real athlete data)",
    n_train: trainS.length,
    n_test: testS.length,
    prevalence: r3(prevalence),
    athletes_train: athletes.length - testSet.size,
    athletes_test: testSet.size,
  },
};
(model as TrainedModel & { w_pos: number }).w_pos = r3(wPos);

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "..", "data", "model.json"), JSON.stringify(model, null, 2));
console.log(`samples train=${trainS.length} test=${testS.length} prevalence=${(prevalence * 100).toFixed(1)}%`);
console.log(`AUROC ${model.metrics.auroc}  AUPRC ${model.metrics.auprc}  Brier ${model.metrics.brier}`);
console.log(`@threshold ${model.threshold}: sens ${model.metrics.sensitivity} spec ${model.metrics.specificity} ppv ${model.metrics.ppv}`);
console.log(`rules baseline: sens ${base.sensitivity.toFixed(3)} spec ${base.specificity.toFixed(3)} ppv ${base.ppv.toFixed(3)}`);
console.log("weights:", FEATURE_NAMES.map((f, j) => `${f}=${model.weights[j]}`).join(" "));

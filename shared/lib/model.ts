// Ragnor risk model: L2-regularized logistic regression over the feature pipeline, with the evaluation
// metrics a medical-software buyer expects (AUROC, AUPRC, Brier score, calibration, sensitivity/specificity
// at the operating threshold) and a comparison against the rules engine as a baseline.
// Interpretable by design: every prediction comes with per-feature contributions.

import { FEATURE_NAMES, FEATURE_LABELS, type FeatureVector, type FeatureName } from "./features.ts";

export interface TrainedModel {
  version: string;
  trained_at: string;
  features: readonly FeatureName[];
  means: number[];
  stds: number[];
  weights: number[];
  bias: number;
  threshold: number; // operating point chosen for sensitivity >= target
  metrics: ModelMetrics;
  baseline_metrics: Pick<ModelMetrics, "sensitivity" | "specificity" | "ppv">;
  data: { source: string; n_train: number; n_test: number; prevalence: number; athletes_train: number; athletes_test: number };
}

export interface ModelMetrics {
  auroc: number;
  auprc: number;
  brier: number;
  sensitivity: number;
  specificity: number;
  ppv: number;
  npv: number;
  calibration: { bin: number; predicted: number; observed: number; n: number }[];
  roc: { fpr: number; tpr: number }[];
}

export interface Sample {
  x: FeatureVector;
  y: 0 | 1;
  group: string; // athlete id (split by athlete to avoid leakage)
  rules_flag?: 0 | 1; // rules-engine baseline prediction
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const vec = (x: FeatureVector) => FEATURE_NAMES.map((f) => x[f]);

export function train(samples: Sample[], opts: { epochs?: number; lr?: number; l2?: number } = {}) {
  const { epochs = 900, lr = 0.2, l2 = 0.001 } = opts;
  const X = samples.map((s) => vec(s.x));
  const d = FEATURE_NAMES.length;
  const means = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j], 0) / X.length);
  const stds = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - means[j]) ** 2, 0) / X.length) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));
  const w = new Array(d).fill(0);
  let b = 0;
  // Class weighting so the rare positive class still shapes the boundary.
  const pos = samples.filter((s) => s.y === 1).length;
  const wPos = (samples.length - pos) / Math.max(1, pos);
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    let norm = 0;
    for (let i = 0; i < Z.length; i++) {
      const p = sigmoid(Z[i].reduce((a, v, j) => a + v * w[j], b));
      const cw = samples[i].y === 1 ? wPos : 1;
      const err = (p - samples[i].y) * cw;
      norm += cw;
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / norm + l2 * w[j]);
    b -= lr * (gb / norm);
  }
  return { means, stds, weights: w, bias: b };
}

export function predictRaw(m: Pick<TrainedModel, "means" | "stds" | "weights" | "bias">, x: FeatureVector): number {
  const z = vec(x).reduce((a, v, j) => a + ((v - m.means[j]) / m.stds[j]) * m.weights[j], m.bias);
  return sigmoid(z);
}

/** Platt-style recalibration is unnecessary at this size; class weighting inflates raw scores, so we map them back
 *  to base-rate probabilities with a prior correction. */
export function toProbability(raw: number, prevalence: number, wPos: number): number {
  const odds = (raw / (1 - raw)) / wPos;
  const p = odds / (1 + odds);
  return Math.max(0.001, Math.min(0.999, Number.isFinite(p) ? p : prevalence));
}

export function explain(m: TrainedModel, x: FeatureVector) {
  const contribs = FEATURE_NAMES.map((f, j) => ({
    feature: f,
    label: FEATURE_LABELS[f],
    value: x[f],
    contribution: ((x[f] - m.means[j]) / m.stds[j]) * m.weights[j],
  }));
  return contribs.sort((a, b) => b.contribution - a.contribution);
}

export function auroc(scores: number[], ys: number[]): { auc: number; roc: { fpr: number; tpr: number }[] } {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const P = ys.filter((y) => y === 1).length;
  const N = ys.length - P;
  let tp = 0, fp = 0, auc = 0, prevFpr = 0, prevTpr = 0;
  const roc = [{ fpr: 0, tpr: 0 }];
  for (const i of idx) {
    if (ys[i] === 1) tp++;
    else fp++;
    const tpr = tp / P, fpr = fp / N;
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevFpr = fpr;
    prevTpr = tpr;
    roc.push({ fpr, tpr });
  }
  // thin the curve for display
  const step = Math.max(1, Math.floor(roc.length / 60));
  return { auc, roc: roc.filter((_, i) => i % step === 0 || i === roc.length - 1).map((r) => ({ fpr: +r.fpr.toFixed(3), tpr: +r.tpr.toFixed(3) })) };
}

export function auprc(scores: number[], ys: number[]): number {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const P = ys.filter((y) => y === 1).length;
  let tp = 0, fp = 0, area = 0, prevRecall = 0;
  for (const i of idx) {
    if (ys[i] === 1) tp++;
    else fp++;
    const recall = tp / P, precision = tp / (tp + fp);
    area += (recall - prevRecall) * precision;
    prevRecall = recall;
  }
  return area;
}

export function confusion(preds: number[], ys: number[]) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  preds.forEach((p, i) => {
    if (p && ys[i]) tp++;
    else if (p && !ys[i]) fp++;
    else if (!p && !ys[i]) tn++;
    else fn++;
  });
  const safe = (a: number, b: number) => (b ? a / b : 0);
  return { sensitivity: safe(tp, tp + fn), specificity: safe(tn, tn + fp), ppv: safe(tp, tp + fp), npv: safe(tn, tn + fn) };
}

export function calibration(probs: number[], ys: number[], bins = 10) {
  const out: ModelMetrics["calibration"] = [];
  const maxP = Math.max(...probs, 0.01);
  for (let b = 0; b < bins; b++) {
    const lo = (b / bins) * maxP, hi = ((b + 1) / bins) * maxP;
    const idx = probs.map((p, i) => i).filter((i) => probs[i] >= lo && (b === bins - 1 ? probs[i] <= hi : probs[i] < hi));
    if (idx.length < 5) continue;
    out.push({
      bin: b,
      predicted: +(idx.reduce((a, i) => a + probs[i], 0) / idx.length).toFixed(4),
      observed: +(idx.reduce((a, i) => a + ys[i], 0) / idx.length).toFixed(4),
      n: idx.length,
    });
  }
  return out;
}

export const r3 = (x: number) => Math.round(x * 1000) / 1000;

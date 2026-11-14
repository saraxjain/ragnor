// Server-side model scoring: store data -> features -> 7-day injury-risk probability + explanation.
import modelJson from "../shared/data/model.json" with { type: "json" };
import { computeFeatures, FEATURE_LABELS, type FeatureVector } from "../shared/lib/features.ts";
import { predictRaw, toProbability, explain, type TrainedModel } from "../shared/lib/model.ts";
import type { Athlete } from "./store.ts";

export const MODEL = modelJson as unknown as TrainedModel & { w_pos: number };

export interface ModelScore {
  risk_7d: number; // probability 0-1
  above_threshold: boolean;
  tier: "elevated" | "watch" | "typical";
  features: FeatureVector;
  top_drivers: { feature: string; label: string; value: number; contribution: number }[];
  model_version: string;
}

export function scoreAthlete(a: Athlete): ModelScore {
  const features = computeFeatures({
    date: a.risk_today.date,
    checkins: a.checkins,
    wearable_recent: a.wearable.recent,
    wearable_baseline_days: a.wearable.baseline_days,
    baseline: a.wearable.baseline,
    landing_errors: a.landing?.score.score ?? 0,
  });
  const p = toProbability(predictRaw(MODEL, features), MODEL.data.prevalence, MODEL.w_pos);
  const top = explain(MODEL, features).filter((c) => c.contribution > 0.05).slice(0, 3);
  return {
    risk_7d: Math.round(p * 1000) / 1000,
    above_threshold: p >= MODEL.threshold,
    tier: p >= MODEL.threshold * 2 ? "elevated" : p >= MODEL.threshold ? "watch" : "typical",
    features,
    top_drivers: top.map((c) => ({ ...c, label: FEATURE_LABELS[c.feature as keyof typeof FEATURE_LABELS], contribution: Math.round(c.contribution * 100) / 100 })),
    model_version: MODEL.version,
  };
}

export function modelCard() {
  const { means: _m, stds: _s, ...rest } = MODEL;
  return {
    ...rest,
    feature_weights: MODEL.features.map((f, j) => ({ feature: f, label: FEATURE_LABELS[f], weight: MODEL.weights[j] })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    intended_use: "Prioritize which athletes a coach or athletic trainer reviews today. Not a diagnostic device; never used to clear an athlete.",
    limitations: [
      "Trained on a synthetic cohort until real outcome data is collected in pilots.",
      "Logistic model: captures additive effects; interactions are handled by the rules engine and the case conference.",
      "Wearable features depend on device wear; missing data lowers confidence.",
    ],
  };
}

import { MODEL } from "@/lib/risk.ts";
import { FEATURE_LABELS } from "@/shared/lib/features.ts";
import { live, config } from "@/lib/config.ts";
import { EngineLive } from "./EngineLive.tsx";

export const metadata = { title: "Behind the scenes · Ragnor" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <EngineLive
      model={{
        version: MODEL.version,
        features: MODEL.features.map((f, j) => ({ name: f, label: FEATURE_LABELS[f], weight: MODEL.weights[j], mean: MODEL.means[j], std: MODEL.stds[j] })),
        bias: MODEL.bias,
        wPos: MODEL.w_pos,
        prevalence: MODEL.data.prevalence,
        threshold: MODEL.threshold,
        auroc: MODEL.metrics.auroc,
        auprc: MODEL.metrics.auprc,
        brier: MODEL.metrics.brier,
        sensitivity: MODEL.metrics.sensitivity,
        specificity: MODEL.metrics.specificity,
        ppv: MODEL.metrics.ppv,
        npv: MODEL.metrics.npv,
        baselineSensitivity: MODEL.baseline_metrics.sensitivity,
        baselineSpecificity: MODEL.baseline_metrics.specificity,
        roc: MODEL.metrics.roc,
        calibration: MODEL.metrics.calibration.map(({ predicted, observed, n }) => ({ predicted, observed, n })),
        data: { n_train: MODEL.data.n_train, n_test: MODEL.data.n_test, athletes_train: MODEL.data.athletes_train, athletes_test: MODEL.data.athletes_test },
        source: MODEL.data.source,
      }}
      geminiLive={live.gemini()}
      geminiModel={config.geminiModel}
    />
  );
}

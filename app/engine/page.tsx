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
        threshold: MODEL.threshold,
        auroc: MODEL.metrics.auroc,
        sensitivity: MODEL.metrics.sensitivity,
        baselineSensitivity: MODEL.baseline_metrics.sensitivity,
        source: MODEL.data.source,
      }}
      geminiLive={live.gemini()}
      geminiModel={config.geminiModel}
    />
  );
}

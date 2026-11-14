import { PlatformShell } from "../PlatformNav.tsx";
import { modelCard } from "@/lib/risk.ts";

export const metadata = { title: "Risk model · Ragnor" };
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export default function ModelPage() {
  const m = modelCard();
  const W = 300, H = 300;
  const roc = m.metrics.roc.map((p) => `${(p.fpr * W).toFixed(1)},${(H - p.tpr * H).toFixed(1)}`).join(" ");
  const maxP = Math.max(...m.metrics.calibration.map((c) => Math.max(c.predicted, c.observed)), 0.3);
  const sx = (v: number) => (v / maxP) * W, sy = (v: number) => H - (v / maxP) * H;
  const maxW = Math.max(...m.feature_weights.map((f) => Math.abs(f.weight)));
  const rows: [string, string, string][] = [
    ["Catches injuries (sensitivity)", pct(m.metrics.sensitivity), pct(m.baseline_metrics.sensitivity)],
    ["Correctly lets healthy days pass (specificity)", pct(m.metrics.specificity), pct(m.baseline_metrics.specificity)],
    ["Flag is right (PPV)", pct(m.metrics.ppv), pct(m.baseline_metrics.ppv)],
  ];
  return (
    <PlatformShell title="Risk model & validation" sub="How well the 7-day injury-risk model works, measured the way clinical software is: on athletes it never saw in training, against a simple baseline, with calibration and an honest list of limits.">
      <div className="banner banner-warn small"><div><strong>Synthetic validation.</strong> {m.data.source}. Real outcome data comes from pilot schools; the pipeline, metrics and model card stay the same.</div></div>
      <div className="grid grid-3">
        <section className="card"><div className="small muted">AUROC (held-out athletes)</div><div className="kpi">{m.metrics.auroc}</div><div className="tiny muted">0.5 = coin flip, 1.0 = perfect</div></section>
        <section className="card"><div className="small muted">Injuries caught at threshold</div><div className="kpi">{pct(m.metrics.sensitivity)}</div><div className="tiny muted">vs {pct(m.baseline_metrics.sensitivity)} for rules only</div></section>
        <section className="card"><div className="small muted">Calibration (Brier score)</div><div className="kpi">{m.metrics.brier}</div><div className="tiny muted">lower is better; base rate {pct(m.data.prevalence)}</div></section>
      </div>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <h3>ROC curve</h3>
          <svg viewBox={`-30 -10 ${W + 40} ${H + 40}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={`ROC curve, AUROC ${m.metrics.auroc}`}>
            <rect x="0" y="0" width={W} height={H} fill="none" stroke="var(--outline)" />
            <line x1="0" y1={H} x2={W} y2="0" stroke="var(--ink-3)" strokeDasharray="4 4" />
            <polyline points={roc} fill="none" stroke="var(--primary)" strokeWidth="3" />
            <circle cx={(1 - m.metrics.specificity) * W} cy={H - m.metrics.sensitivity * H} r="6" fill="var(--teal)" />
            <circle cx={(1 - m.baseline_metrics.specificity) * W} cy={H - m.baseline_metrics.sensitivity * H} r="6" fill="var(--high)" />
            <text x={W / 2} y={H + 26} textAnchor="middle" fontSize="12" fill="var(--ink-3)">False-alarm rate</text>
            <text x={-18} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--ink-3)" transform={`rotate(-90 -18 ${H / 2})`}>Injuries caught</text>
          </svg>
          <p className="tiny muted"><span style={{ color: "var(--teal)" }}>●</span> model at its operating threshold · <span style={{ color: "var(--high)" }}>●</span> rules-only baseline · dashed = chance</p>
        </section>
        <section className="card">
          <h3>Calibration</h3>
          <svg viewBox={`-30 -10 ${W + 40} ${H + 40}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Calibration plot">
            <rect x="0" y="0" width={W} height={H} fill="none" stroke="var(--outline)" />
            <line x1="0" y1={H} x2={W} y2="0" stroke="var(--ink-3)" strokeDasharray="4 4" />
            <polyline points={m.metrics.calibration.map((c) => `${sx(c.predicted)},${sy(c.observed)}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="2" />
            {m.metrics.calibration.map((c) => <circle key={c.bin} cx={sx(c.predicted)} cy={sy(c.observed)} r={Math.max(3, Math.min(9, Math.sqrt(c.n) / 6))} fill="var(--primary)" />)}
            <text x={W / 2} y={H + 26} textAnchor="middle" fontSize="12" fill="var(--ink-3)">Predicted risk</text>
            <text x={-18} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--ink-3)" transform={`rotate(-90 -18 ${H / 2})`}>Observed rate</text>
          </svg>
          <p className="tiny muted">Points on the dashed line mean a predicted 10% really happens about 10% of the time. Dot size = number of athlete-days.</p>
        </section>
      </div>
      <section className="card">
        <h3>Model vs rules-only baseline (same test athletes)</h3>
        <table className="table"><thead><tr><th>Metric</th><th>Ragnor model</th><th>Rules only</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="mono strong">{r[1]}</td><td className="mono">{r[2]}</td></tr>)}</tbody></table>
        <p className="tiny muted mt-8">Where we don&apos;t win: precision is similar (most flags are still precautionary at an {pct(m.data.prevalence)} base rate). That&apos;s acceptable for triage: a flag costs a 2-minute look; a missed injury costs a season.</p>
      </section>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <h3>What drives risk (standardized weights)</h3>
          <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
            {m.feature_weights.map((f) => (
              <div key={f.feature} className="row" style={{ gap: 10 }}>
                <span className="small" style={{ width: 190, flex: "none" }}>{f.label}</span>
                <div style={{ flex: 1, height: 12, background: "var(--surface-2)", borderRadius: 6 }}><div style={{ width: `${(Math.abs(f.weight) / maxW) * 100}%`, height: 12, borderRadius: 6, background: f.weight >= 0 ? "var(--primary)" : "var(--teal)" }} /></div>
                <span className="mono tiny" style={{ width: 48, textAlign: "right" }}>{f.weight.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>Model card</h3>
          <p className="small"><strong>Version</strong> {m.version} · trained {new Date(m.trained_at).toLocaleDateString()}</p>
          <p className="small"><strong>Intended use.</strong> {m.intended_use}</p>
          <p className="small"><strong>Data.</strong> {m.data.n_train.toLocaleString()} training athlete-days ({m.data.athletes_train} athletes), {m.data.n_test.toLocaleString()} test athlete-days from {m.data.athletes_test} different athletes. Split by athlete so no one appears in both.</p>
          <p className="small" style={{ marginBottom: 4 }}><strong>Limitations</strong></p>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 0 }}>{m.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="tiny muted">Machine-readable: <a href="/api/model">/api/model</a> · retrain: <span className="mono">npm run train</span></p>
        </section>
      </div>
    </PlatformShell>
  );
}

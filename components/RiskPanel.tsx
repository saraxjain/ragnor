"use client";
import type { ModelScore } from "@/lib/risk.ts";
import { FEATURE_LABELS } from "@/shared/lib/features.ts";

export const tierColor = (t: ModelScore["tier"]) => (t === "elevated" ? "var(--high)" : t === "watch" ? "var(--mod)" : "var(--low)");

export function RiskBadge({ m }: { m: Pick<ModelScore, "risk_7d" | "tier"> }) {
  return (
    <span className="pill mono" title="Model-estimated chance of a time-loss injury in the next 7 days" style={{ borderColor: tierColor(m.tier), color: tierColor(m.tier) }}>
      {(m.risk_7d * 100).toFixed(1)}% · 7d
    </span>
  );
}

export function RiskPanel({ m, name }: { m: ModelScore; name: string }) {
  const first = name.split(" ")[0];
  const max = Math.max(0.3, ...m.top_drivers.map((d) => d.contribution));
  return (
    <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <section className="card">
        <div className="card-header">
          <h3>7-day injury risk</h3>
          <span className="mono muted">model {m.model_version}</span>
        </div>
        <div className="row wrap" style={{ gap: 24, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 44, fontWeight: 800, color: tierColor(m.tier), lineHeight: 1 }}>{(m.risk_7d * 100).toFixed(1)}%</div>
            <div className="small muted">chance of a time-loss injury in the next 7 days</div>
          </div>
          <span className="band" style={{ background: tierColor(m.tier), color: "#fff", textTransform: "capitalize" }}>{m.tier}</span>
        </div>
        <p className="small mt-16">
          {m.top_drivers.length ? <>What is pushing {first}&apos;s risk up today:</> : <>Nothing is pushing {first}&apos;s risk above typical today.</>}
        </p>
        <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
          {m.top_drivers.map((d) => (
            <div key={d.feature} className="row" style={{ gap: 10 }}>
              <span className="small" style={{ width: 200, flex: "none" }}>{d.label}</span>
              <div style={{ flex: 1, background: "var(--surface)", borderRadius: 8, height: 12 }}>
                <div style={{ width: `${Math.min(100, (d.contribution / max) * 100)}%`, background: "var(--primary)", height: 12, borderRadius: 8 }} />
              </div>
              <span className="mono small" style={{ width: 60, textAlign: "right" }}>{d.value}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted mt-16">Logistic-regression model on 10 engineered features. Used to decide who to look at first, never to diagnose or clear. Validated on held-out (simulated) athletes.</p>
      </section>
      <section className="card">
        <h3 style={{ marginBottom: 10 }}>Feature vector (today)</h3>
        <table className="table">
          <thead><tr><th>Feature</th><th>Value</th></tr></thead>
          <tbody>
            {Object.entries(m.features).map(([k, v]) => (
              <tr key={k}><td>{FEATURE_LABELS[k as keyof typeof FEATURE_LABELS] ?? k} <span className="mono muted tiny">{k}</span></td><td className="mono">{v}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

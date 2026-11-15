"use client";
import type { ModelScore } from "@/lib/risk.ts";
import { FEATURE_LABELS, type FeatureName } from "@/shared/lib/features.ts";

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
  const driverSet = new Set(m.top_drivers.map((d) => d.feature));
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
              <span className="mono small" style={{ width: 70, textAlign: "right" }}>{SPECS[d.feature as FeatureName]?.format(d.value) ?? d.value}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted mt-16">Logistic-regression model on 10 engineered features. Used to decide who to look at first, never to diagnose or clear. Validated on held-out (simulated) athletes.</p>
      </section>
      <section className="card">
        <div className="card-header" style={{ marginBottom: 6 }}>
          <h3>What the model looked at today</h3>
        </div>
        <p className="small muted" style={{ margin: "0 0 14px" }}>
          These are the 10 signals the score above is built from, using {first}&apos;s check-ins, wearable and LandingCheck data.
          Each one is compared with a typical healthy range.
        </p>
        <div className="row wrap tiny muted" style={{ gap: 14, marginBottom: 16 }}>
          {(["ok", "watch", "high"] as const).map((s) => (
            <span key={s} className="row" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS[s].color }} />
              {STATUS[s].label}
            </span>
          ))}
          <span className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 700, color: "var(--primary)" }}>▲</span> Pushing risk up today
          </span>
        </div>
        <div className="stack" style={{ "--gap": "18px" } as React.CSSProperties}>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="tiny" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)", marginBottom: 6 }}>{g.title}</div>
              <div style={{ border: "1px solid var(--outline-soft)", borderRadius: "var(--radius-s)", overflow: "hidden" }}>
                {g.features.map((f, i) => {
                  const spec = SPECS[f];
                  const v = m.features[f];
                  const s = spec.status(v);
                  const driver = driverSet.has(f);
                  return (
                    <div
                      key={f}
                      className="row"
                      style={{
                        gap: 12,
                        padding: "10px 12px",
                        alignItems: "flex-start",
                        borderTop: i ? "1px solid var(--outline-soft)" : undefined,
                        borderLeft: `3px solid ${STATUS[s].color}`,
                        background: driver ? "var(--surface-1)" : undefined,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="small" style={{ fontWeight: 600 }}>
                          {FEATURE_LABELS[f]}
                          {driver && <span title="One of the top factors raising today's risk" style={{ color: "var(--primary)", marginLeft: 6 }}>▲</span>}
                        </div>
                        <div className="tiny muted">{spec.what}</div>
                        <div className="tiny muted">Typical: {spec.typical}</div>
                      </div>
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: s === "ok" ? "var(--ink)" : STATUS[s].color }}>{spec.format(v)}</div>
                        <div className="tiny" style={{ color: STATUS[s].color, fontWeight: 500 }}>{STATUS[s].label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="tiny muted mt-16">
          Ranges are general sports-science guides, not the model&apos;s cut-offs. The model weighs all 10 signals together, so one amber value does not by itself mean high risk.
        </p>
      </section>
    </div>
  );
}

type Status = "ok" | "watch" | "high";

const STATUS: Record<Status, { label: string; color: string }> = {
  ok: { label: "In range", color: "var(--low)" },
  watch: { label: "Worth watching", color: "var(--mod)" },
  high: { label: "Concerning", color: "var(--high)" },
};

const band = (v: number, watchAt: number, highAt: number): Status => (v >= highAt ? "high" : v >= watchAt ? "watch" : "ok");
const fmt = (d: number, unit = "") => (v: number) => `${Number(v.toFixed(d))}${unit}`;
const signed = (unit: string) => (v: number) => `${v > 0 ? "+" : ""}${Number(v.toFixed(1))}${unit}`;

const SPECS: Record<FeatureName, { what: string; typical: string; format: (v: number) => string; status: (v: number) => Status }> = {
  acwr: {
    what: "This week's training load compared with the last 4 weeks. Sudden spikes raise injury risk.",
    typical: "0.8 – 1.3",
    format: fmt(2),
    status: (v) => (v > 1.5 ? "high" : v > 1.3 || v < 0.8 ? "watch" : "ok"),
  },
  monotony: {
    what: "How similar every day's training has been this week. High means little variety or recovery.",
    typical: "below 1.5",
    format: fmt(1),
    status: (v) => band(v, 1.5, 2),
  },
  sleep_avg_7d: {
    what: "Average hours of sleep over the past week.",
    typical: "8 h or more",
    format: fmt(1, " h"),
    status: (v) => (v < 7 ? "high" : v < 8 ? "watch" : "ok"),
  },
  sleep_debt_3d: {
    what: "Total hours short of 8 h a night over the last 3 nights.",
    typical: "under 2 h",
    format: fmt(1, " h"),
    status: (v) => band(v, 2, 4),
  },
  hrv_z: {
    what: "Heart-rate variability vs. their own normal. Below zero suggests the body is under-recovered.",
    typical: "above -1 SD (SD = standard deviations from their normal)",
    format: (v) => `${v > 0 ? "+" : ""}${Number(v.toFixed(1))} SD`,
    status: (v) => (v <= -2 ? "high" : v <= -1 ? "watch" : "ok"),
  },
  rhr_delta: {
    what: "Resting heart rate compared with their own normal. Raised can mean fatigue or illness.",
    typical: "under +3 bpm",
    format: signed(" bpm"),
    status: (v) => band(v, 3, 6),
  },
  soreness_max: {
    what: "Most sore body area in today's check-in (0 none, 1 mild, 2 moderate, 3 severe).",
    typical: "0 – 1",
    format: (v) => `${v} / 3`,
    status: (v) => band(v, 2, 3),
  },
  soreness_days_3d: {
    what: "How many of the last 3 days had moderate or worse soreness.",
    typical: "0",
    format: (v) => `${v} of 3`,
    status: (v) => band(v, 1, 3),
  },
  landing_errors: {
    what: "Form errors spotted in the latest LandingCheck video (e.g. knees caving in).",
    typical: "0 – 2",
    format: (v) => `${v} / 10`,
    status: (v) => band(v, 3, 6),
  },
  under_fueled: {
    what: "Ate one meal or fewer on a hard training day.",
    typical: "No",
    format: (v) => (v ? "Yes" : "No"),
    status: (v) => (v ? "high" : "ok"),
  },
};

const GROUPS: { title: string; features: FeatureName[] }[] = [
  { title: "Training load", features: ["acwr", "monotony"] },
  { title: "Sleep", features: ["sleep_avg_7d", "sleep_debt_3d"] },
  { title: "Recovery (wearable)", features: ["hrv_z", "rhr_delta"] },
  { title: "Soreness & movement", features: ["soreness_max", "soreness_days_3d", "landing_errors"] },
  { title: "Fueling", features: ["under_fueled"] },
];

"use client";
import { useState } from "react";
import { useApi, postJson, ErrorBanner, LoadingCard } from "@/components/ui.tsx";
import type { EvalReport } from "@/lib/evals.ts";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function EvalsClient() {
  const { data, error } = useApi<{ gemini_available: boolean; report: EvalReport }>("/api/evals");
  const [gem, setGem] = useState<EvalReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function runGemini() {
    setBusy(true); setErr(null);
    try { setGem((await postJson<{ report: EvalReport }>("/api/evals", { engine: "gemini" })).report); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <LoadingCard lines={6} />;
  const off = data.report;
  const reports = [off, ...(gem ? [gem] : [])];
  const M: [keyof EvalReport["metrics"], string, (v: number) => string][] = [
    ["red_flag_recall", "Emergency signs caught", pct],
    ["high_recall", "High-priority check-ins flagged high", pct],
    ["under_triage", "Under-triaged (rated lower than it should be)", String],
    ["false_emergencies", "False emergency alarms", String],
    ["band_accuracy", "Correct risk band", pct],
    ["guardrail_violations", "Diagnosis / clearance phrases said", String],
    ["clearance_handled", "'Am I cleared?' handled safely", pct],
  ];
  return (
    <>
      <section className="card">
        <div className="card-header">
          <h3>Scorecard</h3>
          <button className="btn btn-filled btn-sm" onClick={runGemini} disabled={busy || !data.gemini_available}>{busy ? "Running 30 scenarios on Gemini…" : data.gemini_available ? "Run with Gemini" : "Add a Gemini key to compare"}</button>
        </div>
        {err && <ErrorBanner message={err} />}
        <table className="table">
          <thead><tr><th>Metric</th>{reports.map((r) => <th key={r.engine}>{r.engine === "gemini" ? "Gemini extraction" : "Offline parser"}</th>)}</tr></thead>
          <tbody>{M.map(([k, l, f]) => <tr key={k}><td>{l}</td>{reports.map((r) => <td key={r.engine} className="mono strong">{f(r.metrics[k])}</td>)}</tr>)}</tbody>
        </table>
        <p className="tiny muted mt-8">Emergency-sign replies are fixed text, never generated. Risk bands come from the versioned rules engine, so the AI only has to understand the check-in correctly; the rules decide.</p>
      </section>
      {reports.map((r) => (
        <section key={r.engine} className="card">
          <div className="card-header"><h3>{r.engine === "gemini" ? "Gemini" : "Offline"}: every scenario</h3><span className="small muted">{r.results.filter((x) => x.pass).length}/{r.n} pass</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th></th><th>Athlete said</th><th>Expected</th><th>Got</th><th>Agent reply</th></tr></thead>
              <tbody>{r.results.map((x) => (
                <tr key={x.id} style={x.pass ? undefined : { background: "var(--high-container)" }}>
                  <td className="mono">{x.pass ? "✓" : "✗"} {x.id}<div className="tiny muted">{x.category}</div></td>
                  <td className="small">“{x.text}”</td>
                  <td className="small">{x.expected.band}{x.expected.red_flag ? " · emergency" : ""}</td>
                  <td className="small">{x.got.band}{x.got.red_flags.length ? ` · ${x.got.red_flags.join(", ").replaceAll("_", " ")}` : ""}<div className="tiny muted mono">{x.got.rules.map((r) => r.split("_")[0]).join(" ")}</div></td>
                  <td className="tiny">{x.got.reply}{x.got.violations.length ? <strong style={{ color: "var(--high)" }}> [{x.got.violations.join(", ")}]</strong> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

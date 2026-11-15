"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { postJson } from "@/components/ui.tsx";
import { TrustStrip } from "@/components/TrustStrip.tsx";
import { AGENT_NAME } from "@/lib/briefLabels.ts";
import type { Brief } from "@/lib/brief.ts";
import type { TrustReport } from "@/lib/trust.ts";

interface TrustResp { athlete: { id: string; name: string; sport: string; grade: number; device: string }; trust: TrustReport; risk: { raw: { risk_7d: number; top_drivers: { label: string; value: number }[] }; trusted: { risk_7d: number; top_drivers: { label: string; value: number }[] } } }
interface ModelCard { metrics: { auroc: number; sensitivity: number; brier: number }; baseline_metrics: { sensitivity: number } }
interface EvalResp { report: { n: number; metrics: { red_flag_recall: number; band_accuracy: number; guardrail_violations: number; false_emergencies: number } } }

const PEOPLE = [
  { id: "ath_04", label: "Ava: alarming numbers that turn out to be a loose watch" },
  { id: "ath_01", label: "Maya: a real recovery problem hiding in noisy data" },
  { id: "ath_07", label: "Hannah: clean data, one clear issue" },
];
const STEPS = ["Collect", "Trust-score", "Risk model", "Agent debate", "Safety check", "Clinician signs", "Back to the athlete"];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EngineLive() {
  const [who, setWho] = useState(PEOPLE[0].id);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [trust, setTrust] = useState<TrustResp | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [shown, setShown] = useState(0);
  const [fhir, setFhir] = useState<string | null>(null);
  const [model, setModel] = useState<ModelCard | null>(null);
  const [evals, setEvals] = useState<EvalResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    fetch("/api/model").then((r) => r.json()).then(setModel).catch(() => {});
    fetch("/api/evals").then((r) => r.json()).then(setEvals).catch(() => {});
  }, []);
  useEffect(() => { if (step >= 0) refs.current[step]?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [step]);

  async function run() {
    setRunning(true); setErr(null); setBrief(null); setFhir(null); setShown(0); setStep(0);
    try {
      const t = (await (await fetch(`/api/trust/${who}`)).json()) as TrustResp;
      setTrust(t);
      await wait(1400); setStep(1);
      await wait(2200); setStep(2);
      await wait(2000); setStep(3);
      const b = (await postJson<{ brief: Brief }>(`/api/brief/${who}`, {})).brief;
      setBrief(b);
      for (let i = 1; i <= b.debate.length; i++) { setShown(i); await wait(900); }
      setStep(4);
      await wait(1600); setStep(5);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setRunning(false); }
  }
  async function sign() {
    await postJson(`/api/brief/${who}`, { decision: "sent", by: "Dr. Patel, Sports Medicine" });
    setFhir(JSON.stringify(await (await fetch(`/api/brief/${who}/fhir`)).json(), null, 2));
    setStep(6);
  }

  const a = trust?.athlete;
  const recentDates = trust ? [...new Set(trust.trust.readings.map((r) => r.date))].slice(-7) : [];
  const sample = trust?.trust.readings.filter((r) => r.metric === "hrv_ms").at(-1);
  const box = (i: number, title: string, sub: string, body: React.ReactNode) => (
    <section ref={(el) => { refs.current[i] = el; }} className={`card engine-step ${step >= i ? "on" : ""} ${step === i ? "now" : ""}`}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <span className="step-badge">{i + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="small muted" style={{ margin: "2px 0 0" }}>{sub}</p>
          {step >= i && <div className="mt-16">{body}</div>}
        </div>
      </div>
    </section>
  );

  return (
    <div className="page"><div className="container stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <header>
        <div className="eyebrow">Behind the scenes</div>
        <h1 style={{ margin: "4px 0" }}>What happens between the watch and the doctor</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 780 }}>97% of physicians say they would review wearable data, but no more than 6% have it in their workflow (AMA, 2026). Ragnor is the layer in between: it decides which readings to trust, lets AI agents argue about what matters, and hands the clinician a short brief they can sign into the chart. (For how a daily check-in becomes a coach decision, see <Link href="/how-it-works">How it works</Link>.)</p>
      </header>

      <section className="card">
        <div className="row wrap" style={{ gap: 12 }}>
          <select value={who} onChange={(e) => { setWho(e.target.value); setStep(-1); setTrust(null); setBrief(null); setFhir(null); }} disabled={running} style={{ padding: "10px 12px", borderRadius: 10, flex: 1, minWidth: 260 }}>
            {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="btn btn-filled" onClick={run} disabled={running}>{running ? "Running…" : step >= 0 ? "Run again" : "Run the pipeline"}</button>
        </div>
        <div className="pipeline-bar mt-16">
          {STEPS.map((s, i) => <span key={s} className={`pipe ${step >= i ? "on" : ""} ${step === i ? "now" : ""}`}>{i + 1}. {s}</span>)}
        </div>
        {err && <p className="small" style={{ color: "var(--high)" }}>{err}</p>}
      </section>

      {box(0, "Collect", "Watch data arrives through the Google Health API's reconciled stream, alongside daily check-ins and landing videos.", a && sample && (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="small">
            <p style={{ marginTop: 0 }}><strong>{a.name}</strong> · {a.sport} · {a.device}</p>
            <p>{trust!.trust.readings.length} nightly readings (HRV, resting heart rate, sleep) over {Math.round(trust!.trust.readings.length / 3)} nights, plus check-ins.</p>
            <p className="tiny muted">Demo data is fictional. In production this is a webhook from the Google Health API (scopes: health metrics, sleep).</p>
          </div>
          <div className="code">{JSON.stringify({ dataType: "daily-heart-rate-variability", point: { date: sample.date, value: sample.value, unit: "ms" }, source: { device: sample.source, platform: "Google Health API" }, capture: { wear_hours: sample.wear_h, motion_artifact_pct: sample.motion_pct } }, null, 2)}</div>
        </div>
      ))}

      {box(1, "Trust-score every reading", "Before any AI sees the data: was the watch actually worn, was there motion artifact, do two sources agree, and has this metric been validated for someone like this person?", trust && (
        <>
          <TrustStrip readings={trust.trust.readings} dates={recentDates} baseline={{ hrv_ms: trust.trust.trusted_vs_baseline.hrv_ms.baseline, rhr_bpm: trust.trust.trusted_vs_baseline.rhr_bpm.baseline, sleep_h: trust.trust.trusted_vs_baseline.sleep_h.baseline }} />
          <p className="small mt-8"><strong>{trust.trust.summary.unverified}</strong> of {trust.trust.summary.total} readings this week excluded. Raw HRV looked <strong>{trust.trust.raw_vs_baseline.hrv_ms.pct ?? 0}%</strong> vs baseline; on trusted readings it is <strong>{trust.trust.trusted_vs_baseline.hrv_ms.pct ?? 0}%</strong>.</p>
        </>
      ))}

      {box(2, "Risk model", "A logistic model on 10 engineered features (training load, sleep debt, HRV and resting HR vs personal baseline, soreness, landing errors) estimates 7-day injury risk.", trust && (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div>
            <div className="row" style={{ gap: 24 }}>
              <div><div className="tiny muted">On raw data</div><div className="kpi" style={{ color: "var(--ink-3)" }}>{pct(trust.risk.raw.risk_7d)}</div></div>
              <div style={{ fontSize: 28, color: "var(--ink-3)" }}>→</div>
              <div><div className="tiny muted">On trusted data</div><div className="kpi">{pct(trust.risk.trusted.risk_7d)}</div></div>
            </div>
            <p className="small">Drivers: {trust.risk.trusted.top_drivers.map((d) => d.label).join(", ") || "none above typical"}.</p>
          </div>
          {model && <div className="small card flat" style={{ margin: 0 }}>
            <strong>Validation (held-out simulated athletes)</strong>
            <div>AUROC {model.metrics.auroc} · calibration (Brier) {model.metrics.brier}</div>
            <div>Catches {Math.round(model.metrics.sensitivity * 100)}% of injuries vs {Math.round(model.baseline_metrics.sensitivity * 100)}% for rules alone</div>
          </div>}
        </div>
      ))}

      {box(3, "Agent debate", "Built with Google's Agent Development Kit on Gemini. Three analysts work in parallel, a skeptic argues every finding is noise, and a lead agent writes the brief.", brief && (
        <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
          {brief.debate.slice(0, shown).map((m, i) => <div key={i} className={`chat-msg agent-${m.agent} fade-in`}><span className="tiny strong">{AGENT_NAME[m.agent]}</span><div className="small">{m.text}</div></div>)}
          {shown < brief.debate.length && <div className="tiny muted">…</div>}
          <div className="tiny muted">Engine: {brief.engine === "adk" ? "Google ADK + Gemini" : "offline agents (no Gemini key or quota)"}</div>
        </div>
      ))}

      {box(4, "Safety check (code, not AI)", "Rules can only make the output more cautious: no diagnosis or clearance language, no finding built on unverified readings, validation limits disclosed.", brief && (
        <div className="list">{brief.safety.map((s, i) => <div key={i} className="list-item small"><span style={{ color: s.passed ? "var(--low)" : "var(--mod)", width: 18 }}>{s.passed ? "✓" : "!"}</span><span><strong>{s.name}</strong> · {s.note}</span></div>)}</div>
      ))}

      {box(5, "Clinician signs", "The clinician sees a short brief: what to discuss, what to watch, and what was ruled out as noise. Nothing reaches the chart until they sign.", brief && (
        <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <div className="strong">{brief.headline}</div>
          {brief.findings.map((f) => <div key={f.id} className="small"><span className={`band band-${f.status === "discuss" ? "high" : f.status === "watch" ? "mod" : "low"}`} style={{ marginRight: 8 }}>{f.status === "discuss" ? "Discuss" : f.status === "watch" ? "Watch" : "Noise"}</span>{f.title}</div>)}
          {!fhir ? <div className="row wrap" style={{ gap: 8 }}><button className="btn btn-filled" onClick={sign}>Sign &amp; send to EHR</button><Link className="btn btn-outlined" href={`/clinician/patient/${who}`}>Open the full brief</Link></div>
            : <details open><summary className="small strong">FHIR R4 DiagnosticReport sent to the EHR, with a trust score on every Observation</summary><div className="code mt-8" style={{ maxHeight: 300, overflow: "auto" }}>{fhir}</div></details>}
        </div>
      ))}

      {box(6, "Back to the athlete", "The athlete gets something useful too, in plain language and never a diagnosis.", trust && brief && (
        <div className="phone-preview small">
          {trust.trust.summary.unverified > 0 && <p>⌚ Your watch missed part of {trust.trust.summary.unverified >= 6 ? "two nights" : "a night"} this week, so we left those readings out. Try wearing it a finger-width above your wrist bone, snug but comfortable.</p>}
          {brief.findings.some((f) => f.id === "sleep" && f.status !== "noise") && <p>😴 You&apos;ve been short on sleep. Your doctor may ask about it at your visit.</p>}
          {brief.findings.some((f) => f.id === "pain" && f.status !== "noise") && <p>🦵 Your clinician has seen your soreness reports. Tell your coach if it gets worse.</p>}
          <p className="tiny muted">Dr. Patel reviewed your shared data on {new Date().toLocaleDateString()}.</p>
        </div>
      ))}

      {evals && <section className="card flat">
        <h3 style={{ marginTop: 0 }}>How we test it</h3>
        <p className="small">{evals.report.n} scripted check-ins run through the production pipeline on every change: <strong>{Math.round(evals.report.metrics.red_flag_recall * 100)}%</strong> of emergency signs caught, <strong>{evals.report.metrics.false_emergencies}</strong> false emergencies, <strong>{evals.report.metrics.guardrail_violations}</strong> unsafe phrases, <strong>{Math.round(evals.report.metrics.band_accuracy * 100)}%</strong> correct triage.</p>
      </section>}
    </div></div>
  );
}

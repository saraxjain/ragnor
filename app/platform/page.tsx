import Link from "next/link";
import { PlatformShell } from "./PlatformNav.tsx";
import { MODEL } from "@/lib/risk.ts";
import { evidenceLibrary } from "@/lib/caseConference.ts";

export const metadata = { title: "Ragnor Engine" };

const LAYERS = [
  { n: "1", t: "Ingest", d: "Daily check-ins (tap, voice or text via Gemini), Google Health API wearables (HRV, resting HR, sleep), landing videos. Partners can push data to POST /api/v1/ingest/wearable." },
  { n: "2", t: "Features", d: "10 engineered signals per athlete-day: acute:chronic workload, monotony, sleep debt, HRV z-score vs personal baseline, resting-HR delta, soreness persistence, landing errors, under-fueling." },
  { n: "3", t: "Risk model", d: `Calibrated logistic model: 7-day injury probability with per-athlete drivers. AUROC ${MODEL.metrics.auroc}, catching ${Math.round(MODEL.metrics.sensitivity * 100)}% of injuries vs ${Math.round(MODEL.baseline_metrics.sensitivity * 100)}% for rules alone.` },
  { n: "4", t: "Rules engine", d: "Deterministic, versioned rules (R1–R9) decide risk bands and emergency escalation. Tools check the AI, not the other way around: rules can only make a decision more cautious." },
  { n: "5", t: "Agents", d: "Google ADK + Gemini. The case conference runs three specialist agents (training load, recovery, movement) in parallel, a lead agent, a vote with objections and one revision round, and a safety reviewer. Gemini also reads voice and typed check-ins and landing videos." },
  { n: "6", t: "Human + audit", d: "Nothing reaches a parent or athlete until a person approves. Every flag, call, vote and decision is in the audit log. FHIR R4 export for clinics and EHRs." },
];

export default function Platform() {
  return (
    <PlatformShell title="The athlete risk intelligence engine" sub="Ragnor is the backend a school, club or medtech partner plugs into: wearable and check-in data in, a validated risk score, agent case reviews and FHIR records out. Every AI step is checked by code and signed off by a person.">
      <div className="grid grid-3">
        {LAYERS.map((l) => (
          <section key={l.n} className="card">
            <div className="row" style={{ gap: 10 }}><span className="icon-bubble" style={{ background: "var(--primary-container)", color: "var(--on-primary-container)", fontWeight: 800 }}>{l.n}</span><h3 style={{ margin: 0 }}>{l.t}</h3></div>
            <p className="small mt-8" style={{ marginBottom: 0 }}>{l.d}</p>
          </section>
        ))}
      </div>
      <section className="card">
        <div className="card-header"><h3>Evidence library</h3><span className="small muted">What the case-conference agents cite</span></div>
        <div className="list">
          {evidenceLibrary().map((e) => (
            <div key={e.id} className="list-item" style={{ alignItems: "flex-start" }}>
              <span className="mono strong" style={{ width: 40, flex: "none" }}>{e.id}</span>
              <span className="small" style={{ flex: 1 }}><strong>{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}</strong> · <span className="muted">{e.source}</span><br />{e.key_point}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="small muted">See it in action: open <Link href="/coach/athlete/ath_01">Maya&apos;s case file</Link> → AI case review.</p>
    </PlatformShell>
  );
}

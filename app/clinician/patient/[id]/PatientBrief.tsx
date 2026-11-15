"use client";
import { useState } from "react";
import Link from "next/link";
import { useApi, postJson, ErrorBanner, LoadingCard, Avatar, timeAgo } from "@/components/ui.tsx";
import { TrustStrip, type SelfReport } from "@/components/TrustStrip.tsx";
import type { Brief, BriefFinding } from "@/lib/brief.ts";
import { AGENT_NAME } from "@/lib/briefLabels.ts";
import type { TrustReport } from "@/lib/trust.ts";

interface TrustResp { athlete: { id: string; name: string; sport: string; grade: number; device: string }; trust: TrustReport; risk: { raw: { risk_7d: number }; trusted: { risk_7d: number } }; reports?: Record<string, SelfReport[]> }
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const STATUS: Record<BriefFinding["status"], { label: string; cls: string }> = { discuss: { label: "Discuss at visit", cls: "high" }, watch: { label: "Watch", cls: "mod" }, noise: { label: "Ruled out: noise", cls: "low" } };

export function PatientBrief({ id }: { id: string }) {
  const t = useApi<TrustResp>(`/api/trust/${id}`);
  const b = useApi<{ brief: Brief | null }>(`/api/brief/${id}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fhir, setFhir] = useState<string | null>(null);
  const brief = b.data?.brief;

  async function run() {
    setBusy(true); setErr(null); setFhir(null);
    try { await postJson(`/api/brief/${id}`, {}); b.reload(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  async function sign(decision: "sent" | "returned") {
    await postJson(`/api/brief/${id}`, { decision });
    b.reload();
    if (decision === "sent") setFhir(JSON.stringify(await (await fetch(`/api/brief/${id}/fhir`)).json(), null, 2));
  }
  if (t.error) return <div className="page"><div className="container"><ErrorBanner message={t.error} /></div></div>;
  if (!t.data) return <div className="page"><div className="container"><LoadingCard lines={8} /></div></div>;
  const { athlete: a, trust } = t.data;
  const reports = t.data.reports ?? {};
  const recentDates = [...new Set(trust.readings.map((r) => r.date))].slice(-7);
  const base = { hrv_ms: trust.trusted_vs_baseline.hrv_ms.baseline, rhr_bpm: trust.trusted_vs_baseline.rhr_bpm.baseline, sleep_h: trust.trusted_vs_baseline.sleep_h.baseline };

  return (
    <div className="page"><div className="container stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <Link href="/clinician" className="small">‹ All patients</Link>
      <header className="card row wrap" style={{ gap: 16 }}>
        <Avatar name={a.name} size={56} />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>{a.name}</h1>
          <div className="small muted">{a.sport} · Grade {a.grade} · {a.device} via Google Health API (sample data)</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="small">7-day injury risk on trusted data: <span className="mono strong">{pct(t.data.risk.trusted.risk_7d)}</span></div>
          {Math.abs(t.data.risk.raw.risk_7d - t.data.risk.trusted.risk_7d) > 0.005 && <div className="tiny muted">on raw data it would have been {pct(t.data.risk.raw.risk_7d)}</div>}
        </div>
      </header>

      <section className="card">
        <div className="card-header">
          <div><h3>Wearable data, trust-scored</h3><p className="small muted" style={{ margin: 0 }}>{trust.summary.pct_usable}% of this week&apos;s readings are usable. {trust.summary.unverified ? `${trust.summary.unverified} were excluded.` : "None were excluded."}</p></div>
        </div>
        <TrustStrip readings={trust.readings} dates={recentDates} baseline={base} reports={reports} />
        {!recentDates.some((d) => reports[d]?.length) && <p className="tiny muted" style={{ margin: "6px 0 0" }}>{a.name.split(" ")[0]} reported no injuries or symptoms in their check-ins this week.</p>}
        <div className="list mt-16">
          {trust.coverage.map((c) => (
            <div key={c.metric} className="list-item small"><span className={`band band-${c.level === "validated" ? "low" : c.level === "limited" ? "mod" : "high"}`} style={{ minWidth: 92 }}>{c.level}</span><span><strong>{c.label}:</strong> {c.note}</span></div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div><h3>Pre-visit brief</h3><p className="small muted" style={{ margin: 0 }}>Four agents review the trusted data. A skeptic argues every finding is noise; only what survives is worth your time.</p></div>
          <button className="btn btn-filled" onClick={run} disabled={busy}>{busy ? "Agents reviewing…" : brief ? "Regenerate" : "Generate brief"}</button>
        </div>
        {err && <ErrorBanner message={err} />}
        {busy && !brief && <LoadingCard lines={5} />}
        {brief && (
          <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
            <div className="row wrap" style={{ gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>{brief.headline}</h2>
              <span className="mono tiny muted">{brief.engine === "adk" ? "Google ADK · Gemini" : "offline agents"} · {timeAgo(brief.created_at)}</span>
            </div>
            {brief.findings.length === 0 && <p className="small">Nothing in this period changes what you would do.</p>}
            {brief.findings.map((f) => (
              <div key={f.id} className="finding" style={{ borderLeftColor: `var(--${STATUS[f.status].cls === "mod" ? "mod-fill" : STATUS[f.status].cls === "low" ? "low-fill" : "high"})`, opacity: f.status === "noise" ? 0.8 : 1 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`band band-${STATUS[f.status].cls}`}>{STATUS[f.status].label}</span>
                  <strong>{f.title}</strong>
                  <span className="tiny muted">confidence {f.confidence}</span>
                </div>
                <p className="small" style={{ margin: "6px 0" }}>{f.summary}</p>
                <p className="small" style={{ margin: "6px 0" }}><strong>Possible next step:</strong> {f.next_step}</p>
                {f.skeptic && <div className="skeptic small"><strong>Skeptic:</strong> {f.skeptic.challenge}<br /><strong>Response:</strong> {f.skeptic.resolution}</div>}
                <details className="tiny mt-8"><summary>Evidence ({f.evidence.length})</summary>
                  <ul style={{ paddingLeft: 16 }}>{f.evidence.map((e, i) => <li key={i}><span className="mono">{e.kind === "literature" ? `[${e.ref}]` : e.ref}</span> {e.detail}{e.trust != null ? ` · trust ${e.trust}` : ""}</li>)}</ul>
                </details>
              </div>
            ))}
            <details className="card flat">
              <summary className="strong small">Agent debate ({brief.debate.length} messages)</summary>
              <div className="stack mt-8" style={{ "--gap": "8px" } as React.CSSProperties}>
                {brief.debate.map((m, i) => <div key={i} className={`chat-msg agent-${m.agent}`}><span className="tiny strong">{AGENT_NAME[m.agent]}</span><div className="small">{m.text}</div></div>)}
              </div>
            </details>
            <div className="list">
              {brief.safety.map((s, i) => <div key={i} className="list-item tiny"><span style={{ color: s.passed ? "var(--low)" : "var(--mod)", width: 16 }}>{s.passed ? "✓" : "!"}</span><span><strong>{s.name}</strong> · {s.note}</span></div>)}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {brief.signoff ? (
                <span className="small"><strong>{brief.signoff.decision === "sent" ? "Signed and sent to the EHR" : "Returned"}</strong> by {brief.signoff.by} · {timeAgo(brief.signoff.at)}</span>
              ) : (
                <>
                  <button className="btn btn-filled" onClick={() => sign("sent")}>Sign &amp; send to EHR</button>
                  <button className="btn btn-outlined" onClick={() => sign("returned")}>Return without filing</button>
                  <span className="tiny muted">Files a FHIR DiagnosticReport with every reading and its trust score.</span>
                </>
              )}
            </div>
            {(fhir || brief.signoff?.decision === "sent") && (
              <details open={!!fhir}>
                <summary className="small strong">FHIR R4 bundle sent to the EHR</summary>
                {fhir ? <div className="code mt-8" style={{ maxHeight: 360, overflow: "auto" }}>{fhir}</div> : <a className="small" href={`/api/brief/${id}/fhir`} target="_blank" rel="noreferrer">Open the bundle</a>}
              </details>
            )}
          </div>
        )}
      </section>
      <p className="tiny muted">Decision support only. Ragnor does not diagnose, and return-to-play decisions stay with the clinician. Demo patient and data are fictional.</p>
    </div></div>
  );
}

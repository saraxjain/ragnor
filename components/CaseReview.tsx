"use client";
import { useState } from "react";
import { useApi, postJson, ErrorBanner, LoadingCard, timeAgo } from "@/components/ui.tsx";
import type { CaseReview as Case, Finding } from "@/lib/caseConference.ts";

const AGENT: Record<Finding["agent"], string> = { load: "Training-load agent", recovery: "Recovery agent", movement: "Movement agent" };
const STATUS: Record<Finding["status"], string> = { concern: "high", watch: "moderate", clear: "low" };

export function CaseReview({ id, name }: { id: string; name: string }) {
  const { data, reload } = useApi<{ case: Case | null }>(`/api/case/${id}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = data?.case;
  const first = name.split(" ")[0];

  async function run() {
    setBusy(true); setErr(null);
    try { await postJson(`/api/case/${id}`, {}); reload(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  async function sign(decision: "accepted" | "rejected") {
    await postJson(`/api/case/${id}`, { decision, by: "Coach Rivera" });
    reload();
  }

  return (
    <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <section className="card">
        <div className="card-header">
          <div>
            <h3>AI case conference</h3>
            <p className="small muted" style={{ margin: 0 }}>Three specialist agents (training load, recovery, movement) review {first} in parallel, a lead agent writes one plan, and a safety agent checks it. You sign off before anyone is contacted.</p>
          </div>
          <button className="btn btn-filled" onClick={run} disabled={busy}>{busy ? "Agents reviewing…" : c ? "Run again" : "Run case review"}</button>
        </div>
        <div className="pipeline small">
          <span className="pill">Evidence pack</span>→<span className="pill">3 specialists (parallel)</span>→<span className="pill">Lead trainer</span>→<span className="pill">Specialists vote</span>→<span className="pill">Safety reviewer</span>→<span className="pill">Your sign-off</span>
        </div>
        {err && <ErrorBanner message={err} />}
      </section>

      {busy && !c && <LoadingCard lines={6} />}

      {c && (
        <>
          <section className="card" style={{ borderLeft: `6px solid var(--${c.plan.priority === "today" ? "high" : c.plan.priority === "this_week" ? "mod" : "low"})` }}>
            <div className="card-header">
              <h3>{c.plan.headline}</h3>
              <span className="mono muted">{c.engine === "adk" ? "Google ADK · Gemini" : "offline reasoning"} · {timeAgo(c.created_at)}</span>
            </div>
            <div className="small strong">Priority: {c.plan.priority.replace("_", " ")}</div>
            <ul className="small" style={{ paddingLeft: 18 }}>
              {c.plan.actions.map((a, i) => <li key={i}><span className="pill" style={{ marginRight: 6 }}>{a.owner}</span>{a.action}</li>)}
            </ul>
            {c.plan.disagreements.length > 0 && (
              <div className="banner banner-warn small"><div><strong>Where the agents disagreed</strong>{c.plan.disagreements.map((d) => <div key={d}>• {d}</div>)}</div></div>
            )}
            <div className="row wrap mt-16" style={{ gap: 8 }}>
              {c.signoff ? (
                <span className="small"><strong>{c.signoff.decision === "accepted" ? "Accepted" : "Rejected"}</strong> by {c.signoff.by} · {timeAgo(c.signoff.at)}</span>
              ) : (
                <>
                  <button className="btn btn-filled btn-sm" onClick={() => sign("accepted")}>Accept plan</button>
                  <button className="btn btn-outlined btn-sm" onClick={() => sign("rejected")}>Reject</button>
                  <span className="tiny muted">Nothing is sent until you accept.</span>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3>Agent debate</h3>
              <span className={`band band-${c.consensus === "none" ? "high" : c.consensus === "after_revision" ? "mod" : "low"}`}>{c.consensus === "unanimous" ? "Unanimous" : c.consensus === "after_revision" ? "Agreed after revision" : "No consensus: needs a human"}</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 0 }}>Each specialist votes on the lead&apos;s plan. Any objection sends it back for one revision; if they still disagree, Ragnor says so instead of guessing.</p>
            {c.debate.map((r) => (
              <div key={r.round} className="mt-8">
                <div className="small strong">Round {r.round}</div>
                <div className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
                  {r.votes.map((v) => (
                    <div key={v.agent} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                      <span className={`band band-${v.vote === "approve" ? "low" : "high"}`} style={{ flex: "none", minWidth: 84 }}>{v.vote === "approve" ? "Approve" : "Object"}</span>
                      <span className="small"><strong>{AGENT[v.agent]}:</strong> {v.reason}</span>
                    </div>
                  ))}
                </div>
                {r.revision && <div className="small mt-8" style={{ color: "var(--primary)" }}>↳ {r.revision}</div>}
              </div>
            ))}
          </section>

          <div className="grid grid-3" style={{ alignItems: "start" }}>
            {c.findings.map((f) => (
              <section key={f.agent} className="card">
                <div className="card-header">
                  <h4 style={{ margin: 0 }}>{AGENT[f.agent]}</h4>
                  <span className={`band band-${STATUS[f.status]}`}>{f.status}</span>
                </div>
                <p className="small">{f.summary}</p>
                <p className="small"><strong>Recommends:</strong> {f.recommendation}</p>
                <div className="tiny muted">Evidence</div>
                <ul className="tiny" style={{ paddingLeft: 16, marginTop: 4 }}>
                  {f.evidence.map((e, i) => <li key={i}><span className="mono">{e.kind === "literature" ? `[${e.ref}]` : e.ref}</span> {e.detail}</li>)}
                </ul>
                <div className="tiny muted">Confidence {Math.round(f.confidence * 100)}%</div>
              </section>
            ))}
          </div>

          <section className="card flat">
            <div className="card-header"><h3>Safety review</h3><span className={`band band-${c.safety.verdict === "approved" ? "low" : "moderate"}`}>{c.safety.verdict}</span></div>
            <div className="list">
              {c.safety.checks.map((k, i) => (
                <div key={i} className="list-item"><span style={{ color: k.passed ? "var(--low)" : "var(--mod)", width: 20 }}>{k.passed ? "✓" : "!"}</span><span className="small" style={{ flex: 1 }}><strong>{k.name}</strong> · {k.note}</span></div>
              ))}
            </div>
            <p className="tiny muted mt-8">The code-level safety check always runs after the AI reviewer and can only make the plan more cautious. Literature ids [E#] refer to published sports-medicine studies in Ragnor's evidence library.</p>
          </section>
        </>
      )}
    </div>
  );
}

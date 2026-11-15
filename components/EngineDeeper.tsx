"use client";
// "Look closer" half of the Behind the scenes page: the risk model's wiring, the coach-side agent review,
// and who decides what. Follows whichever athlete is selected in the live pipeline above.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ErrorBanner, useApi } from "@/components/ui.tsx";
import type { Athlete } from "@/lib/store.ts";
import type { ModelScore } from "@/lib/risk.ts";
import type { CaseReview, Finding } from "@/lib/caseConference.ts";

export interface ModelInfo {
  version: string;
  features: { name: string; label: string; weight: number; mean: number; std: number }[];
  threshold: number;
  auroc: number;
  sensitivity: number;
  baselineSensitivity: number;
  source: string;
}

const AGENT: Record<Finding["agent"], { name: string; looksAt: string }> = {
  load: { name: "Training-load agent", looksAt: "minutes, intensity, week-on-week spikes" },
  recovery: { name: "Recovery agent", looksAt: "sleep, HRV, resting heart rate, meals" },
  movement: { name: "Movement agent", looksAt: "landing video errors, soreness" },
};
const STATUS: Record<Finding["status"], { label: string; band: "high" | "moderate" | "low" }> = {
  concern: { label: "Concern", band: "high" },
  watch: { label: "Watch", band: "moderate" },
  clear: { label: "No concern", band: "low" },
};
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const round = (n: number) => Math.round(n * 100) / 100;

export function EngineDeeper({ id, model, geminiLive, geminiModel }: { id: string; model: ModelInfo; geminiLive: boolean; geminiModel: string }) {
  // Scored on trusted readings only, so the number matches step 3 of the pipeline above.
  const { data, error } = useApi<{ athlete: Pick<Athlete, "id" | "name">; risk: { raw: ModelScore; trusted: ModelScore } }>(`/api/trust/${id}`);
  const a = data?.athlete.id === id ? data.athlete : null;
  const score = data?.athlete.id === id ? data.risk.trusted : null;
  const first = a?.name.split(" ")[0] ?? "the athlete";

  return (
    <div className="stack" style={{ "--gap": "28px", marginTop: 12 } as React.CSSProperties}>
      <header>
        <div className="eyebrow">Look closer</div>
        <h2 style={{ marginTop: 4 }}>How each decision is made</h2>
        <p className="muted" style={{ marginTop: 4, maxWidth: 760 }}>The same athlete as above{a ? ` (${a.name})` : ""}, with the lid off: the risk model's wiring, the agents that write the coach's plan, and who is allowed to decide what.</p>
      </header>
      {error && <ErrorBanner message={error} />}

      <section aria-labelledby="hw-model" className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
        <SectionTitle n="A" id="hw-model" title="The risk model's wiring" sub={`How ${first}'s ten inputs combine into one probability. Line thickness shows how much each input matters for ${first} today. Uses trusted watch readings only.`} />
        <div className="card">
          {score ? <Network model={model} score={score} /> : <div className="muted small">Loading…</div>}
          <div className="row wrap small" style={{ gap: 18, marginTop: 8 }}>
            <span className="row" style={{ gap: 6 }}><i className="hw-key" style={{ background: "var(--high)" }} /> pushes risk up</span>
            <span className="row" style={{ gap: 6 }}><i className="hw-key" style={{ background: "var(--low-fill)" }} /> pulls risk down</span>
            <span className="row" style={{ gap: 6 }}><i className="hw-key" style={{ background: "var(--outline)" }} /> close to typical, little effect</span>
          </div>
        </div>
        <div className="grid grid-3">
          <Fact title="What kind of network is this?" body="The simplest kind: one layer, one output (a logistic regression). We chose it over a deep neural network on purpose, so every prediction can be traced to named inputs a coach or clinician understands." />
          <Fact title="How good is it?" body={`On athletes it never saw in training it caught ${Math.round(model.sensitivity * 100)}% of injuries, against ${Math.round(model.baselineSensitivity * 100)}% for the rules alone (AUROC ${model.auroc}). It flags an athlete at ${pct(model.threshold)} or above.`} />
          <Fact title="What it was trained on" body="A simulated season of 420 athletes, not real injury records. The numbers show the method works; real pilot data is needed before anyone should trust them." warn />
        </div>
      </section>

      <AgentRun id={id} first={first} geminiLive={geminiLive} geminiModel={geminiModel} />

      <section aria-labelledby="hw-who" className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
        <SectionTitle n="C" id="hw-who" title="Who decides what" sub="The short version to remember." />
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="hw-table">
            <thead><tr><th>Decision</th><th>Made by</th><th>Why</th></tr></thead>
            <tbody>
              <tr><td>Which watch readings count</td><td><strong>Trust layer (code)</strong></td><td>A reading from a watch worn for three hours is left out before any model or agent sees it.</td></tr>
              <tr><td>Risk level (low, moderate, high)</td><td><strong>Written rules</strong></td><td>Same input always gives the same answer, and it can be audited.</td></tr>
              <tr><td>Emergency signs ("get medical care now")</td><td><strong>Written rules</strong></td><td>Never left to an AI. Shown instantly.</td></tr>
              <tr><td>Probability of injury</td><td><strong>Risk model</strong></td><td>Adds a graded number on top of the rules; it cannot lower the risk level.</td></tr>
              <tr><td>Explanation, brief and suggested plan</td><td><strong>AI agents</strong></td><td>They read the evidence, argue in the open, and a skeptic tries to knock each finding down. Code checks the wording.</td></tr>
              <tr><td>What reaches the chart, an athlete or a parent</td><td><strong>A person</strong></td><td>A clinician signs every brief; a coach or trainer accepts or rejects every plan.</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">Ragnor never diagnoses and never clears an athlete to play. A filter removes that language from every AI output before it is shown.</p>
      </section>
    </div>
  );
}

function SectionTitle({ n, id, title, sub }: { n: number | string; id: string; title: string; sub: string }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
      <span className="hw-num" aria-hidden>{n}</span>
      <div>
        <h2 id={id}>{title}</h2>
        <p className="muted" style={{ marginTop: 4 }}>{sub}</p>
      </div>
    </div>
  );
}

function Fact({ title, body, warn }: { title: string; body: string; warn?: boolean }) {
  return (
    <div className="card flat" style={warn ? { background: "var(--mod-container)", borderColor: "transparent" } : undefined}>
      <h4>{title}</h4>
      <p className="small mt-8" style={{ color: warn ? "#6b4000" : "var(--ink-2)" }}>{body}</p>
    </div>
  );
}

/** One-layer network: 10 inputs, weighted, into a single output. Contribution = standardized value x weight. */
function Network({ model, score }: { model: ModelInfo; score: ModelScore }) {
  const W = 820, rowH = 40, top = 24, H = top * 2 + rowH * (model.features.length - 1) + 16;
  const inX = 330, outX = 620, outY = H / 2;
  const rows = model.features.map((f, i) => {
    const value = (score.features as unknown as Record<string, number>)[f.name] ?? 0;
    const contribution = ((value - f.mean) / (f.std || 1)) * f.weight;
    return { ...f, value, contribution, y: top + i * rowH };
  });
  const flagged = score.risk_7d >= model.threshold;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Risk model diagram. Output: ${pct(score.risk_7d)} chance of injury in 7 days.`} style={{ width: "100%", height: "auto" }}>
      <text x={inX} y={12} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--ink-3)" letterSpacing="1">INPUTS (TODAY)</text>
      <text x={outX} y={12} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink-3)" letterSpacing="1">OUTPUT</text>
      {rows.map((r) => {
        const strong = Math.abs(r.contribution) >= 0.08;
        const color = !strong ? "var(--outline)" : r.contribution > 0 ? "var(--high)" : "var(--low-fill)";
        return (
          <g key={r.name}>
            <line x1={inX + 10} y1={r.y} x2={outX - 46} y2={outY} stroke={color} strokeWidth={1.2 + Math.min(9, Math.abs(r.contribution) * 9)} strokeLinecap="round" opacity={strong ? 0.85 : 0.55} />
            <circle cx={inX} cy={r.y} r={9} fill="var(--surface)" stroke={color} strokeWidth={2.5} />
            <text x={inX - 62} y={r.y + 4} textAnchor="end" fontSize="13" fill="var(--ink)">{r.label}</text>
            <text x={inX - 18} y={r.y + 4} textAnchor="end" fontSize="13" fontWeight="700" fill="var(--ink)">{round(r.value)}</text>
          </g>
        );
      })}
      <circle cx={outX} cy={outY} r={46} fill={flagged ? "var(--high-container)" : "var(--low-container)"} stroke={flagged ? "var(--high)" : "var(--low-fill)"} strokeWidth={3} />
      <text x={outX} y={outY + 2} textAnchor="middle" fontSize="21" fontWeight="800" fill="var(--ink)">{pct(score.risk_7d)}</text>
      <text x={outX} y={outY + 19} textAnchor="middle" fontSize="10.5" fill="var(--ink-2)">in 7 days</text>
      <text x={outX + 62} y={outY - 6} fontSize="13" fontWeight="700" fill="var(--ink)">{flagged ? "Above the flag line" : "Below the flag line"}</text>
      <text x={outX + 62} y={outY + 12} fontSize="12" fill="var(--ink-3)">flag line: {pct(model.threshold)}</text>
    </svg>
  );
}

const STAGES = ["Evidence pack", "3 specialists", "Lead agent", "Vote", "Safety review", "Human sign-off"] as const;

function AgentRun({ id, first, geminiLive, geminiModel }: { id: string; first: string; geminiLive: boolean; geminiModel: string }) {
  const [c, setC] = useState<CaseReview | null>(null);
  const [stage, setStage] = useState(0); // 0 idle, 1..6 = STAGES reached
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Show a review that already exists for this athlete (for example one run from the coach view).
  useEffect(() => {
    clear();
    setC(null); setStage(0); setErr(null);
    let on = true;
    fetch(`/api/case/${id}`, { cache: "no-store" }).then((r) => r.json()).then((b: { case: CaseReview | null }) => { if (on && b.case) { setC(b.case); setStage(6); } }).catch(() => {});
    return () => { on = false; clear(); };
  }, [id]);

  async function run() {
    clear();
    setBusy(true); setErr(null); setC(null); setStage(1);
    timers.current.push(setTimeout(() => setStage((s) => Math.max(s, 2)), 700));
    try {
      const res = await fetch(`/api/case/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await res.json()) as { case?: CaseReview; error?: string };
      if (!res.ok || !body.case) throw new Error(body.error ?? "The review could not be run.");
      clear();
      setC(body.case);
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      [2, 3, 4, 5, 6].forEach((s, i) => timers.current.push(setTimeout(() => setStage(s), still ? 0 : 900 * i)));
    } catch (e) {
      clear();
      setErr(e instanceof Error ? e.message : "The review could not be run.");
      setStage(0);
    } finally {
      setBusy(false);
    }
  }

  const revised = (c?.debate.length ?? 0) > 1;
  const outcome = !c ? null : c.consensus === "unanimous" ? "All three specialists approved the plan on the first vote." : c.consensus === "after_revision" ? "A specialist objected, the lead revised the plan, and the second vote passed." : "The specialists still disagreed after one revision, so the plan is shown with the disagreement spelled out.";

  return (
    <section aria-labelledby="hw-agents" className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
      <SectionTitle n="B" id="hw-agents" title="The coach-side agents" sub={`A second agent team writes a plan for the coach. Run a real review of ${first}'s case and watch each agent's part.`} />
      <div className="card stack">
        <div className="row spread wrap">
          <div className="small muted" style={{ maxWidth: 620 }}>
            {geminiLive ? <>Built with Google ADK on <span className="mono">{geminiModel}</span>. If the model is busy or out of quota, the same steps run on fixed offline logic and the result says so.</> : <>No Gemini key is set, so the steps run on fixed offline logic (no AI model is called).</>}
          </div>
          <button className="btn btn-filled" onClick={run} disabled={busy}>{busy ? <><span className="spinner" /> Agents reviewing…</> : c ? "Run again" : "Run the review"}</button>
        </div>

        <ol className="hw-flow" aria-label="Agent workflow">
          {STAGES.map((s, i) => {
            const n = i + 1;
            const state = stage > n || (stage === 6 && n === 6) ? "done" : stage === n ? "active" : "idle";
            return (
              <li key={s} className={`hw-node ${state}`} aria-current={state === "active" ? "step" : undefined}>
                <span className="hw-node-n">{state === "done" ? "✓" : n}</span>
                <span className="hw-node-t">{s}</span>
                {n === 2 && <span className="hw-node-s">in parallel</span>}
                {n === 4 && <span className="hw-node-s">{revised ? "objection → revised" : "object → 1 revision"}</span>}
              </li>
            );
          })}
        </ol>

        {err && <ErrorBanner message={err} />}
        {!c && !busy && !err && <p className="small muted">Nothing has run yet for {first}. Press "Run the review".</p>}

        {c && (
          <div className="stack" aria-live="polite">
            <div className="row wrap small" style={{ gap: 8 }}>
              <span className="pill teal">{c.engine === "adk" ? "Ran on Google ADK + Gemini" : "Ran on offline logic (no AI model)"}</span>
              <span className="muted">{new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
            </div>

            {stage >= 2 && (
              <div>
                <h4>Step 2 · Three specialists each read the same evidence</h4>
                <div className="grid grid-3 mt-8">
                  {c.findings.map((f) => (
                    <div key={f.agent} className="card flat hw-in">
                      <div className="row spread"><strong>{AGENT[f.agent].name}</strong><span className={`band band-${STATUS[f.status].band}`}>{STATUS[f.status].label}</span></div>
                      <div className="tiny muted">Looks at: {AGENT[f.agent].looksAt}</div>
                      <p className="small mt-8">{f.summary}</p>
                      <p className="small mt-8"><strong>Suggests:</strong> {f.recommendation}</p>
                      <div className="hw-conf mt-8" aria-label={`Confidence ${Math.round(f.confidence * 100)} percent`}><i style={{ width: `${Math.round(f.confidence * 100)}%` }} /></div>
                      <div className="tiny muted">Confidence {Math.round(f.confidence * 100)}% · {f.evidence.length} piece{f.evidence.length === 1 ? "" : "s"} of evidence cited</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stage >= 3 && (
              <div className="hw-in">
                <h4>Step 3 · The lead agent combines them into one plan</h4>
                <div className="card primary mt-8" style={{ border: 0 }}>
                  <div className="row spread wrap"><strong style={{ fontSize: 17 }}>{c.plan.headline}</strong><span className="pill">{c.plan.priority === "today" ? "Act today" : c.plan.priority === "this_week" ? "This week" : "Routine"}</span></div>
                  <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 18 }}>{c.plan.actions.map((x, i) => <li key={i}><strong style={{ textTransform: "capitalize" }}>{x.owner}:</strong> {x.action}</li>)}</ul>
                </div>
              </div>
            )}

            {stage >= 4 && (
              <div className="hw-in">
                <h4>Step 4 · The specialists vote on the plan</h4>
                <div className="stack mt-8" style={{ "--gap": "10px" } as React.CSSProperties}>
                  {c.debate.map((r) => (
                    <div key={r.round} className="card flat">
                      <div className="small strong">Round {r.round}</div>
                      <div className="stack mt-8" style={{ "--gap": "8px" } as React.CSSProperties}>
                        {r.votes.map((v) => (
                          <div key={v.agent} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                            <span className={`band band-${v.vote === "approve" ? "low" : "high"}`} style={{ flex: "none", minWidth: 92 }}>{v.vote === "approve" ? "Approve" : "Object"}</span>
                            <span className="small"><strong>{AGENT[v.agent].name}:</strong> {v.reason}</span>
                          </div>
                        ))}
                      </div>
                      {r.revision && <p className="small mt-8"><strong>Lead's revision:</strong> {r.revision}</p>}
                    </div>
                  ))}
                  {c.plan.disagreements.length > 0 && <div className="banner banner-warn small"><div><strong>Where they disagreed</strong>{c.plan.disagreements.map((d) => <div key={d}>• {d}</div>)}</div></div>}
                  <p className="small"><strong>Outcome:</strong> {outcome}</p>
                </div>
              </div>
            )}

            {stage >= 5 && (
              <div className="hw-in">
                <h4>Step 5 · The safety reviewer checks the final plan</h4>
                <div className="card flat mt-8">
                  <div className="small strong">{c.safety.verdict === "approved" ? "Passed without changes" : "Changed by the safety review"}</div>
                  <ul className="hw-checks">{c.safety.checks.map((k, i) => <li key={i} className={k.passed ? "ok" : "no"}><span>{k.name}</span><span className="muted">{k.note}</span></li>)}</ul>
                </div>
              </div>
            )}

            {stage >= 6 && (
              <div className="hw-in banner banner-info">
                <div><strong>Step 6 · Waiting for a person.</strong> {c.signoff ? `${c.signoff.by} ${c.signoff.decision} this plan.` : "No one has been contacted. A coach or trainer accepts or rejects this plan in the coach view."} <Link href={`/coach/athlete/${id}`}>Open {first} in the coach view →</Link></div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

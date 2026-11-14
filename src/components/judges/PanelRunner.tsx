"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEVEL_LABEL } from "@/lib/copy";
import type { ConclusionContent, GuardrailResult, PanelEvent, TurnContent } from "@/lib/panel/types";
import type { Level } from "@/lib/types";

export interface DemoAthlete {
  id: string;
  label: string;
  description: string;
}

type Status = "idle" | "running" | "done" | "error";
type StageState = "pending" | "running" | "done";

type TurnEvent = Extract<PanelEvent, { type: "turn" }>;
type ConclusionEvent = Extract<PanelEvent, { type: "conclusion" }>;

interface RunState {
  status: Status;
  mode?: Extract<PanelEvent, { type: "mode" }>;
  brief?: unknown;
  rules?: Extract<PanelEvent, { type: "rules" }>;
  turns: TurnEvent[];
  conclusion?: ConclusionEvent;
  guardrail?: GuardrailResult;
  error?: string;
  fellBack?: string;
}

const initial: RunState = { status: "idle", turns: [] };

function reduce(s: RunState, e: PanelEvent): RunState {
  switch (e.type) {
    case "mode":
      // A second mode event means the live run failed and the page is replaying a scripted example: start the display over.
      return s.mode ? { status: "running", mode: e, turns: [], fellBack: e.reason } : { ...s, mode: e };
    case "brief":
      return { ...s, brief: e.brief };
    case "rules":
      return { ...s, rules: e };
    case "turn":
      return { ...s, turns: [...s.turns, e] };
    case "conclusion":
      return { ...s, conclusion: e };
    case "guardrail":
      return { ...s, guardrail: e.result };
    case "done":
      return { ...s, status: "done" };
    case "error":
      return { ...s, status: "error", error: e.message };
  }
}

const ROLE_MARK: Record<string, string> = { load_analyst: "L", symptom_watcher: "S", sceptic: "?", moderator: "M" };

function ConfidenceChip({ view }: { view: string }) {
  return <span className={`chip ${view === "low" ? "moderate" : ""}`}>{view} confidence</span>;
}

function TurnCard({ t }: { t: TurnEvent }) {
  const c: TurnContent = t.content;
  return (
    <article className={`agent ${t.role}`} aria-label={`${t.name}, round ${t.round}`}>
      <h4>
        <span aria-hidden="true">[{ROLE_MARK[t.role]}] </span>
        {t.name}
        <ConfidenceChip view={c.confidenceView} />
      </h4>
      {t.withheld ? (
        <p className="withheld">{c.argument}</p>
      ) : t.round === 2 && c.concedes ? (
        <>
          <p style={{ margin: "0 0 0.3rem" }}>
            <strong>Concedes:</strong> {c.concedes}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Still disputes:</strong> {c.stillDisputes}
          </p>
        </>
      ) : (
        <p style={{ margin: 0 }}>{c.argument}</p>
      )}
      {!t.withheld && (
        <p className="small" style={{ margin: "0.4rem 0 0" }}>
          <strong>Reviewer should look first at:</strong> {c.reviewerFocus}
        </p>
      )}
      {c.dataPoints.length > 0 && (
        <>
          <p className="small muted" style={{ margin: "0.4rem 0 0" }}>
            Data relied on:
          </p>
          <ul className="small">
            {c.dataPoints.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

function Conclusion({ e }: { e: ConclusionEvent }) {
  const c: ConclusionContent = e.content;
  return (
    <article className="agent moderator" aria-label="Moderator conclusion">
      <h4>
        <span aria-hidden="true">[M] </span>Moderator conclusion
        <ConfidenceChip view={c.confidence} />
      </h4>
      <p className="small muted" style={{ margin: "0 0 0.4rem" }}>
        {e.framing}
      </p>
      <p className={e.withheld ? "withheld" : undefined} style={{ margin: "0 0 0.3rem" }}>
        <strong>Explanation:</strong> {c.explanation}
      </p>
      <p className={e.withheld ? "withheld" : undefined} style={{ margin: "0 0 0.3rem" }}>
        <strong>Reviewer should look first at:</strong> {c.reviewerFocus}
      </p>
      <p className={e.withheld ? "withheld" : undefined} style={{ margin: 0 }}>
        <strong>Suggested action:</strong> {c.action}
      </p>
      {c.missing.length > 0 && (
        <p style={{ margin: "0.4rem 0 0" }}>
          <strong>Missing:</strong> {c.missing.join(" ")}
        </p>
      )}
      {c.agreements.length > 0 && (
        <>
          <p style={{ margin: "0.5rem 0 0" }}>
            <strong>Agreed:</strong>
          </p>
          <ul>
            {c.agreements.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {c.disputes.length > 0 && (
        <>
          <p style={{ margin: "0.5rem 0 0" }}>
            <strong>Still in dispute:</strong>
          </p>
          <ul>
            {c.disputes.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

function Guardrail({ g }: { g: GuardrailResult }) {
  const lv = (l: Level) => LEVEL_LABEL[l];
  return (
    <section aria-label="Guardrail result">
      <dl className="guard">
        <div>
          <dt>Rules engine level</dt>
          <dd>{lv(g.rulesLevel)}</dd>
        </div>
        <div>
          <dt>Level stated by the model</dt>
          <dd>{g.statedLevel ? lv(g.statedLevel) : "None (as required)"}</dd>
        </div>
        <div className="final">
          <dt>Final level (rules only)</dt>
          <dd>{lv(g.finalLevel)}</dd>
        </div>
        <div>
          <dt>Guardrail overrode the model?</dt>
          <dd>{g.overrodeModerator ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <p className="small">Final confidence: {g.confidence}. The final level is always the rules level. A level stated by the model is recorded as an override attempt and ignored.</p>
      {g.overrideReasons.length > 0 && (
        <ul className="small">
          {g.overrideReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <p className="small">
        Wording filter: {g.withheld.length === 0 ? "every message passed the wording rules." : `${g.withheld.length} message(s) withheld: ${g.withheld.map((w) => `${w.role} (${w.round})`).join(", ")}.`}
      </p>
    </section>
  );
}

export function PanelRunner({ athletes }: { athletes: DemoAthlete[] }) {
  const [athleteId, setAthleteId] = useState(athletes[0]?.id ?? "");
  const [run, setRun] = useState<RunState>(initial);
  const abortRef = useRef<AbortController | null>(null);
  const running = run.status === "running";

  useEffect(() => () => abortRef.current?.abort(), []); // abort on unmount

  const start = useCallback(async () => {
    if (abortRef.current && run.status === "running") return; // no overlapping runs
    const ctl = new AbortController();
    abortRef.current = ctl;
    setRun({ status: "running", turns: [] });
    try {
      const res = await fetch("/api/panel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ athleteId }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().then((j: { error?: string }) => j.error, () => undefined);
        setRun((s) => ({ ...s, status: "error", error: msg ?? `Request failed (${res.status}).` }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) setRun((s) => reduce(s, JSON.parse(line) as PanelEvent));
        }
      }
      setRun((s) => (s.status === "running" ? { ...s, status: "error", error: "The stream ended before the run finished." } : s));
    } catch (e) {
      if (ctl.signal.aborted) return;
      setRun((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : "Something went wrong." }));
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
    }
  }, [athleteId, run.status]);

  const stages = useMemo(() => {
    const r1 = run.turns.filter((t) => t.round === 1).length;
    const r2 = run.turns.filter((t) => t.round === 2).length;
    const started = run.status !== "idle";
    const st = (done: boolean, ready: boolean): StageState => (done ? "done" : started && ready ? "running" : "pending");
    return [
      { name: "Case brief", state: st(!!run.brief, true) },
      { name: "Rules result", state: st(!!run.rules, !!run.brief) },
      { name: "Round 1: openings", state: st(r1 === 3, !!run.rules) },
      { name: "Round 2: rebuttals", state: st(r2 === 3, r1 === 3) },
      { name: "Moderator", state: st(!!run.conclusion, r2 === 3) },
      { name: "Guardrail", state: st(!!run.guardrail, !!run.conclusion) },
    ];
  }, [run]);

  const selected = athletes.find((a) => a.id === athleteId);
  const scripted = run.mode?.mode === "scripted";

  return (
    <div>
      <div className="card">
        <div className="field">
          <label htmlFor="panel-athlete">Demo athlete</label>
          <select id="panel-athlete" value={athleteId} onChange={(e) => setAthleteId(e.target.value)} disabled={running}>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          {selected && <p className="small muted" style={{ margin: "0.3rem 0 0" }}>{selected.description}</p>}
        </div>
        <button className="btn" type="button" onClick={start} disabled={running || !athleteId}>
          {running ? "Running..." : run.status === "idle" ? "Run the panel" : "Run again"}
        </button>
      </div>

      {run.mode && (
        <p style={{ margin: "1rem 0 0.25rem" }}>
          <span className={`mode-badge ${scripted ? "scripted" : "live"}`}>
            {scripted ? run.mode.label : `Live AI: ${run.mode.model}`}
          </span>
        </p>
      )}
      {run.fellBack && <p className="error-summary" role="status">{run.fellBack}</p>}
      {run.status === "error" && (
        <div className="error-summary" role="alert">
          <strong>The run failed.</strong> {run.error}{" "}
          <button className="btn secondary" type="button" onClick={start}>
            Retry
          </button>
        </div>
      )}

      <ol className="stages" aria-label="Pipeline stages">
        {stages.map((s) => (
          <li key={s.name} className="stage" data-state={s.state}>
            <span className="dot" aria-hidden="true" />
            {s.name}
            <span className="small muted">({s.state})</span>
          </li>
        ))}
      </ol>

      {run.brief !== undefined && (
        <details className="card" open>
          <summary>Case brief {scripted ? "(exactly what a model would receive)" : "(exactly as sent to the model)"}</summary>
          <p className="small muted">De-identified: no names, initials, ids, dates of birth, notes, school, team or calendar dates.</p>
          <pre className="brief-pre mono" tabIndex={0}>{JSON.stringify(run.brief, null, 2)}</pre>
        </details>
      )}

      {run.rules && (
        <section aria-label="Rules result">
          <h3>Rules result: {LEVEL_LABEL[run.rules.level]}</h3>
          {run.rules.flags.length === 0 ? (
            <p>No rule produced a flag.</p>
          ) : (
            <ul>
              {run.rules.flags.map((f, i) => (
                <li key={i}>
                  <strong>{f.ruleId}</strong> ({f.level}, {f.confidence} confidence{f.trainerAlert ? ", trainer alert" : ""}): {f.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <h3>Debate transcript</h3>
      <div role="log" aria-live="polite" aria-label="Debate transcript">
        {run.turns.length === 0 && run.status !== "running" && <p className="muted">Run the panel to see the debate.</p>}
        {[1, 2].map((round) => {
          const ts = run.turns.filter((t) => t.round === round);
          if (ts.length === 0) return null;
          return (
            <section key={round} aria-label={round === 1 ? "Round 1, opening positions" : "Round 2, rebuttals"}>
              <h4 style={{ margin: "1rem 0 0.4rem" }}>{round === 1 ? "Round 1: opening positions" : "Round 2: rebuttals"}</h4>
              {ts.map((t) => (
                <TurnCard key={`${t.round}-${t.role}`} t={t} />
              ))}
            </section>
          );
        })}
        {run.conclusion && (
          <section aria-label="Conclusion">
            <h4 style={{ margin: "1rem 0 0.4rem" }}>Conclusion</h4>
            <Conclusion e={run.conclusion} />
          </section>
        )}
      </div>

      {run.guardrail && (
        <>
          <h3>Guardrail</h3>
          <Guardrail g={run.guardrail} />
        </>
      )}
    </div>
  );
}

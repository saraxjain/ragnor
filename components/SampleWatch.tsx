"use client";
// Lets anyone try the watch features without a real Fitbit: pick a scenario and 28 nights of sample data are loaded.
import { useState } from "react";
import { SAMPLE_SCENARIOS, type SampleScenario } from "@/lib/sampleWearable.ts";

export function SampleWatch({ id, current, hasData, onChange }: { id: string; current?: string; hasData: boolean; onChange: () => void }) {
  const [pick, setPick] = useState<SampleScenario>(current && current in SAMPLE_SCENARIOS ? (current as SampleScenario) : "steady");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(scenario: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/health/sample", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ athlete_id: id, scenario }) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) throw new Error(body?.error ?? "We couldn't load the sample data. Try again.");
      setMsg(scenario === "none" ? "Watch data removed." : `Loaded 28 nights: ${body.label}.`);
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "We couldn't load the sample data. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sample-watch">
      <div className="small strong">No watch handy? Try sample watch data</div>
      <p className="tiny muted" style={{ marginTop: 2 }}>Loads 21 nights to learn a normal, plus the last 7 nights. It is labelled as sample data everywhere.</p>
      <div className="row wrap" style={{ gap: 6, marginTop: 10 }} role="radiogroup" aria-label="Sample scenario">
        {(Object.keys(SAMPLE_SCENARIOS) as SampleScenario[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={pick === s} className="toggle-chip" aria-pressed={pick === s} onClick={() => setPick(s)}>{SAMPLE_SCENARIOS[s].label}</button>
        ))}
      </div>
      <p className="small" style={{ marginTop: 8 }}>{SAMPLE_SCENARIOS[pick].blurb}</p>
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button className="btn btn-filled btn-sm" onClick={() => send(pick)} disabled={busy}>{busy ? <span className="spinner" /> : null} Load this sample</button>
        {hasData && <button className="btn btn-text btn-sm" onClick={() => send("none")} disabled={busy}>Remove watch data</button>}
        {msg && <span className="small muted" role="status">{msg}</span>}
      </div>
    </div>
  );
}

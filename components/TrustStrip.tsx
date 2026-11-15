"use client";
import type { Reading, Metric } from "@/lib/trust.ts";

export const TRUST_COLOR = { trusted: "var(--low-fill)", caution: "var(--mod-fill)", unverified: "var(--high)" } as const;
const NAME: Record<Metric, string> = { hrv_ms: "Overnight HRV", rhr_bpm: "Resting HR", sleep_h: "Sleep" };
const UNIT: Record<Metric, string> = { hrv_ms: "ms", rhr_bpm: "bpm", sleep_h: "h" };

/** One row per metric: a dot per night, colored by trust, value underneath. Hover shows the reasons. */
export function TrustStrip({ readings, dates, baseline }: { readings: Reading[]; dates: string[]; baseline: Record<Metric, number | null> }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table trust-table">
        <thead>
          <tr><th>Metric</th>{dates.map((d) => <th key={d} className="tiny">{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}</th>)}<th className="tiny">Baseline</th></tr>
        </thead>
        <tbody>
          {(["hrv_ms", "rhr_bpm", "sleep_h"] as Metric[]).map((m) => (
            <tr key={m}>
              <td className="small strong">{NAME[m]}</td>
              {dates.map((d) => {
                const r = readings.find((x) => x.date === d && x.metric === m);
                if (!r) return <td key={d} className="tiny muted">–</td>;
                return (
                  <td key={d} title={`Trust ${r.trust}/100 · ${r.reasons.join(" · ")}`} style={{ textAlign: "center" }}>
                    <div className="trust-dot" style={{ background: TRUST_COLOR[r.label] }} aria-label={`${r.label}, trust ${r.trust}`} />
                    <div className={`tiny mono ${r.label === "unverified" ? "strike" : ""}`}>{r.value}</div>
                    <div className="tiny muted">{r.trust}</div>
                  </td>
                );
              })}
              <td className="tiny mono muted">{baseline[m] ?? "–"} {UNIT[m]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row wrap tiny muted" style={{ gap: 14 }}>
        <span><span className="trust-dot inline" style={{ background: TRUST_COLOR.trusted }} /> trusted (75+)</span>
        <span><span className="trust-dot inline" style={{ background: TRUST_COLOR.caution }} /> use with caution (50–74)</span>
        <span><span className="trust-dot inline" style={{ background: TRUST_COLOR.unverified }} /> unverified, excluded (&lt;50)</span>
        <span>Small number = trust score. Hover a night for why.</span>
      </div>
    </div>
  );
}

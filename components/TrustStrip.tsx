"use client";
import { useRef, useState } from "react";
import type { Reading, Metric, TrustLabel } from "@/lib/trust.ts";

export const TRUST_COLOR = { trusted: "var(--low-fill)", caution: "var(--mod-fill)", unverified: "var(--high)" } as const;
const NAME: Record<Metric, string> = { hrv_ms: "Overnight HRV", rhr_bpm: "Resting HR", sleep_h: "Sleep" };
const UNIT: Record<Metric, string> = { hrv_ms: "ms", rhr_bpm: "bpm", sleep_h: "h" };
/** Which direction is healthy, so a delta can say "worse" or "better" in words, not just a sign. */
const GOOD_UP: Record<Metric, boolean> = { hrv_ms: true, rhr_bpm: false, sleep_h: true };
const HINT: Record<Metric, string> = { hrv_ms: "higher is better", rhr_bpm: "lower is better", sleep_h: "more is better" };
const GLYPH: Record<TrustLabel, string> = { trusted: "✓", caution: "!", unverified: "✕" };
const LABEL: Record<TrustLabel, string> = { trusted: "Trusted", caution: "Use with caution", unverified: "Excluded" };
const METRICS: Metric[] = ["hrv_ms", "rhr_bpm", "sleep_h"];

const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00").toLocaleDateString("en-US", opts);

function delta(m: Metric, value: number, base: number | null) {
  if (base == null || base === 0) return null;
  const pct = ((value - base) / base) * 100;
  const worse = GOOD_UP[m] ? pct < 0 : pct > 0;
  const notable = Math.abs(pct) >= 10;
  return { pct, worse, notable, text: `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct).toFixed(0)}%` };
}

/** Trust ring: the arc fills to the trust score (0–100), the glyph names the verdict so it never relies on color alone. */
function TrustRing({ r, size = 30 }: { r: Pick<Reading, "trust" | "label">; size?: number }) {
  return (
    <span className="trust-ring" style={{ width: size, height: size, background: `conic-gradient(${TRUST_COLOR[r.label]} ${r.trust * 3.6}deg, var(--surface-3) 0)` }} aria-hidden>
      <span className="trust-ring-core" style={{ color: TRUST_COLOR[r.label] }}>{GLYPH[r.label]}</span>
    </span>
  );
}

/** One row per metric, one column per night. Each cell: value with unit, change vs baseline, trust ring + score. Hover for the full breakdown. */
export function TrustStrip({ readings, dates, baseline }: { readings: Reading[]; dates: string[]; baseline: Record<Metric, number | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ r: Reading; x: number; y: number; above: boolean } | null>(null);
  const show = (r: Reading) => (e: React.SyntheticEvent<HTMLElement>) => {
    const box = wrap.current?.getBoundingClientRect();
    const c = e.currentTarget.getBoundingClientRect();
    if (!box) return;
    const above = c.bottom + 200 > window.innerHeight;
    const x = Math.min(Math.max(c.left + c.width / 2 - box.left, 125), box.width - 125);
    setTip({ r, x, y: above ? c.top - box.top - 6 : c.bottom - box.top + 6, above });
  };
  const hide = () => setTip(null);
  const t = tip?.r;
  const td = t ? delta(t.metric, t.value, baseline[t.metric]) : null;
  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <div className="ts-key" aria-label="How to read each cell">
        <div className="ts-key-cell">
          <TrustRing r={{ trust: 82, label: "trusted" }} />
          <div>
            <div className="ts-val mono">52 <span className="ts-unit">ms</span></div>
            <div className="ts-delta">−6% vs baseline</div>
          </div>
        </div>
        <ul className="ts-key-notes tiny">
          <li><strong>Big number</strong> = that night&apos;s reading, in the row&apos;s unit</li>
          <li><strong>% line</strong> = change from the athlete&apos;s own baseline; <span className="ts-worse">bold</span> when it&apos;s a 10%+ move in the unhealthy direction</li>
          <li><strong>Ring</strong> = how much to trust the reading (fills to the score out of 100)</li>
        </ul>
      </div>

      <div className="ts-scroll">
        <table className="table trust-table">
          <thead>
            <tr>
              <th className="tiny">Metric</th>
              {dates.map((d) => (
                <th key={d} className="tiny ts-day">
                  <span className="ts-dow">{fmtDate(d, { weekday: "short" })}</span>
                  <span className="muted">{fmtDate(d, { month: "short", day: "numeric" })}</span>
                </th>
              ))}
              <th className="tiny ts-base-h">Baseline<br /><span className="muted">usual level</span></th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m}>
                <th scope="row" className="ts-metric">
                  <div className="small strong">{NAME[m]}</div>
                  <div className="tiny muted">{UNIT[m]} · {HINT[m]}</div>
                </th>
                {dates.map((d) => {
                  const r = readings.find((x) => x.date === d && x.metric === m);
                  if (!r) return <td key={d} className="tiny muted ts-cell ts-empty">no data</td>;
                  const dl = delta(m, r.value, baseline[m]);
                  const excluded = r.label === "unverified";
                  return (
                    <td key={d} className={`ts-cell ts-${r.label}`} tabIndex={0}
                      onMouseEnter={show(r)} onMouseLeave={hide} onFocus={show(r)} onBlur={hide}
                      aria-label={`${NAME[m]} ${fmtDate(d, { weekday: "long" })}: ${r.value} ${UNIT[m]}${dl ? `, ${dl.text} vs baseline` : ""}. ${LABEL[r.label]}, trust ${r.trust} of 100. ${r.reasons.join(". ")}`}>
                      <div className={`ts-val mono ${excluded ? "strike" : ""}`}>{r.value}<span className="ts-unit">{UNIT[m]}</span></div>
                      {dl && <div className={`ts-delta ${dl.worse && dl.notable && !excluded ? "ts-worse" : ""}`}>{dl.text}</div>}
                      <div className="ts-trust">
                        <TrustRing r={r} size={22} />
                        <span className="tiny"><span className="mono strong">{r.trust}</span><span className="muted">/100</span></span>
                      </div>
                    </td>
                  );
                })}
                <td className="ts-base">
                  <div className="ts-val mono">{baseline[m] ?? "–"}<span className="ts-unit">{UNIT[m]}</span></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ts-legend tiny">
        {(["trusted", "caution", "unverified"] as TrustLabel[]).map((l) => (
          <span key={l} className="row" style={{ gap: 6 }}>
            <TrustRing r={{ trust: l === "trusted" ? 90 : l === "caution" ? 62 : 35, label: l }} size={18} />
            <span><strong>{LABEL[l]}</strong> <span className="muted">{l === "trusted" ? "trust 75+" : l === "caution" ? "trust 50–74" : "trust under 50, left out of the analysis"}</span></span>
          </span>
        ))}
        <span className="muted">Hover or tab to a night for why.</span>
      </div>
      {t && (
        <div className="ts-tip" role="tooltip" style={{ left: tip.x, top: tip.y, transform: `translate(-50%, ${tip.above ? "-100%" : "0"})` }}>
          <div className="ts-tip-h">{NAME[t.metric]} · {fmtDate(t.date, { weekday: "long", month: "short", day: "numeric" })}</div>
          <div className="ts-tip-row"><span>Reading</span><span className="mono strong">{t.value} {UNIT[t.metric]}</span></div>
          {baseline[t.metric] != null && <div className="ts-tip-row"><span>Baseline</span><span className="mono">{baseline[t.metric]} {UNIT[t.metric]}</span></div>}
          {td && <div className="ts-tip-row"><span>Change</span><span className="mono">{td.text} ({td.worse ? "worse" : "better or flat"})</span></div>}
          <div className="ts-tip-row"><span>Trust</span><span className="mono strong">{t.trust}/100 · {LABEL[t.label]}</span></div>
          <div className="ts-tip-row"><span>Watch worn</span><span className="mono">{t.wear_h} h</span></div>
          <div className="ts-tip-row"><span>Motion</span><span className="mono">{t.motion_pct}%</span></div>
          <ul className="ts-tip-why">{t.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

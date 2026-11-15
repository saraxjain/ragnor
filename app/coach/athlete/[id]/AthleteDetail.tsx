"use client";
import Link from "next/link";
import { useApi, ErrorBanner, LoadingCard, BandChip, Avatar, prettyArea, fmtDate, timeAgo } from "@/components/ui.tsx";
import { TrendChart } from "@/components/charts.tsx";
import { IconBack, IconWave, IconHeart, IconMoon, IconVideo, IconWatch } from "@/components/icons.tsx";
import type { Athlete, Alert, AuditEntry } from "@/lib/store.ts";
import type { WearableComparison } from "@/shared/lib/index.ts";
import type { ModelScore } from "@/lib/risk.ts";
import { useState } from "react";
import { RiskPanel, RiskBadge } from "@/components/RiskPanel.tsx";
import { CaseReview } from "@/components/CaseReview.tsx";

interface Resp {
  athlete: Athlete;
  wearable_compare: WearableComparison | null;
  alerts: Alert[];
  audit: AuditEntry[];
  model: ModelScore;
}

const TABS = [["overview","Overview"],["risk","Injury risk estimate"],["case","AI case review"],["audit","History"]] as const;
type Tab = typeof TABS[number][0];

const LABEL: Record<string, string> = {
  R1_sleep_load: "Sleep + load",
  R2_load_spike: "Load spike",
  R3_persistent_soreness: "Soreness",
  R4_severe_soreness: "Severe soreness",
  R5_wearable_below_baseline: "Wearable",
  R6_landing: "Landing screen",
  R8_red_flag: "Emergency sign",
};

export function AthleteDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<Resp>(`/api/athletes/${id}`);
  const [tab, setTab] = useState<Tab>("overview");
  const a = data?.athlete;

  const days = a ? [...a.wearable.baseline_days.slice(-9), ...a.wearable.recent] : [];

  return (
    <div className="page">
      <div className="container stack" style={{ "--gap": "20px" } as React.CSSProperties}>
        <Link href="/coach" className="row small" style={{ gap: 4 }}><IconBack size={16} /> Back to coach view</Link>
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading && !a && <><LoadingCard lines={2} /><LoadingCard lines={6} /></>}

        {a && (
          <>
            <header className="card row spread wrap">
              <div className="row">
                <Avatar name={a.name} size={56} />
                <div>
                  <h2>{a.name}</h2>
                  <div className="small muted">{a.sport} · Grade {a.grade} · <IconWatch size={13} className="inline-icon" /> {a.device === "none" ? "No watch" : `${a.device} (${a.wearable.source === "google_health" ? "Google Health API" : "sample data"})`}</div>
                </div>
              </div>
              <div className="row wrap">
                <BandChip band={a.risk_today.band} />
                {data?.model && <RiskBadge m={data.model} />}
                <Link className="btn btn-tonal btn-sm" href={`/athlete?id=${a.id}`}>Athlete's view</Link>
              </div>
            </header>

            <nav className="tabs" role="tablist" aria-label="Case file">
              {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "tab active" : "tab"} onClick={() => setTab(k)}>{l}</button>)}
            </nav>

            {tab === "risk" && data?.model && <RiskPanel m={data.model} name={a.name} />}
            {tab === "case" && <CaseReview id={a.id} name={a.name} />}

            {tab === "overview" && <>
            <section className="card" aria-labelledby="why">
              <div className="card-header">
                <h3 id="why">Why {a.name.split(" ")[0]} is {a.risk_today.band === "low" ? "low risk" : "flagged"} today</h3>
                <span className="mono muted">rules {a.risk_today.rules_version}</span>
              </div>
              {a.risk_today.flags.length === 0 && <p className="small muted">No rule fired from today's data.</p>}
              <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                {a.risk_today.flags.map((f) => (
                  <div key={f.rule_id + (f.area ?? "")} className="row" style={{ alignItems: "flex-start", background: "var(--surface-1)", borderRadius: 14, padding: "12px 14px" }}>
                    <span className={`band band-${f.band}`} style={{ flex: "none" }}>{LABEL[f.rule_id] ?? f.rule_id}</span>
                    <span className="small" style={{ flex: 1 }}>{f.reason}</span>
                    <span className="mono muted">{f.rule_id.split("_")[0]}</span>
                  </div>
                ))}
              </div>
              {a.risk_today.low_confidence && <p className="tiny muted mt-8">Low confidence: today's check-in or wearable data is missing.</p>}
            </section>

            <section aria-labelledby="trends">
              <div className="section-title" style={{ marginTop: 4 }}>
                <h3 id="trends">Last 16 days vs {a.name.split(" ")[0]}'s normal</h3>
                {data?.wearable_compare?.below_baseline && <span className="band band-moderate">Not back to baseline</span>}
              </div>
              <div className="grid grid-3">
                <ChartCard icon={<IconWave size={18} />} color="var(--hrv)" title="Overnight HRV" sub={data?.wearable_compare?.hrv_pct_vs_baseline != null ? `${data.wearable_compare.hrv_pct_vs_baseline}% vs normal (3-night avg)` : ""}>
                  <TrendChart label="Overnight HRV" points={days.map((d) => ({ date: d.date, value: d.hrv_ms }))} baseline={a.wearable.baseline.hrv_ms} tolerance={(a.wearable.baseline.hrv_ms ?? 0) * 0.15} color="#7e57c2" unit="ms" />
                </ChartCard>
                <ChartCard icon={<IconHeart size={18} />} color="var(--rhr)" title="Resting heart rate" sub={data?.wearable_compare?.rhr_delta_bpm != null ? `${data.wearable_compare.rhr_delta_bpm > 0 ? "+" : ""}${data.wearable_compare.rhr_delta_bpm} bpm vs normal` : ""}>
                  <TrendChart label="Resting heart rate" points={days.map((d) => ({ date: d.date, value: d.rhr_bpm }))} baseline={a.wearable.baseline.rhr_bpm} tolerance={5} color="#e8453c" unit="bpm" lowerIsWorse={false} />
                </ChartCard>
                <ChartCard icon={<IconMoon size={18} />} color="var(--sleep)" title="Sleep" sub={data?.wearable_compare?.sleep_h_avg_3d != null ? `${data.wearable_compare.sleep_h_avg_3d} h avg, last 3 nights` : ""}>
                  <TrendChart label="Sleep hours" points={days.map((d) => ({ date: d.date, value: d.sleep_h }))} baseline={a.wearable.baseline.sleep_h} tolerance={1.2} color="#3f6fd8" unit="h" />
                </ChartCard>
              </div>
              <p className="tiny muted mt-8">Green band = this athlete's own normal from preseason nights. HRV can show the body isn't back to baseline, but it can't detect a concussion; Ragnor never uses it that way.</p>
            </section>

            <div className="grid grid-2" style={{ alignItems: "start" }}>
              <div className="stack" style={{ "--gap": "20px" } as React.CSSProperties}>
                <section className="card" aria-labelledby="ld">
                  <div className="card-header">
                    <h3 id="ld" className="row" style={{ gap: 8 }}><IconVideo size={18} /> Landing screen</h3>
                    {a.landing && <BandChip band={a.landing.score.band} label={`${a.landing.score.score} errors`} />}
                  </div>
                  {a.landing ? (
                    <>
                      <p className="small">{a.landing.result.summary}</p>
                      <ul className="small muted" style={{ paddingLeft: 18, marginBottom: 0 }}>
                        {a.landing.result.items.filter((i) => i.present && i.confidence >= 0.5).map((i) => <li key={i.id}>{i.plain_language} <span className="mono">({i.timestamp_s}s)</span></li>)}
                      </ul>
                      <p className="tiny muted mt-8">Screened {fmtDate(a.landing.video_date)} · LESS-style screen</p>
                    </>
                  ) : <p className="small muted">No landing screen yet.</p>}
                </section>

                <section className="card" aria-labelledby="ci">
                  <h3 id="ci" style={{ marginBottom: 10 }}>Recent check-ins</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table className="table">
                      <thead><tr><th>Date</th><th>Sleep</th><th>Load</th><th>Sore</th></tr></thead>
                      <tbody>
                        {[...a.checkins].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6).map((c) => (
                          <tr key={c.date}>
                            <td>{fmtDate(c.date)}</td>
                            <td style={{ color: c.sleep_h != null && c.sleep_h < 6 ? "var(--high)" : undefined }}>{c.sleep_h ?? "—"} h</td>
                            <td>{c.load_min ?? "—"} min</td>
                            <td>{c.soreness.map((s) => `${prettyArea(s.area)} ${s.level}`).join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>

            </>}

            {tab === "audit" && <section className="card flat" aria-labelledby="audit">
              <div className="card-header">
                <h3 id="audit">Audit log</h3>
                <span className="small muted">Every flag and decision is recorded</span>
              </div>
              <div className="list">
                {data!.audit.map((e) => (
                  <div key={e.id} className="list-item" style={{ alignItems: "flex-start" }}>
                    <span className="mono muted" style={{ width: 90, flex: "none" }}>{timeAgo(e.ts)}</span>
                    <span className="pill" style={{ flex: "none" }}>{e.actor}</span>
                    <span className="small" style={{ flex: 1 }}><strong>{e.action.replaceAll("_", " ")}</strong> · {e.detail}</span>
                  </div>
                ))}
              </div>
            </section>}
          </>
        )}
      </div>
    </div>
  );
}

function ChartCard({ icon, color, title, sub, children }: { icon: React.ReactNode; color: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="row" style={{ gap: 8 }}><span style={{ color }}>{icon}</span><strong className="small">{title}</strong></div>
      <div className="small muted" style={{ minHeight: 20 }}>{sub}</div>
      <div className="mt-8">{children}</div>
    </div>
  );
}

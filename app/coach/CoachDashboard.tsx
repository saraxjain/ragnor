"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi, postJson, ErrorBanner, LoadingCard, BandChip, Avatar, ModePill, useToast, timeAgo, type Band } from "@/components/ui.tsx";
import { IconAlert, IconCheck, IconRefresh, IconSpark, IconChevron, IconUsers, IconShield } from "@/components/icons.tsx";
import type { Alert } from "@/lib/store.ts";
import type { Flag } from "@/shared/lib/index.ts";
import { RiskBadge } from "@/components/RiskPanel.tsx";

interface RosterRow {
  id: string;
  name: string;
  sport: string;
  grade: number;
  device: string;
  band: Band;
  flags: Flag[];
  low_confidence: boolean;
  landing_band: Band | null;
  model: { risk_7d: number; tier: "elevated" | "watch" | "typical"; top_drivers: { label: string }[] };
}

interface StateResp {
  today: string;
  athletes: RosterRow[];
  alerts: Alert[];
  report: { bands: { high: number; moderate: number; low: number } };
  integrations: { gemini: boolean; google_health: boolean; firestore: boolean; model: string };
}

interface Briefing {
  mode: string;
  briefing: { headline: string; athletes: { athlete_id: string; one_liner: string; suggested_action: string; source_url?: string }[] };
}

export function CoachDashboard() {
  const { data, error, loading, reload } = useApi<StateResp>("/api/state");
  const brief = useApi<Briefing>("/api/briefing");
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "flagged">("flagged");

  // Light polling so new alerts show up without a refresh.
  useEffect(() => {
    const t = setInterval(() => void reload(), 8000);
    return () => clearInterval(t);
  }, [reload]);

  const pending = data?.alerts.filter((a) => a.status === "pending_approval") ?? [];
  const decided = data?.alerts.filter((a) => a.status !== "pending_approval").slice(0, 3) ?? [];
  const byId = new Map(data?.athletes.map((a) => [a.id, a]) ?? []);
  const roster = (data?.athletes ?? []).filter((a) => filter === "all" || a.band !== "low");

  async function decide(alert: Alert, decision: "approved" | "dismissed") {
    try {
      await postJson(`/api/alerts/${alert.id}`, { decision, by: "Coach Rivera" });
      toast.show(decision === "approved" ? `Approved. ${alert.recipients_suggested.join(" and ")} will be notified.` : "Alert dismissed and logged.");
      await reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't update the alert");
    }
  }

  async function resetDemo() {
    await postJson("/api/demo/reset", {});
    await Promise.all([reload(), brief.reload()]);
    toast.show("Demo reset to this morning.");
  }

  return (
    <div className="page">
      <div className="container stack" style={{ "--gap": "20px" } as React.CSSProperties}>
        <header className="row spread wrap">
          <div>
            <div className="small muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · Westbrook High (demo)</div>
            <h2>Good morning, Coach</h2>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {data && (
              <>
                <ModePill live={data.integrations.gemini} label={data.integrations.gemini ? "Gemini live" : "Gemini: demo"} />
                <ModePill live={data.integrations.google_health} label={data.integrations.google_health ? "Google Health live" : "Watch data: sample"} />
              </>
            )}
            <button className="btn btn-text btn-sm" onClick={resetDemo}><IconRefresh size={16} /> Reset demo</button>
          </div>
        </header>

        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading && !data && <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <LoadingCard key={i} lines={1} />)}</div>}

        {data && (
          <>
            <section className="grid grid-4" aria-label="Today at a glance">
              <Kpi label="Athletes" value={data.athletes.length} icon={<IconUsers size={18} />} tone="var(--surface-2)" ink="var(--ink-2)" />
              <Kpi label="High priority" value={data.report.bands.high} icon={<IconAlert size={18} />} tone="var(--high-container)" ink="var(--high)" />
              <Kpi label="Moderate" value={data.report.bands.moderate} icon={<IconSpark size={18} />} tone="var(--mod-container)" ink="var(--mod)" />
              <Kpi label="Alerts to review" value={pending.length} icon={<IconShield size={18} />} tone={pending.length ? "var(--primary-container)" : "var(--surface-2)"} ink={pending.length ? "var(--primary)" : "var(--ink-2)"} />
            </section>

            <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.65fr) minmax(0, 1fr)", alignItems: "start" }}>
              <div className="stack" style={{ "--gap": "20px", minWidth: 0 } as React.CSSProperties}>
                <section className="card" aria-labelledby="alerts">
                  <div className="card-header">
                    <h3 id="alerts">Alerts waiting for you</h3>
                    <span className="small muted">Nothing is sent until you approve</span>
                  </div>
                  {pending.length === 0 && <p className="small muted">No alerts right now. When an athlete asks for a check-in, the draft lands here first.</p>}
                  <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
                    {pending.map((al) => {
                      const ath = byId.get(al.athlete_id);
                      return (
                        <article key={al.id} className="card flat" style={{ borderColor: al.urgency === "urgent" ? "var(--high)" : "var(--mod-fill)", borderWidth: 2, animation: "rise .3s ease-out" }}>
                          <div className="row spread wrap">
                            <div className="row">
                              <Avatar name={ath?.name ?? "?"} />
                              <div>
                                <strong>{ath?.name}</strong>
                                <div className="small muted">Athlete asked for a check-in · {timeAgo(al.created_at)}</div>
                              </div>
                            </div>
                            <span className={`band ${al.urgency === "urgent" ? "band-high" : "band-moderate"}`}>{al.urgency === "urgent" ? "Urgent" : al.urgency === "same_day" ? "Same day" : "Routine"}</span>
                          </div>
                          <p className="mt-16">{al.summary}</p>
                          {al.reasons.length > 0 && (
                            <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                              {al.reasons.map((r) => <li key={r}>{r}</li>)}
                            </ul>
                          )}
                          <div className="row wrap mt-16">
                            <button className="btn btn-filled" onClick={() => decide(al, "approved")}><IconCheck size={18} /> Approve: notify {al.recipients_suggested.join(" + ")}</button>
                            <button className="btn btn-outlined" onClick={() => decide(al, "dismissed")}>Dismiss</button>
                            <Link className="btn btn-text" href={`/coach/athlete/${al.athlete_id}`}>Open {ath?.name.split(" ")[0]}</Link>
                          </div>
                        </article>
                      );
                    })}
                    {decided.map((al) => (
                      <div key={al.id} className="row small muted" style={{ gap: 8 }}>
                        {al.status === "approved" ? <IconCheck size={16} /> : <IconAlert size={16} />}
                        {byId.get(al.athlete_id)?.name}: {al.status} by {al.decided_by} {al.decided_at ? timeAgo(al.decided_at) : ""}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="card" aria-labelledby="roster">
                  <div className="card-header">
                    <div className="row" style={{ gap: 10 }}><h3 id="roster">Who to look at today</h3><Link href="/report" className="btn btn-filled btn-sm">Weekly report</Link></div>
                    <div className="row" role="tablist" aria-label="Filter roster" style={{ gap: 4 }}>
                      <button role="tab" aria-selected={filter === "flagged"} className={`btn btn-sm ${filter === "flagged" ? "btn-tonal" : "btn-text"}`} onClick={() => setFilter("flagged")}>Flagged</button>
                      <button role="tab" aria-selected={filter === "all"} className={`btn btn-sm ${filter === "all" ? "btn-tonal" : "btn-text"}`} onClick={() => setFilter("all")}>All {data.athletes.length}</button>
                    </div>
                  </div>
                  <div className="list">
                    {roster.map((a) => (
                      <Link key={a.id} href={`/coach/athlete/${a.id}`} className="list-item link" style={{ color: "inherit", textDecoration: "none" }}>
                        <Avatar name={a.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row wrap" style={{ gap: 8 }}>
                            <strong>{a.name}</strong>
                            <span className="small muted">{a.sport} · Gr {a.grade}</span>
                          </div>
                          <div className="small muted" style={{ marginTop: 2 }}>
                            {a.flags[0] ? a.flags[0].reason : "No concerns from today's data"}
                            {a.flags.length > 1 ? ` · +${a.flags.length - 1} more` : ""}
                          </div>
                        </div>
                        <RiskBadge m={a.model} />
                        <BandChip band={a.band} />
                        <IconChevron size={18} />
                      </Link>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="stack" style={{ "--gap": "20px", minWidth: 0 } as React.CSSProperties}>
                <section className="card primary" aria-labelledby="brief">
                  <div className="card-header" style={{ marginBottom: 8 }}>
                    <h3 id="brief" className="row" style={{ gap: 8 }}><IconSpark size={18} /> Morning briefing</h3>
                    {brief.data && <span className="pill" style={{ background: "rgba(255,255,255,.6)" }}>{brief.data.mode === "gemini" ? "Gemini" : "Rules"}</span>}
                  </div>
                  {brief.loading && !brief.data && <div className="stack"><div className="skeleton" style={{ height: 14 }} /><div className="skeleton" style={{ height: 14, width: "80%" }} /></div>}
                  {brief.data && (
                    <>
                      <p className="strong">{brief.data.briefing.headline}</p>
                      <ul style={{ margin: "10px 0 0", paddingLeft: 18 }} className="stack small">
                        {brief.data.briefing.athletes.slice(0, 5).map((b) => (
                          <li key={b.athlete_id}>
                            {b.one_liner} <span style={{ opacity: 0.8 }}>→ {b.suggested_action}</span>
                            {b.source_url ? <> <a href={b.source_url} target="_blank" rel="noreferrer">source</a></> : null}
                          </li>
                        ))}
                      </ul>
                      <button className="btn btn-text btn-sm mt-8" onClick={brief.reload}><IconRefresh size={14} /> Refresh</button>
                    </>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
      {toast.node}
      <style>{`@media (max-width: 960px){ .page .grid[style*="1.65fr"]{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function Kpi({ label, value, icon, tone, ink }: { label: string; value: number; icon: React.ReactNode; tone: string; ink: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row spread">
        <span className="small muted strong">{label}</span>
        <span className="icon-bubble" style={{ background: tone, color: ink }}>{icon}</span>
      </div>
      <div className="metric-value mt-8">{value}</div>
    </div>
  );
}

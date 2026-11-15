"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi, postJson, ErrorBanner, LoadingCard, BandChip, Avatar, useToast, timeAgo, type Band } from "@/components/ui.tsx";
import { IconAlert, IconCheck, IconRefresh, IconSpark, IconChevron, IconShield } from "@/components/icons.tsx";
import type { Alert } from "@/lib/store.ts";
import type { Flag } from "@/shared/lib/index.ts";

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
  const needAttention = (data?.athletes ?? []).filter((a) => a.band !== "low");
  const roster = filter === "all" ? data?.athletes ?? [] : needAttention;
  const tip = new Map(brief.data?.briefing.athletes.map((b) => [b.athlete_id, b]) ?? []);

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
    toast.show("Sample data reset to this morning.");
  }

  return (
    <div className="page">
      <div className="container stack" style={{ "--gap": "20px" } as React.CSSProperties}>
        <header>
          <div className="small muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · Westbrook High</div>
          <div className="row spread wrap" style={{ gap: 12 }}>
            <h2>Good morning, Coach</h2>
            <Link href="/report" className="btn btn-outlined btn-sm">Season report: 14-day view of every athlete</Link>
          </div>
          {data && (
            <p className="muted" style={{ marginTop: 6, fontSize: 17 }}>
              {needAttention.length === 0
                ? "Nobody needs attention today."
                : <><strong style={{ color: "var(--ink)" }}>{needAttention.length} of {data.athletes.length} athletes</strong> need a look today{pending.length ? <>, and <strong style={{ color: "var(--ink)" }}>{pending.length} alert{pending.length === 1 ? "" : "s"}</strong> {pending.length === 1 ? "is" : "are"} waiting for your OK</> : null}.</>}
            </p>
          )}
        </header>

        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading && !data && <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <LoadingCard key={i} lines={1} />)}</div>}

        {data && (
          <>
            <section className="grid grid-3" aria-label="Today at a glance">
              <Kpi label="Talk to today" hint="High risk" value={data.report.bands.high} icon={<IconAlert size={18} />} tone="var(--high-container)" ink="var(--high)" />
              <Kpi label="Keep an eye on" hint="Moderate risk" value={data.report.bands.moderate} icon={<IconSpark size={18} />} tone="var(--mod-container)" ink="var(--mod)" />
              <Kpi label="Alerts waiting for your OK" hint="Nothing is sent until you approve" value={pending.length} icon={<IconShield size={18} />} tone={pending.length ? "var(--primary-container)" : "var(--surface-2)"} ink={pending.length ? "var(--primary)" : "var(--ink-2)"} />
            </section>

              <div className="stack" style={{ "--gap": "20px", minWidth: 0 } as React.CSSProperties}>
                {(pending.length > 0 || decided.length > 0) && <section className="card" aria-labelledby="alerts">
                  <div className="card-header">
                    <h3 id="alerts">Alerts waiting for your OK</h3>
                    <span className="small muted">Nothing is sent until you approve</span>
                  </div>
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
                </section>}

                <section className="card" aria-labelledby="roster">
                  <div className="card-header">
                    <h3 id="roster">{filter === "flagged" ? "Who to look at today" : "Everyone"}</h3>
                    <div className="row" role="tablist" aria-label="Filter roster" style={{ gap: 4 }}>
                      <button role="tab" aria-selected={filter === "flagged"} className={`btn btn-sm ${filter === "flagged" ? "btn-tonal" : "btn-text"}`} onClick={() => setFilter("flagged")}>Needs a look ({needAttention.length})</button>
                      <button role="tab" aria-selected={filter === "all"} className={`btn btn-sm ${filter === "all" ? "btn-tonal" : "btn-text"}`} onClick={() => setFilter("all")}>Everyone ({data.athletes.length})</button>
                    </div>
                  </div>
                  <div className="list">
                    {roster.length === 0 && <p className="small muted">Nobody is flagged today.</p>}
                    {roster.map((a) => (
                      <Link key={a.id} href={`/coach/athlete/${a.id}`} className="list-item link" style={{ color: "inherit", textDecoration: "none" }}>
                        <Avatar name={a.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row wrap" style={{ gap: 8 }}>
                            <strong>{a.name}</strong>
                            <span className="small muted">{a.sport} · Gr {a.grade}</span>
                          </div>
                          <div className="small" style={{ marginTop: 2, color: "var(--ink-2)" }}>
                            {a.flags[0] ? a.flags[0].reason : "No concerns from today's data"}
                            {a.flags.length > 1 ? ` · ${a.flags.length - 1} more reason${a.flags.length === 2 ? "" : "s"}` : ""}
                          </div>
                          {a.band !== "low" && tip.get(a.id) && <div className="small" style={{ marginTop: 4 }}><strong>What to do:</strong> {tip.get(a.id)!.suggested_action}</div>}
                        </div>
                        <BandChip band={a.band} />
                        <IconChevron size={18} />
                      </Link>
                    ))}
                  </div>
                </section>
              </div>

            <div className="row spread wrap small muted">
              <span>{brief.data ? (brief.data.mode === "gemini" ? "\"What to do\" suggestions are written by Gemini from the flags; the risk levels come from fixed rules." : "\"What to do\" suggestions and risk levels come from fixed rules.") : ""} Sample school and athletes.</span>
              <button className="btn btn-text btn-sm" onClick={resetDemo}><IconRefresh size={16} /> Reset sample data</button>
            </div>
          </>
        )}
      </div>
      {toast.node}
    </div>
  );
}

function Kpi({ label, hint, value, icon, tone, ink }: { label: string; hint: string; value: number; icon: React.ReactNode; tone: string; ink: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row spread">
        <span className="small muted strong">{label}</span>
        <span className="icon-bubble" style={{ background: tone, color: ink }}>{icon}</span>
      </div>
      <div className="metric-value mt-8">{value}</div>
      <div className="tiny muted">{hint}</div>
    </div>
  );
}

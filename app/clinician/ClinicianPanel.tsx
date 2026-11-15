"use client";
import Link from "next/link";
import { useApi, ErrorBanner, LoadingCard, Avatar } from "@/components/ui.tsx";
import { IconChevron } from "@/components/icons.tsx";
import type { Group } from "@/app/api/clinician/route.ts";

interface Row { id: string; name: string; sport: string; grade: number; device: string; pct_usable: number; unverified: number; risk_raw: number; risk_trusted: number; false_alarm: boolean; group: Group; reasons: string[]; brief: { headline: string; discuss: number; signed: boolean } | null }
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const GROUPS: { id: Group; title: string; blurb: string; empty: string; fg: string; bg: string }[] = [
  { id: "now", title: "Needs care now", blurb: "Severe symptoms, a red flag, or a high-risk rule fired today. See these players first.", empty: "No one needs urgent care today.", fg: "var(--high)", bg: "var(--high-container)" },
  { id: "soon", title: "Review soon", blurb: "Something is trending the wrong way. Worth a look before their next session.", empty: "No one is flagged for review.", fg: "var(--mod)", bg: "var(--mod-container)" },
  { id: "data", title: "Can't assess: data unusable", blurb: "Too few trustworthy wearable readings to judge. Follow up on device wear.", empty: "Every player has enough usable data.", fg: "var(--ink-2)", bg: "var(--surface-2)" },
  { id: "clear", title: "All clear", blurb: "Nothing concerning in this week's data.", empty: "No players are all clear.", fg: "var(--low)", bg: "var(--low-container)" },
];

export function ClinicianPanel() {
  const { data, error } = useApi<{ patients: Row[] }>("/api/clinician");
  const p = data?.patients ?? [];
  const alarms = p.filter((x) => x.false_alarm).length;
  const byGroup = (g: Group) => p.filter((x) => x.group === g);
  const attention = byGroup("now").length + byGroup("soon").length;
  return (
    <div className="page"><div className="container stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <header>
        <div className="eyebrow">Clinician view · Westbrook Sports Medicine (demo)</div>
        <h1 style={{ margin: "4px 0" }}>Patients sharing wearable data</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 760 }}>Every reading is trust-scored before you see it. Open a patient for the pre-visit brief: what changed, how sure we are, and what you could do about it. Nothing reaches the chart until you sign.</p>
      </header>
      {error && <ErrorBanner message={error} />}
      {!data ? <LoadingCard lines={6} /> : (
        <>
          <div>
            <div className="small" style={{ marginBottom: 10 }}>
              <strong>{attention} of {p.length}</strong> players need attention today.
              {alarms > 0 && <span className="muted"> {alarms} false alarm{alarms > 1 ? "s" : ""} from bad readings filtered out.</span>}
            </div>
            <div className="grid grid-4">
              {GROUPS.map((g) => (
                <a key={g.id} href={`#group-${g.id}`} className="card" style={{ borderTop: `4px solid ${g.fg}`, textDecoration: "none", color: "inherit" }}>
                  <div className="small strong" style={{ color: g.fg }}>{g.title}</div>
                  <div className="kpi">{byGroup(g.id).length}</div>
                  <div className="tiny muted">player{byGroup(g.id).length === 1 ? "" : "s"}</div>
                </a>
              ))}
            </div>
          </div>

          {GROUPS.map((g) => {
            const rows = byGroup(g.id);
            return (
              <section key={g.id} id={`group-${g.id}`} className="card" style={{ padding: 0, overflow: "hidden", scrollMarginTop: 80 }}>
                <div className="row" style={{ gap: 12, padding: "14px 20px", background: g.bg, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, color: g.fg }}>{g.title} <span className="mono" style={{ fontWeight: 600 }}>· {rows.length}</span></h3>
                    <div className="tiny" style={{ color: "var(--ink-2)" }}>{g.blurb}</div>
                  </div>
                </div>
                {rows.length === 0 ? (
                  <div className="small muted" style={{ padding: "14px 20px" }}>{g.empty}</div>
                ) : (
                  <div className="list">
                    {rows.map((x) => (
                      <Link key={x.id} href={`/clinician/patient/${x.id}`} className="list-item" style={{ padding: "14px 20px", alignItems: "flex-start" }}>
                        <Avatar name={x.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="strong">{x.name}</div>
                          <div className="tiny muted">{x.sport} · Grade {x.grade} · {x.device}</div>
                          {x.reasons.length > 0 && (
                            <ul className="tiny" style={{ margin: "4px 0 0", paddingLeft: 16, color: g.id === "clear" ? undefined : "var(--ink)" }}>
                              {x.reasons.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                          )}
                          {x.brief && <div className="tiny" style={{ color: "var(--primary)", marginTop: 4 }}>{x.brief.signed ? "✓ Signed · " : ""}{x.brief.headline}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="small"><span className="mono strong">{pct(x.risk_trusted)}</span> <span className="tiny muted">7-day risk</span></div>
                          {x.false_alarm && <div className="tiny" style={{ color: "var(--mod)" }}>raw data said {pct(x.risk_raw)}</div>}
                          <div className="tiny" style={{ color: x.pct_usable < 90 ? "var(--mod)" : "var(--ink-3)" }}>{x.pct_usable}% of readings usable</div>
                        </div>
                        <IconChevron size={18} />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <p className="tiny muted">Groups come from today&apos;s check-in rules, red flags and the trusted-data risk model. They set the order to review in; they are not a diagnosis. All patients are fictional demo athletes with sample wearable data.</p>
        </>
      )}
    </div></div>
  );
}

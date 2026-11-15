"use client";
import Link from "next/link";
import { useApi, ErrorBanner, LoadingCard, Avatar } from "@/components/ui.tsx";
import { IconChevron } from "@/components/icons.tsx";

interface Row { id: string; name: string; sport: string; grade: number; device: string; pct_usable: number; unverified: number; risk_raw: number; risk_trusted: number; false_alarm: boolean; brief: { headline: string; discuss: number; signed: boolean } | null }
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function ClinicianPanel() {
  const { data, error } = useApi<{ patients: Row[] }>("/api/clinician");
  const p = data?.patients ?? [];
  const alarms = p.filter((x) => x.false_alarm).length;
  const lowData = p.filter((x) => x.pct_usable < 90).length;
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
          <div className="grid grid-3">
            <section className="card"><div className="small muted">Patients sharing data</div><div className="kpi">{p.length}</div></section>
            <section className="card"><div className="small muted">False alarms filtered this week</div><div className="kpi">{alarms}</div><div className="tiny muted">risk looked high only because of bad readings</div></section>
            <section className="card"><div className="small muted">Need better wear</div><div className="kpi">{lowData}</div><div className="tiny muted">under 90% of readings usable</div></section>
          </div>
          <section className="card" style={{ padding: 0 }}>
            <div className="list">
              {p.map((x) => (
                <Link key={x.id} href={`/clinician/patient/${x.id}`} className="list-item" style={{ padding: "14px 20px" }}>
                  <Avatar name={x.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong">{x.name}</div>
                    <div className="tiny muted">{x.sport} · Grade {x.grade} · {x.device}</div>
                    {x.brief && <div className="tiny" style={{ color: "var(--primary)" }}>{x.brief.signed ? "✓ Signed · " : ""}{x.brief.headline}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="small"><span className="mono strong">{pct(x.risk_trusted)}</span> <span className="tiny muted">7-day risk</span></div>
                    {x.false_alarm && <div className="tiny" style={{ color: "var(--mod)" }}>raw data said {pct(x.risk_raw)}</div>}
                    <div className="tiny muted">{x.pct_usable}% of readings usable</div>
                  </div>
                  <IconChevron size={18} />
                </Link>
              ))}
            </div>
          </section>
          <p className="tiny muted">All patients are fictional demo athletes with sample wearable data.</p>
        </>
      )}
    </div></div>
  );
}

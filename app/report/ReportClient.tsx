"use client";
import { useApi, ErrorBanner, LoadingCard } from "@/components/ui.tsx";
import { Ring } from "@/components/charts.tsx";
import { LogoMark } from "@/components/Logo.tsx";
import { IconReport, IconPhone, IconVideo, IconShield, IconClock, IconUsers } from "@/components/icons.tsx";

interface Report {
  season: string;
  school: string;
  athletes_enrolled: number;
  landing_screens_completed: number;
  athletes_flagged_for_landing_work: number;
  hits_followed_up: number;
  hitwatch_calls_completed: number;
  alerts_drafted: number;
  alerts_approved_by_staff: number;
  avg_checkin_completion_pct: number;
  est_staff_hours_saved: number;
  pilot_signups: number;
  bands: { high: number; moderate: number; low: number };
  note: string;
}

export function ReportClient() {
  const { data, error, loading, reload } = useApi<{ report: Report }>("/api/state");
  const r = data?.report;
  return (
    <div className="page">
      <div className="container stack" style={{ "--gap": "20px", maxWidth: 980 } as React.CSSProperties}>
        <header className="row spread wrap">
          <div className="row">
            <LogoMark size={40} />
            <div>
              <div className="small muted">Season report for athletic directors</div>
              <h2>{r?.school ?? "Season report"}</h2>
            </div>
          </div>
          <div className="row no-print">
            <button className="btn btn-outlined" onClick={() => window.print()}><IconReport size={18} /> Print / save PDF</button>
          </div>
        </header>
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading && !r && <LoadingCard lines={6} />}
        {r && (
          <>
            <section className="card">
              <div className="grid" style={{ gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "center" }}>
                <Ring value={r.avg_checkin_completion_pct} label={`Check-in completion ${r.avg_checkin_completion_pct}%`} size={150}>
                  <div><div className="metric-value">{r.avg_checkin_completion_pct}%</div><div className="tiny muted">check-ins done</div></div>
                </Ring>
                <div>
                  <span className="eyebrow">{r.season}</span>
                  <h3 className="mt-8">Ragnor followed up on every hit and screened every athlete this season.</h3>
                  <p className="small muted mt-8">The follow-through an athletic trainer would provide, documented for your records. Every number below links back to an audit trail.</p>
                </div>
              </div>
            </section>
            <section className="grid grid-3">
              <Stat icon={<IconUsers size={18} />} label="Athletes enrolled" value={r.athletes_enrolled} />
              <Stat icon={<IconVideo size={18} />} label="Landing screens" value={r.landing_screens_completed} sub={`${r.athletes_flagged_for_landing_work} given a FixPlan focus`} />
              <Stat icon={<IconPhone size={18} />} label="Hits followed up" value={r.hits_followed_up} sub={`${r.hitwatch_calls_completed} HitWatch calls completed`} />
              <Stat icon={<IconShield size={18} />} label="Alerts to staff" value={r.alerts_drafted} sub={`${r.alerts_approved_by_staff} approved and sent`} />
              <Stat icon={<IconClock size={18} />} label="Staff hours saved (est.)" value={r.est_staff_hours_saved} sub="vs manual check-ins and screens" />
              <Stat icon={<IconReport size={18} />} label="Today's risk mix" value={`${r.bands.high} / ${r.bands.moderate} / ${r.bands.low}`} sub="high / moderate / low" />
            </section>
            <section className="card flat">
              <h3>What this means for your program</h3>
              <ul className="check-list">
                <li>Every reported or sensor-detected hit got 7 days of documented follow-up, which supports your state's youth concussion protocol.</li>
                <li>Athletes with risky landing mechanics got a targeted warm-up and a re-screen date.</li>
                <li>No alert reached a parent or clinician without a staff member approving it.</li>
                <li>Ragnor never made a diagnosis or a return-to-play decision; those stayed with licensed clinicians.</li>
              </ul>
              <p className="tiny muted mt-16">{r.note} Demo school and data are fictional.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="card">
      <div className="row small muted strong" style={{ gap: 8 }}><span style={{ color: "var(--teal-ink)" }}>{icon}</span>{label}</div>
      <div className="metric-value mt-8">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

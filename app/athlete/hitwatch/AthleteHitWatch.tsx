"use client";
import { AthleteNav, AthletePicker } from "@/components/AthleteShell.tsx";
import { HitWatchCall } from "@/components/HitWatchCall.tsx";
import { useApi, ErrorBanner, LoadingCard, fmtDate } from "@/components/ui.tsx";
import { SymptomBars } from "@/components/charts.tsx";
import { IconPhone, IconShield } from "@/components/icons.tsx";
import type { Athlete } from "@/lib/store.ts";

export function AthleteHitWatch({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<{ athlete: Athlete }>(`/api/athletes/${id}`);
  const a = data?.athlete;
  const hw = a?.hitwatch;
  const base = hw ? Object.values(hw.baseline_symptoms).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="page">
      <div className="phone-shell stack" style={{ paddingInline: 16 }}>
        <div className="row spread wrap">
          <h2>HitWatch</h2>
          <AthletePicker id={id} />
        </div>
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading && !a && <LoadingCard lines={4} />}

        {a && !hw && (
          <div className="card stack center" style={{ alignItems: "center", paddingBlock: 28 }}>
            <div className="feature-icon" style={{ background: "var(--low-container)", color: "var(--low)" }}><IconShield /></div>
            <h3>No active HitWatch</h3>
            <p className="small muted">If you take a hit to the head, tell us in your check-in or your coach can log it. HitWatch then calls you once a day for a week, because some symptoms show up a day or two later.</p>
          </div>
        )}

        {a && hw && (
          <>
            <section className="card stack">
              <div className="row">
                <span className="icon-bubble" style={{ background: "var(--high-container)", color: "var(--high)", width: 44, height: 44 }}><IconPhone /></span>
                <div>
                  <h3>Following up after your hit</h3>
                  <p className="small muted">{fmtDate(hw.hit_date)} · {hw.hit_description}</p>
                </div>
              </div>
              <SymptomBars baseline={base} days={hw.calls.map((c) => ({ day: c.day, total: Object.values(c.symptoms).reduce((s, v) => s + v, 0), escalated: c.day === Math.max(...hw.calls.map((x) => x.day)) && Boolean(hw.today_decision?.escalate) }))} />
              <p className="tiny muted">Each bar is your total symptom score from that day's call. The dashed line is your preseason normal.</p>
            </section>

            <section className="card stack" aria-labelledby="call">
              <h3 id="call">Today's check-in call</h3>
              <p className="small muted">Ragnor will ask a few quick questions. Answer honestly; nothing you say takes you off the team. A person reviews anything that changes.</p>
              <HitWatchCall athleteId={id} athleteName={a.name} onDone={reload} />
            </section>

            <p className="tiny muted center">If symptoms get worse (repeated vomiting, a headache that keeps getting worse, confusion, slurred speech, weakness), tell an adult and get medical care right away. In an emergency, call 911.</p>
          </>
        )}
      </div>
      <AthleteNav id={id} />
    </div>
  );
}

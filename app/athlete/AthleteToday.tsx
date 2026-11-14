"use client";
import Link from "next/link";
import type { Athlete } from "@/lib/store.ts";
import type { WearableComparison } from "@/shared/lib/index.ts";
import { useApi, ErrorBanner, LoadingCard, BandChip, InfoBanner, prettyArea } from "@/components/ui.tsx";
import { Ring, Sparkline, TrendChart } from "@/components/charts.tsx";
import { BodyMap } from "@/components/BodyMap.tsx";
import { AthleteNav, AthletePicker } from "@/components/AthleteShell.tsx";
import { IconWave, IconHeart, IconMoon, IconMic, IconVideo, IconPhone, IconWatch, IconChevron, IconSpark, IconLock } from "@/components/icons.tsx";

interface Resp {
  athlete: Athlete;
  wearable_compare: WearableComparison | null;
  integrations: { google_health: boolean };
}

const RING = {
  low: { value: 86, color: "var(--low-fill)", title: "Lower risk right now", sub: "Keep doing what you're doing." },
  moderate: { value: 52, color: "var(--mod-fill)", title: "Take it a bit easier", sub: "A few signals are off your normal." },
  high: { value: 22, color: "var(--high)", title: "Check in with your coach today", sub: "Your coach can see why." },
} as const;

const HEALTH_MSG: Record<string, { tone: "success" | "warn" | "info"; text: string }> = {
  synced: { tone: "success", text: "Connected. Your Fitbit / Pixel Watch data is synced and your baseline is updated." },
  not_configured: { tone: "info", text: "Google Health API isn't connected on this demo server yet, so you're seeing sample watch data." },
  denied: { tone: "warn", text: "You didn't grant access, so nothing was synced. You can connect any time." },
  too_little_data: { tone: "warn", text: "Connected, but there isn't enough recent data yet. Wear your watch overnight for a few nights." },
  error: { tone: "warn", text: "Something went wrong syncing your watch. Your existing data is unchanged." },
};

export function AthleteToday({ id, health }: { id: string; health?: string }) {
  const { data, error, loading, reload } = useApi<Resp>(`/api/athletes/${id}`);
  const a = data?.athlete;

  return (
    <div className="page">
      <div className="phone-shell stack" style={{ paddingInline: 16 }}>
        <div className="row spread wrap">
          <div>
            <div className="small muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
            <h2>{a ? `Hi, ${a.name.split(" ")[0]}` : "Today"}</h2>
          </div>
          <AthletePicker id={id} />
        </div>

        {health && HEALTH_MSG[health] && <InfoBanner tone={HEALTH_MSG[health].tone}>{HEALTH_MSG[health].text}</InfoBanner>}
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading && !a && <><LoadingCard lines={4} /><LoadingCard /></>}

        {a && (
          <>
            <section className="card center stack" style={{ alignItems: "center", paddingBlock: 24 }} aria-labelledby="ready">
              <Ring value={RING[a.risk_today.band].value} color={RING[a.risk_today.band].color} label={`Today's status: ${RING[a.risk_today.band].title}`}>
                <div>
                  <BandChip band={a.risk_today.band} />
                  <div className="tiny muted mt-8">{a.sport}</div>
                </div>
              </Ring>
              <div>
                <h3 id="ready">{RING[a.risk_today.band].title}</h3>
                <p className="small muted mt-8">{RING[a.risk_today.band].sub}</p>
              </div>
              {a.risk_today.flags.length > 0 && (
                <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, width: "100%", textAlign: "left", "--gap": "8px" } as React.CSSProperties}>
                  {a.risk_today.flags.slice(0, 3).map((f) => (
                    <li key={f.rule_id + (f.area ?? "")}>
                      <Link href={`/athlete/flag?id=${id}&rule=${f.rule_id}${f.area ? `&area=${f.area}` : ""}`} className="row" style={{ alignItems: "flex-start", gap: 10, background: "var(--surface-1)", borderRadius: 14, padding: "10px 12px", color: "inherit", textDecoration: "none" }}>
                        <span className={`band band-${f.band}`} style={{ height: 22, fontSize: 11, flex: "none" }}>{f.band === "high" ? "High" : f.band === "moderate" ? "Mod" : "Low"}</span>
                        <span className="small" style={{ flex: 1 }}>{f.reason.replace(/^HitWatch: /, "")}</span>
                        <IconChevron size={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {a.risk_today.low_confidence && <p className="tiny muted">Some of today's data is missing, so this is a rough read. A quick check-in helps.</p>}
            </section>

            {a.hitwatch?.status === "active" && (
              <Link href={`/athlete/hitwatch?id=${id}`} className="card" style={{ background: "var(--high-container)", color: "#410e0b", boxShadow: "none", textDecoration: "none" }}>
                <div className="row spread">
                  <div className="row">
                    <span className="icon-bubble" style={{ background: "var(--high)", color: "#fff", width: 40, height: 40 }}><IconPhone size={20} /></span>
                    <div>
                      <strong>HitWatch · next check-in: day {Math.min(7, (a.hitwatch.calls.length ? Math.max(...a.hitwatch.calls.map((c) => c.day)) : -1) + 1)} of 7</strong>
                      <div className="small">Daily check-in calls after your hit {a.hitwatch.hit_description}.</div>
                    </div>
                  </div>
                  <IconChevron />
                </div>
              </Link>
            )}

            <TodayBodyAndLoad a={a} />

            <section aria-labelledby="body">
              <div className="row spread" style={{ margin: "8px 0 10px" }}>
                <h3 id="body">Your body vs your normal</h3>
                <span className="pill teal"><IconWatch size={14} /> {a.device === "none" ? "No watch" : a.device}</span>
              </div>
              {a.wearable.recent.length ? (
                <div className="metrics-3">
                  <Metric icon={<IconWave size={18} />} color="var(--hrv)" label="HRV" unit="ms" values={a.wearable.recent.map((d) => d.hrv_ms)} baseline={a.wearable.baseline.hrv_ms} pct={data?.wearable_compare?.hrv_pct_vs_baseline ?? null} higherIsBetter />
                  <Metric icon={<IconHeart size={18} />} color="var(--rhr)" label="Resting HR" unit="bpm" values={a.wearable.recent.map((d) => d.rhr_bpm)} baseline={a.wearable.baseline.rhr_bpm} delta={data?.wearable_compare?.rhr_delta_bpm ?? null} />
                  <Metric icon={<IconMoon size={18} />} color="var(--sleep)" label="Sleep" unit="h" values={a.wearable.recent.map((d) => d.sleep_h)} baseline={a.wearable.baseline.sleep_h} higherIsBetter />
                </div>
              ) : (
                <div className="card flat small muted">No watch connected yet. Connect one below to build your personal baseline.</div>
              )}
              <Link href={`/coach/athlete/${id}`} className="small" style={{ display: "inline-block", marginTop: 8 }}>See 7-day trends →</Link>
            </section>

            <section className="stack" style={{ "--gap": "10px" } as React.CSSProperties} aria-label="Actions">
              <Link href={`/athlete/checkin?id=${id}`} className="action-tile">
                <span className="icon-bubble" style={{ background: "var(--primary-container)", color: "var(--primary)" }}><IconMic /></span>
                <div style={{ flex: 1 }}><strong>20-second check-in</strong><div className="small muted">Say how you slept, what's sore and how practice went.</div></div>
                <IconChevron />
              </Link>
              <Link href={`/athlete/landing?id=${id}`} className="action-tile">
                <span className="icon-bubble" style={{ background: "var(--teal-container)", color: "var(--teal-ink)" }}><IconVideo /></span>
                <div style={{ flex: 1 }}>
                  <strong>LandingCheck</strong>
                  <div className="small muted">{a.landing ? `Last screen: ${a.landing.score.score} landing errors` : "Film a 10-second drop jump."}</div>
                </div>
                {a.landing && <BandChip band={a.landing.score.band} label={a.landing.score.band === "low" ? "Clean" : a.landing.score.band === "moderate" ? "Work on it" : "Priority"} />}
              </Link>
              {a.landing?.fixplan && (
                <Link href={`/athlete/landing?id=${id}#fixplan`} className="action-tile">
                  <span className="icon-bubble" style={{ background: "#e8def8", color: "#5b3f9a" }}><IconSpark /></span>
                  <div style={{ flex: 1 }}><strong>Your FixPlan</strong><div className="small muted">{a.landing.fixplan.focus}</div></div>
                  <IconChevron />
                </Link>
              )}
            </section>

            <section className="card flat" aria-labelledby="connect">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <span className="icon-bubble" style={{ background: "var(--teal-container)", color: "var(--teal-ink)", width: 40, height: 40 }}><IconWatch /></span>
                <div style={{ flex: 1 }}>
                  <h4 id="connect">{a.wearable.source === "google_health" ? "Fitbit / Pixel Watch connected" : "Connect Fitbit or Pixel Watch"}</h4>
                  <p className="small muted mt-8">Ragnor reads only overnight HRV, resting heart rate and sleep through the Google Health API, to learn your normal. You can disconnect any time.</p>
                  <div className="row wrap mt-16">
                    <a className="btn btn-tonal btn-sm" href={`/api/health/connect?athlete_id=${id}`}>{a.wearable.source === "google_health" ? "Sync again" : "Connect with Google"}</a>
                    {!data?.integrations.google_health && <span className="tiny muted row" style={{ gap: 4 }}><IconLock size={12} /> Demo: using sample watch data</span>}
                  </div>
                </div>
              </div>
            </section>

            <p className="tiny muted center">Ragnor shows signals, not diagnoses. If something feels wrong, tell your coach, a parent or a clinician.</p>
          </>
        )}
      </div>
      <AthleteNav id={id} />
    </div>
  );
}

function TodayBodyAndLoad({ a }: { a: Athlete }) {
  const today = a.checkins.find((c) => c.date === a.risk_today.date);
  const sore: Record<string, number> = Object.fromEntries((today?.soreness ?? []).map((s) => [s.area, s.level]));
  const last7 = [...a.checkins].sort((x, y) => x.date.localeCompare(y.date)).slice(-7);
  const prev = [...a.checkins].sort((x, y) => x.date.localeCompare(y.date)).slice(-14, -7);
  const prevAvg = prev.length ? Math.round(prev.reduce((s, c) => s + (c.load_min ?? 0), 0) / prev.length) : null;
  return (
    <div className="grid grid-2" style={{ "--gap": "10px" } as React.CSSProperties}>
      <section className="card" aria-label="Where it's sore today" style={{ padding: 14 }}>
        <strong className="small">Where it's sore</strong>
        <div className="mt-8"><BodyMap value={sore} /></div>
        {!Object.keys(sore).length && <p className="tiny muted center">Nothing sore logged today.</p>}
      </section>
      <section className="card" aria-label="Training load, 7 days" style={{ padding: 14 }}>
        <strong className="small">Training load, 7 days</strong>
        <div className="mt-8">
          <TrendChart label="Training minutes per day" points={last7.map((c) => ({ date: c.date, value: c.load_min }))} baseline={prevAvg} tolerance={(prevAvg ?? 0) * 0.25} color="#7e3af2" unit="min" lowerIsWorse={false} height={170} />
        </div>
        <p className="tiny muted">Band = last week's typical day.</p>
      </section>
    </div>
  );
}

function Metric({ icon, color, label, unit, values, baseline, pct, delta, higherIsBetter }: { icon: React.ReactNode; color: string; label: string; unit: string; values: (number | null)[]; baseline: number | null; pct?: number | null; delta?: number | null; higherIsBetter?: boolean }) {
  const latest = [...values].reverse().find((v) => v != null) ?? null;
  let deltaText = "";
  let bad = false;
  if (pct != null) { deltaText = `${pct > 0 ? "+" : ""}${Math.round(pct)}% vs normal`; bad = higherIsBetter ? pct <= -15 : pct >= 15; }
  else if (delta != null) { deltaText = `${delta > 0 ? "+" : ""}${delta} vs normal`; bad = delta >= 5; }
  else if (latest != null && baseline != null) { const d = Math.round((latest - baseline) * 10) / 10; deltaText = `${d > 0 ? "+" : ""}${d}${unit} vs normal`; bad = higherIsBetter ? latest < 6 && label === "Sleep" : false; }
  return (
    <div className="card metric-card">
      <div className="metric">
        <div className="metric-label"><span style={{ color }}>{icon}</span>{label}</div>
        <div className="metric-value">{latest ?? "—"}<small>{unit}</small></div>
        <div className={`delta ${bad ? "bad" : "ok"}`}>{deltaText || " "}</div>
        <Sparkline values={values} color={color} width={110} />
      </div>
    </div>
  );
}

export { prettyArea };

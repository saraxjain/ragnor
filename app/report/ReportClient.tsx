"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useApi, ErrorBanner, LoadingCard, BandChip } from "@/components/ui.tsx";
import { LogoMark } from "@/components/Logo.tsx";
import { IconReport } from "@/components/icons.tsx";
import type { AthleteSeason, DayStatus, IssueKey, IssueLevel, SeasonDetail } from "@/lib/seasonDetail.ts";

interface Report {
  season: string;
  school: string;
  landing_screens_completed: number;
  athletes_flagged_for_landing_work: number;
  alerts_drafted: number;
  alerts_approved_by_staff: number;
  est_staff_hours_saved: number;
  note: string;
}

const STATUS_WORD: Record<DayStatus, string> = { high: "High risk", moderate: "Moderate risk", low: "Low risk", missed: "No check-in", none: "Not enrolled yet" };
const STATUS_MARK: Record<DayStatus, string> = { high: "!", moderate: "", low: "", missed: "–", none: "" };
const TREND: Record<AthleteSeason["trend"], { mark: string; word: string; tone: string }> = {
  worse: { mark: "↗", word: "Getting worse", tone: "var(--high)" },
  better: { mark: "↘", word: "Improving", tone: "var(--low)" },
  steady: { mark: "→", word: "Steady", tone: "var(--ink-3)" },
  new: { mark: "•", word: "New, no history", tone: "var(--ink-3)" },
};
const LEVEL_WORD: Record<IssueLevel, string> = { high: "Act today", moderate: "Needs a look", info: "Worth knowing" };
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekday = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" });

export function ReportClient() {
  const { data, error, loading, reload } = useApi<{ report: Report; detail: SeasonDetail }>("/api/report");
  const r = data?.report;
  const d = data?.detail;
  const [sport, setSport] = useState("all");
  const [issue, setIssue] = useState<IssueKey | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => (d?.athletes ?? []).filter((a) =>
    (sport === "all" || a.sport === sport) &&
    (!issue || a.issues.some((i) => i.key === issue)) &&
    (!onlyIssues || a.issues.length > 0)), [d, sport, issue, onlyIssues]);

  const t = d?.team;
  const issueLabel = issue ? t?.issues.find((i) => i.key === issue)?.label : null;

  return (
    <div className="page">
      <div className="container stack" style={{ "--gap": "20px" } as React.CSSProperties}>
        <header className="row spread wrap">
          <div className="row">
            <LogoMark size={40} />
            <div>
              <div className="small muted">Season report{r ? ` · ${r.season}` : ""}</div>
              <h2>{r?.school ?? "Season report"}</h2>
            </div>
          </div>
          <div className="row no-print">
            <button className="btn btn-outlined" onClick={() => window.print()}><IconReport size={18} /> Print / save PDF</button>
          </div>
        </header>
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {loading && !d && <LoadingCard lines={8} />}

        {r && d && t && (
          <>
            {/* 1. The headline */}
            <section className="card">
              <span className="eyebrow">Where the team stands today · {shortDate(d.today)}</span>
              <h3 className="mt-8" style={{ maxWidth: 820 }}>
                {t.need_look === 0 ? `All ${t.roster} athletes look fine today.` : `${t.need_look} of ${t.roster} athletes need a look: ${t.high} to talk to today, ${t.moderate} to keep an eye on.`}
              </h3>
              <div className="rep-tiles mt-16">
                <Tile label="Need a look today" value={`${t.need_look}`} of={`of ${t.roster}`} hint={`${t.high} high risk, ${t.moderate} moderate`} />
                <Tile label="Check-ins done" value={t.checkin_pct_14 == null ? "–" : `${t.checkin_pct_14}%`} hint="over the last 14 days" />
                <Tile label="Average sleep" value={t.sleep_avg_7 == null ? "–" : `${t.sleep_avg_7}`} of="hours" hint={`${t.short_sleepers} athlete${t.short_sleepers === 1 ? "" : "s"} under 6 h on 3+ nights this week`} />
                <Tile label="Alerts sent with staff OK" value={`${r.alerts_approved_by_staff}`} of={`of ${r.alerts_drafted} drafted`} hint="none go out without approval" />
              </div>
            </section>

            {/* 2. Biggest issues */}
            <section className="card">
              <h3>Biggest issues on the team</h3>
              <p className="small muted" style={{ marginTop: 4 }}>How many athletes each problem affects right now. Select one to see only those athletes below.</p>
              {t.issues.length === 0 ? <p className="small mt-16">No issues found in the last 14 days.</p> : (
                <div className="rep-issues mt-16">
                  {t.issues.map((i) => (
                    <button key={i.key} type="button" className="rep-issue" aria-pressed={issue === i.key} onClick={() => { setIssue(issue === i.key ? null : i.key); document.getElementById("rep-athletes")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                      <span className="rep-issue-head">
                        <span className="strong">{i.label}</span>
                        <span className={`rep-level rep-level-${i.level}`}>{LEVEL_WORD[i.level]}</span>
                      </span>
                      <span className="rep-bar-row">
                        <span className="rep-bar-track" aria-hidden="true"><span className={`rep-bar rep-bar-${i.level}`} style={{ width: `${(i.athletes.length / t.roster) * 100}%` }} /></span>
                        <span className="rep-bar-num">{i.athletes.length} <span className="muted">of {t.roster}</span></span>
                      </span>
                      <span className="small muted">{i.athletes.map((a) => a.name).join(", ")}</span>
                      <span className="small"><span className="muted">What helps: </span>{i.action}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Every athlete */}
            <section className="card" id="rep-athletes" style={{ scrollMarginTop: 80 }}>
              <div className="row spread wrap" style={{ gap: 12, alignItems: "flex-end" }}>
                <div>
                  <h3>Every athlete, last 14 days</h3>
                  <p className="small muted" style={{ marginTop: 4 }}>One square per day. Worst first. Select a row for the full picture.</p>
                </div>
                <div className="row wrap no-print" style={{ gap: 10 }}>
                  <select className="select" style={{ width: "auto", padding: "8px 12px" }} value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Filter by sport">
                    <option value="all">All sports</option>
                    {t.sports.map((s) => <option key={s.sport}>{s.sport}</option>)}
                  </select>
                  <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only athletes with issues</label>
                </div>
              </div>
              {issue && <div className="row wrap small mt-8" style={{ gap: 8 }}><span>Showing: <strong>{issueLabel}</strong></span><button className="btn btn-text" style={{ padding: "2px 8px" }} onClick={() => setIssue(null)}>Show everyone</button></div>}
              <Legend />
              <div style={{ overflowX: "auto" }}>
                <table className="table rep-table">
                  <thead>
                    <tr>
                      <th>Athlete</th>
                      <th>Today</th>
                      <th>
                        <div className="rep-days" aria-hidden="true">{d.dates.map((x) => <span key={x} className="rep-daylabel">{weekday(x)}</span>)}</div>
                        <span className="tiny">{shortDate(d.dates[0])} to {shortDate(d.today)}</span>
                      </th>
                      <th>Trend</th>
                      <th>Sleep</th>
                      <th>Check-ins</th>
                      <th>Main issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const tr = TREND[a.trend];
                      const isOpen = open === a.id;
                      return (
                        <Fragment key={a.id}>
                          <tr className={`rep-row ${isOpen ? "open" : ""}`} onClick={() => setOpen(isOpen ? null : a.id)}>
                            <td>
                              <button type="button" className="rep-name" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : a.id); }}>
                                <span className="strong">{a.name}</span>
                                <span className="tiny muted">{a.sport} · Grade {a.grade}</span>
                              </button>
                            </td>
                            <td><BandChip band={a.band} label={a.band === "high" ? "High" : a.band === "moderate" ? "Moderate" : "Low"} /></td>
                            <td><DayStrip a={a} /></td>
                            <td style={{ whiteSpace: "nowrap" }}><span style={{ color: tr.tone, fontWeight: 700 }} aria-hidden="true">{tr.mark}</span> <span className="small">{tr.word}</span></td>
                            <td style={{ whiteSpace: "nowrap" }}>{a.sleep.avg_7 == null ? <span className="muted">–</span> : <><span className="strong">{a.sleep.avg_7} h</span>{a.sleep.short_nights_7 > 0 && <div className="tiny" style={{ color: "var(--high)" }}>{a.sleep.short_nights_7} short night{a.sleep.short_nights_7 === 1 ? "" : "s"}</div>}</>}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{a.checkins.expected_14 === 0 ? <span className="muted">None yet</span> : `${a.checkins.done_14} of ${a.checkins.expected_14}`}</td>
                            <td className="small" style={{ minWidth: 220 }}>
                              {a.issues.length === 0 ? <span className="muted">Nothing to flag</span> : <>{a.issues[0].text}{a.issues.length > 1 && <span className="muted"> · {a.issues.length - 1} more</span>}</>}
                            </td>
                          </tr>
                          {isOpen && <tr className="rep-detail-row"><td colSpan={7}><Detail a={a} /></td></tr>}
                        </Fragment>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={7} className="small muted">No athletes match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4. Team over time + sore spots */}
            <section className="grid grid-2" style={{ alignItems: "start" }}>
              <div className="card">
                <h3>Athletes flagged each day</h3>
                <p className="small muted" style={{ marginTop: 4 }}>How many athletes were at moderate or high risk, day by day.</p>
                <FlaggedByDay days={t.by_day} roster={t.roster} />
              </div>
              <div className="card">
                <h3>Where athletes are sore</h3>
                <p className="small muted" style={{ marginTop: 4 }}>Body areas reported as moderate or severe in the last 14 days.</p>
                {t.sore_spots.length === 0 ? <p className="small mt-16">No moderate or severe soreness reported.</p> : (
                  <div className="stack mt-16" style={{ "--gap": "10px" } as React.CSSProperties}>
                    {t.sore_spots.map((s) => (
                      <div key={s.area} className="rep-bar-row" title={`${s.name}: ${s.days} sore day${s.days === 1 ? "" : "s"} across ${s.athletes} athlete${s.athletes === 1 ? "" : "s"}`}>
                        <span className="small" style={{ width: 130, flex: "none" }}>{s.name}</span>
                        <span className="rep-bar-track" aria-hidden="true"><span className="rep-bar rep-bar-neutral" style={{ width: `${(s.days / Math.max(...t.sore_spots.map((x) => x.days))) * 100}%` }} /></span>
                        <span className="rep-bar-num">{s.days} <span className="muted">day{s.days === 1 ? "" : "s"}, {s.athletes} athlete{s.athletes === 1 ? "" : "s"}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* 5. By sport */}
            <section className="card">
              <h3>By sport</h3>
              <div style={{ overflowX: "auto" }}>
                <table className="table mt-8">
                  <thead><tr><th>Sport</th><th>Athletes</th><th>Need a look today</th><th>Check-ins done</th><th>Average sleep (7 nights)</th></tr></thead>
                  <tbody>
                    {t.sports.map((s) => (
                      <tr key={s.sport}>
                        <td className="strong">{s.sport}</td>
                        <td>{s.athletes}</td>
                        <td>{s.need_look > 0 ? <span className="strong" style={{ color: "var(--high)" }}>{s.need_look}</span> : "0"}</td>
                        <td>{s.checkin_pct == null ? "–" : `${s.checkin_pct}%`}</td>
                        <td>{s.sleep_avg_7 == null ? "–" : `${s.sleep_avg_7} h`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 6. Program record */}
            <section className="card flat">
              <h3>Program record</h3>
              <div className="rep-tiles mt-16">
                <Tile label="Landing screens done" value={`${r.landing_screens_completed}`} hint={`${r.athletes_flagged_for_landing_work} given a FixPlan warm-up`} />
                <Tile label="Alerts drafted for staff" value={`${r.alerts_drafted}`} hint={`${r.alerts_approved_by_staff} approved and sent`} />
                <Tile label="Staff hours saved (estimate)" value={`${r.est_staff_hours_saved}`} hint="vs manual check-ins and screens" />
              </div>
              <ul className="check-list">
                <li>Risk levels come from fixed rules, not from AI. The same inputs always give the same level.</li>
                <li>No alert reached a parent or clinician without a staff member approving it.</li>
                <li>Ragnor never made a diagnosis or a return-to-play decision; those stayed with licensed clinicians.</li>
              </ul>
              <p className="tiny muted mt-16">{r.note} School and data shown are fictional samples. Past days are re-scored from that day&apos;s check-ins, trusted watch readings and landing screen.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, of, hint }: { label: string; value: string; of?: string; hint?: string }) {
  return (
    <div className="rep-tile">
      <div className="small muted">{label}</div>
      <div className="rep-tile-value">{value}{of && <small>{of}</small>}</div>
      {hint && <div className="tiny muted">{hint}</div>}
    </div>
  );
}

function Legend() {
  const items: DayStatus[] = ["high", "moderate", "low", "missed"];
  return (
    <div className="row wrap tiny muted mt-8" style={{ gap: 14 }}>
      {items.map((s) => <span key={s} className="row" style={{ gap: 6 }}><span className={`rep-cell rep-${s}`} aria-hidden="true">{STATUS_MARK[s]}</span>{STATUS_WORD[s]}</span>)}
    </div>
  );
}

function DayStrip({ a }: { a: AthleteSeason }) {
  const flagged = a.days.filter((x) => x.status === "high" || x.status === "moderate").length;
  const missed = a.days.filter((x) => x.status === "missed").length;
  return (
    <div className="rep-days" role="img" aria-label={`${a.name}: flagged on ${flagged} of the last 14 days, ${missed} missed check-ins`}>
      {a.days.map((x) => (
        <span key={x.date} className={`rep-cell rep-${x.status}`} title={`${shortDate(x.date)}: ${STATUS_WORD[x.status]}${x.sleep_h != null ? ` · slept ${x.sleep_h} h` : ""}${x.load_min != null ? ` · ${x.load_min} min practice` : ""}`}>{STATUS_MARK[x.status]}</span>
      ))}
    </div>
  );
}

function Detail({ a }: { a: AthleteSeason }) {
  const w = a.watch;
  return (
    <div className="rep-detail">
      <div>
        <div className="eyebrow">What is going on</div>
        {a.issues.length === 0 ? <p className="small">Nothing to flag. {a.checkins.expected_14 === 0 ? "This profile has no check-ins yet." : "Keep the routine going."}</p> : (
          <ul className="rep-issue-list">
            {a.issues.map((i, n) => <li key={n}><span className={`rep-level rep-level-${i.level}`}>{LEVEL_WORD[i.level]}</span><span className="small">{i.text}</span></li>)}
          </ul>
        )}
        <Link className="btn btn-outlined mt-8 no-print" href={`/coach/athlete/${a.id}`}>Open {a.name.split(" ")[0]}&apos;s page</Link>
      </div>
      <div>
        <div className="eyebrow">Sleep, last 14 nights</div>
        <SleepBars a={a} />
        <div className="small">
          {a.sleep.avg_7 == null ? "No sleep logged this week." : <>Averaging <strong>{a.sleep.avg_7} h</strong> this week{a.sleep.avg_prev_7 != null && <> ({a.sleep.avg_prev_7} h the week before)</>}.</>}
        </div>
      </div>
      <div className="small stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <div className="eyebrow">The rest of the picture</div>
        <Fact k="Practice load">{a.load.this_week === 0 && a.load.last_week === 0 ? "None logged" : <>{a.load.this_week} min this week{a.load.change_pct != null && <> ({a.load.change_pct > 0 ? "up" : a.load.change_pct < 0 ? "down" : "no change"}{a.load.change_pct !== 0 && ` ${Math.abs(a.load.change_pct)}%`} from last week)</>}</>}</Fact>
        <Fact k="Sore areas">{a.sore_areas.length === 0 ? "None moderate or severe" : a.sore_areas.map((s) => `${s.name} (${s.days} day${s.days === 1 ? "" : "s"})`).join(", ")}</Fact>
        <Fact k="Watch">{!w.has_data ? (w.device === "none" ? "No watch" : `${w.device}, no data yet`) : <>
          {w.device}. Heart-rate variability {w.hrv_pct == null ? "not available" : `${w.hrv_pct > 0 ? "+" : ""}${w.hrv_pct}% vs their normal`}{w.rhr_delta != null && `, resting heart rate ${w.rhr_delta > 0 ? "+" : ""}${w.rhr_delta} bpm`}.{w.unreliable_readings > 0 && ` ${w.unreliable_readings} unreliable reading${w.unreliable_readings === 1 ? "" : "s"} left out this week.`}
        </>}</Fact>
        <Fact k="Landing screen">{!a.landing ? "Not done yet" : <>{a.landing.errors} landing error{a.landing.errors === 1 ? "" : "s"} on {shortDate(a.landing.date)}{a.landing.focus && `. Warm-up focus: ${a.landing.focus}`}</>}</Fact>
        <Fact k="Alerts">{a.alerts.pending + a.alerts.approved + a.alerts.dismissed === 0 ? "None" : `${a.alerts.pending} waiting for staff, ${a.alerts.approved} sent, ${a.alerts.dismissed} dismissed`}</Fact>
      </div>
    </div>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return <div><span className="muted">{k}: </span>{children}</div>;
}

/** 14 thin bars of hours slept, with the 6-hour line the rules use. Nights under the line are marked. */
function SleepBars({ a }: { a: AthleteSeason }) {
  const W = 280, H = 96, top = 8, base = H - 16, max = 10;
  const bw = W / a.days.length;
  const y = (h: number) => base - (Math.min(h, max) / max) * (base - top);
  if (a.days.every((x) => x.sleep_h == null)) return <p className="small muted">No sleep logged.</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 320, height: "auto", display: "block", margin: "8px 0" }} role="img" aria-label={`Hours slept each night for ${a.name}`}>
      {a.days.map((x, i) => x.sleep_h == null ? (
        <text key={x.date} x={i * bw + bw / 2} y={base - 4} textAnchor="middle" fontSize="10" fill="var(--ink-3)">–<title>{`${shortDate(x.date)}: not logged`}</title></text>
      ) : (
        <rect key={x.date} x={i * bw + 2} y={y(x.sleep_h)} width={bw - 4} height={base - y(x.sleep_h)} rx="3" fill={x.sleep_h < 6 ? "var(--high)" : "var(--sleep)"} opacity={x.sleep_h < 6 ? 1 : 0.55}>
          <title>{`${shortDate(x.date)}: ${x.sleep_h} h${x.sleep_h < 6 ? " (under 6 h)" : ""}`}</title>
        </rect>
      ))}
      <line x1="0" x2={W} y1={y(6)} y2={y(6)} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={W} y={y(6) - 3} textAnchor="end" fontSize="9.5" fill="var(--ink-3)">6 h</text>
      <line x1="0" x2={W} y1={base} y2={base} stroke="var(--outline-soft)" strokeWidth="1" />
      <text x="0" y={H - 3} fontSize="9.5" fill="var(--ink-3)">{shortDate(a.days[0].date)}</text>
      <text x={W} y={H - 3} textAnchor="end" fontSize="9.5" fill="var(--ink-3)">{shortDate(a.days.at(-1)!.date)}</text>
    </svg>
  );
}

/** Stacked columns: high on the bottom, moderate above, one column per day. One axis (number of athletes). */
function FlaggedByDay({ days, roster }: { days: SeasonDetail["team"]["by_day"]; roster: number }) {
  const W = 520, H = 190, left = 26, top = 14, base = H - 26;
  const max = Math.max(2, ...days.map((x) => x.high + x.moderate));
  const bw = (W - left) / days.length;
  const h = (n: number) => (n / max) * (base - top);
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", marginTop: 12 }} role="img" aria-label={`Athletes flagged each day, out of ${roster}`}>
        {ticks.map((n) => (
          <g key={n}>
            <line x1={left} x2={W} y1={base - h(n)} y2={base - h(n)} stroke="var(--outline-soft)" strokeWidth="1" />
            <text x={left - 6} y={base - h(n) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--ink-3)">{n}</text>
          </g>
        ))}
        {days.map((x, i) => {
          const cx = left + i * bw, w = Math.min(22, bw - 8), x0 = cx + (bw - w) / 2;
          const hh = h(x.high), mh = h(x.moderate), total = x.high + x.moderate;
          return (
            <g key={x.date}>
              <title>{`${shortDate(x.date)}: ${x.high} high, ${x.moderate} moderate, ${x.low} low${x.missed ? `, ${x.missed} did not check in` : ""}`}</title>
              <rect x={cx} y={top} width={bw} height={base - top} fill="transparent" />
              {x.high > 0 && <rect x={x0} y={base - hh} width={w} height={hh} rx="3" fill="var(--high)" />}
              {x.moderate > 0 && <rect x={x0} y={base - hh - mh - (x.high > 0 ? 2 : 0)} width={w} height={mh} rx="3" fill="var(--mod-fill)" />}
              {total > 0 && <text x={x0 + w / 2} y={base - hh - mh - 7} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--ink-2)">{total}</text>}
              {(i % 2 === 1 || i === days.length - 1) && <text x={x0 + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{new Date(`${x.date}T12:00:00`).getDate()}</text>}
            </g>
          );
        })}
      </svg>
      <div className="row wrap tiny muted" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6 }}><span className="rep-swatch" style={{ background: "var(--high)" }} />High risk</span>
        <span className="row" style={{ gap: 6 }}><span className="rep-swatch" style={{ background: "var(--mod-fill)" }} />Moderate risk</span>
        <span>Day of the month along the bottom</span>
      </div>
    </>
  );
}

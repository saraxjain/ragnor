// Season report detail: turns each athlete's last 14 days into things a coach can scan.
// Pure: takes athletes and alerts, returns plain data. Bands always come from the rules engine (shared/lib/rules.ts).
import { dailyRisk, type Band, type Flag } from "../shared/lib/index.ts";
import { trustReport, trustedOnly } from "./trust.ts";
import type { Alert, Athlete } from "./store.ts";

export const REPORT_DAYS = 14;
export const SHORT_SLEEP_H = 6; // same line the rules engine uses

/** "none" = before the athlete had any history (a new profile), so it is not counted as a missed check-in. */
export type DayStatus = Band | "missed" | "none";
export type IssueKey = "red_flag" | "soreness" | "sleep" | "load" | "recovery" | "landing" | "fuel" | "missed" | "watch_fit";
export type IssueLevel = "high" | "moderate" | "info";
export interface Issue { key: IssueKey; level: IssueLevel; text: string }

export const ISSUE_LABEL: Record<IssueKey, string> = {
  red_flag: "Emergency sign reported",
  soreness: "Ongoing or severe soreness",
  sleep: "Short on sleep",
  load: "Training load jumped",
  recovery: "Watch shows poor recovery",
  landing: "Risky landing mechanics",
  fuel: "Under-fuelled on a hard day",
  missed: "Skipping check-ins",
  watch_fit: "Watch not worn properly",
};
export const ISSUE_ACTION: Record<IssueKey, string> = {
  red_flag: "Follow your emergency plan and get a clinician involved today.",
  soreness: "Ask about it before practice; have a trainer or clinician look if it is not easing.",
  sleep: "Talk about bedtime and schedule; consider a lighter session.",
  load: "Hold the load steady this week rather than adding more.",
  recovery: "Check in on how they feel; consider an easier day.",
  landing: "Use the FixPlan warm-up and re-screen on the planned date.",
  fuel: "Remind them to eat before and after hard sessions.",
  missed: "Remind them to check in; missing days hide problems.",
  watch_fit: "Show them how to wear the watch snugly so readings count.",
};

export interface AthleteSeason {
  id: string;
  name: string;
  sport: string;
  grade: number;
  band: Band;
  trend: "worse" | "better" | "steady" | "new";
  days: { date: string; status: DayStatus; sleep_h: number | null; load_min: number | null; sore: number }[];
  issues: Issue[];
  checkins: { done_14: number; done_7: number; expected_14: number; expected_7: number };
  sleep: { avg_7: number | null; avg_prev_7: number | null; short_nights_7: number };
  load: { this_week: number; last_week: number; change_pct: number | null };
  sore_areas: { area: string; name: string; days: number; worst: number }[];
  watch: { has_data: boolean; device: string; hrv_pct: number | null; rhr_delta: number | null; unreliable_readings: number; usable_pct: number | null };
  landing: { errors: number; band: Band; date: string; focus: string | null } | null;
  alerts: { pending: number; approved: number; dismissed: number };
}

export interface SeasonDetail {
  today: string;
  dates: string[];
  athletes: AthleteSeason[];
  team: {
    roster: number;
    need_look: number;
    high: number;
    moderate: number;
    checkin_pct_14: number | null;
    sleep_avg_7: number | null;
    short_sleepers: number;
    by_day: { date: string; high: number; moderate: number; low: number; missed: number }[];
    issues: { key: IssueKey; label: string; action: string; level: IssueLevel; athletes: { id: string; name: string }[] }[];
    sports: { sport: string; athletes: number; need_look: number; checkin_pct: number | null; sleep_avg_7: number | null }[];
    sore_spots: { area: string; name: string; athletes: number; days: number }[];
  };
}

const DAY_MS = 86_400_000;
const round1 = (x: number) => Math.round(x * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const SCORE: Record<Band, number> = { low: 0, moderate: 1, high: 2 };
const LEVEL_ORDER: Record<IssueLevel, number> = { high: 0, moderate: 1, info: 2 };

/** Same roll-up the rules engine uses: any high flag is high; two different moderate rules also make high. */
function bandOf(flags: Flag[]): Band {
  if (flags.some((f) => f.band === "high")) return "high";
  const moderate = new Set(flags.filter((f) => f.band === "moderate").map((f) => f.rule_id));
  return moderate.size >= 2 ? "high" : moderate.size === 1 ? "moderate" : "low";
}

export function lastDates(today: string, n = REPORT_DAYS): string[] {
  const end = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

export function areaName(area: string): string {
  const side = area.endsWith("_l") ? "Left " : area.endsWith("_r") ? "Right " : "";
  const s = side + area.replace(/_(l|r)$/, "").replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Which coach-facing issue group a rules-engine flag belongs to. A watch flag can be about sleep or about recovery. */
export function issuesFromFlag(f: Flag): Issue[] {
  const level: IssueLevel = f.band === "high" ? "high" : "moderate";
  const one = (key: IssueKey, text = f.reason): Issue => ({ key, level, text });
  switch (f.rule_id) {
    case "R8_red_flag": return [one("red_flag")];
    case "R3_persistent_soreness":
    case "R4_severe_soreness": return [one("soreness")];
    case "R1_sleep_load": return [one("sleep")];
    case "R2_load_spike": return [one("load")];
    case "R6_landing": return [one("landing")];
    case "R9_fuel": return [one("fuel")];
    case "R5_wearable_below_baseline":
      return f.reason.split("; ").map((part) => one(/sleep/i.test(part) ? "sleep" : "recovery", part));
    default: return [one("recovery")];
  }
}

export function athleteSeason(a: Athlete, alerts: Alert[], today: string): AthleteSeason {
  const dates = lastDates(today);
  const byDate = new Map(a.checkins.map((c) => [c.date, c]));
  const first = a.checkins.map((c) => c.date).sort()[0];
  const trust = trustReport(a);
  const trusted = trustedOnly(a, trust);

  const days = dates.map((date) => {
    const c = byDate.get(date);
    let status: DayStatus;
    if (!c) status = !first || date < first ? "none" : "missed";
    else if (date === today) status = a.risk_today.band;
    else {
      const recent = trusted.wearable.recent.filter((d) => d.date <= date);
      const flags = dailyRisk({
        athlete_id: a.id,
        date,
        checkins: a.checkins.filter((x) => x.date <= date),
        wearable_recent: recent.length ? recent : undefined,
        wearable_baseline: recent.length ? a.wearable.baseline : undefined,
        latest_landing: a.landing && a.landing.video_date <= date ? a.landing.score : undefined,
      }).flags;
      // The load rules compare this week with last week. Looking back, "last week" is only partly recorded
      // until there are 14 days of history, which would show a false jump, so they are left out for those days.
      const fullHistory = first != null && first <= lastDates(date)[0];
      status = bandOf(fullHistory ? flags : flags.filter((f) => f.rule_id !== "R1_sleep_load" && f.rule_id !== "R2_load_spike"));
    }
    return { date, status, sleep_h: c?.sleep_h ?? null, load_min: c?.load_min ?? null, sore: Math.max(0, ...(c?.soreness ?? []).map((s) => s.level)) };
  });

  const last7 = days.slice(-7);
  const prev7 = days.slice(0, -7);
  const done = (xs: typeof days) => xs.filter((d) => d.status !== "missed" && d.status !== "none").length;
  const expected = (xs: typeof days) => xs.filter((d) => d.status !== "none").length;
  const sleepOf = (xs: typeof days) => xs.map((d) => d.sleep_h).filter((x): x is number => x != null);
  const loadOf = (xs: typeof days) => xs.reduce((s, d) => s + (d.load_min ?? 0), 0);
  const avg7 = mean(sleepOf(last7));
  const avgPrev = mean(sleepOf(prev7));
  const shortNights = sleepOf(last7).filter((h) => h < SHORT_SLEEP_H).length;
  const loadThis = loadOf(last7);
  const loadLast = loadOf(prev7);

  const bandsOf = (xs: typeof days) => xs.flatMap((d) => (d.status === "missed" || d.status === "none" ? [] : [SCORE[d.status]]));
  const s7 = mean(bandsOf(last7));
  const sPrev = mean(bandsOf(prev7));
  const trend: AthleteSeason["trend"] = s7 == null || sPrev == null ? "new" : s7 - sPrev > 0.1 ? "worse" : s7 - sPrev < -0.1 ? "better" : "steady";

  const areas = new Map<string, { days: number; worst: number }>();
  for (const date of dates) {
    for (const s of byDate.get(date)?.soreness ?? []) {
      if (s.level < 2) continue;
      const cur = areas.get(s.area) ?? { days: 0, worst: 0 };
      areas.set(s.area, { days: cur.days + 1, worst: Math.max(cur.worst, s.level) });
    }
  }
  const sore_areas = [...areas].map(([area, v]) => ({ area, name: areaName(area), ...v })).sort((x, y) => y.days - x.days || y.worst - x.worst);

  // Today's flags first (the rules engine's words), then slower patterns the daily rules do not flag.
  const issues: Issue[] = a.risk_today.flags.flatMap(issuesFromFlag);
  const has = (k: IssueKey) => issues.some((i) => i.key === k);
  if (!has("sleep") && shortNights >= 3) issues.push({ key: "sleep", level: "info", text: `Under ${SHORT_SLEEP_H} hours of sleep on ${shortNights} of the last 7 nights` });
  if (!has("soreness")) {
    const lingering = sore_areas.find((s) => s.days >= 4);
    if (lingering) issues.push({ key: "soreness", level: "info", text: `${lingering.name} sore on ${lingering.days} of the last ${REPORT_DAYS} days` });
  }
  const missed7 = expected(last7) - done(last7);
  if (missed7 >= 2) issues.push({ key: "missed", level: missed7 >= 4 ? "moderate" : "info", text: `Missed ${missed7} of the last ${expected(last7)} check-ins` });
  const weekDates = new Set(dates.slice(-7));
  const unreliable = trust.readings.filter((r) => r.label === "unverified" && weekDates.has(r.date)).length;
  if (unreliable >= 3) issues.push({ key: "watch_fit", level: "info", text: `${unreliable} watch readings this week were unreliable (loose band or not worn), so they were left out` });
  issues.sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]);

  const hasWatch = a.wearable.recent.length > 0;
  const tv = trust.trusted_vs_baseline;
  const mine = alerts.filter((x) => x.athlete_id === a.id);
  return {
    id: a.id,
    name: a.name,
    sport: a.sport,
    grade: a.grade,
    band: a.risk_today.band,
    trend,
    days,
    issues,
    checkins: { done_14: done(days), done_7: done(last7), expected_14: expected(days), expected_7: expected(last7) },
    sleep: { avg_7: avg7 == null ? null : round1(avg7), avg_prev_7: avgPrev == null ? null : round1(avgPrev), short_nights_7: shortNights },
    load: { this_week: loadThis, last_week: loadLast, change_pct: loadLast > 0 ? Math.round(((loadThis - loadLast) / loadLast) * 100) : null },
    sore_areas,
    watch: {
      has_data: hasWatch,
      device: a.device,
      hrv_pct: hasWatch ? tv.hrv_ms.pct : null,
      rhr_delta: hasWatch && tv.rhr_bpm.recent != null && tv.rhr_bpm.baseline != null ? round1(tv.rhr_bpm.recent - tv.rhr_bpm.baseline) : null,
      unreliable_readings: unreliable,
      usable_pct: hasWatch ? trust.summary.pct_usable : null,
    },
    landing: a.landing ? { errors: a.landing.score.score, band: a.landing.score.band, date: a.landing.video_date, focus: a.landing.fixplan?.focus ?? null } : null,
    alerts: {
      pending: mine.filter((x) => x.status === "pending_approval").length,
      approved: mine.filter((x) => x.status === "approved").length,
      dismissed: mine.filter((x) => x.status === "dismissed").length,
    },
  };
}

export function seasonDetail(athletes: Athlete[], alerts: Alert[], today: string): SeasonDetail {
  const dates = lastDates(today);
  const rows = athletes.map((a) => athleteSeason(a, alerts, today));
  rows.sort((x, y) => SCORE[y.band] - SCORE[x.band] || y.issues.length - x.issues.length || x.name.localeCompare(y.name));

  const pct = (done: number, exp: number) => (exp > 0 ? Math.round((done / exp) * 100) : null);
  const sleepAvg = (xs: AthleteSeason[]) => {
    const m = mean(xs.flatMap((r) => (r.sleep.avg_7 == null ? [] : [r.sleep.avg_7])));
    return m == null ? null : round1(m);
  };

  const issueMap = new Map<IssueKey, { level: IssueLevel; athletes: { id: string; name: string }[] }>();
  for (const r of rows) {
    for (const key of new Set(r.issues.map((i) => i.key))) {
      const worst = r.issues.filter((i) => i.key === key).sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level])[0].level;
      const cur = issueMap.get(key) ?? { level: "info" as IssueLevel, athletes: [] };
      issueMap.set(key, { level: LEVEL_ORDER[worst] < LEVEL_ORDER[cur.level] ? worst : cur.level, athletes: [...cur.athletes, { id: r.id, name: r.name }] });
    }
  }
  const issues = [...issueMap]
    .map(([key, v]) => ({ key, label: ISSUE_LABEL[key], action: ISSUE_ACTION[key], ...v }))
    .sort((x, y) => y.athletes.length - x.athletes.length || LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]);

  const spots = new Map<string, { athletes: number; days: number }>();
  for (const r of rows) for (const s of r.sore_areas) {
    const cur = spots.get(s.area) ?? { athletes: 0, days: 0 };
    spots.set(s.area, { athletes: cur.athletes + 1, days: cur.days + s.days });
  }

  const sports = [...new Set(rows.map((r) => r.sport))].sort().map((sport) => {
    const xs = rows.filter((r) => r.sport === sport);
    return {
      sport,
      athletes: xs.length,
      need_look: xs.filter((r) => r.band !== "low").length,
      checkin_pct: pct(xs.reduce((s, r) => s + r.checkins.done_14, 0), xs.reduce((s, r) => s + r.checkins.expected_14, 0)),
      sleep_avg_7: sleepAvg(xs),
    };
  });

  return {
    today,
    dates,
    athletes: rows,
    team: {
      roster: rows.length,
      need_look: rows.filter((r) => r.band !== "low").length,
      high: rows.filter((r) => r.band === "high").length,
      moderate: rows.filter((r) => r.band === "moderate").length,
      checkin_pct_14: pct(rows.reduce((s, r) => s + r.checkins.done_14, 0), rows.reduce((s, r) => s + r.checkins.expected_14, 0)),
      sleep_avg_7: sleepAvg(rows),
      short_sleepers: rows.filter((r) => r.sleep.short_nights_7 >= 3).length,
      by_day: dates.map((date, i) => {
        const c = { date, high: 0, moderate: 0, low: 0, missed: 0 };
        for (const r of rows) { const s = r.days[i].status; if (s !== "none") c[s] += 1; }
        return c;
      }),
      issues,
      sports,
      sore_spots: [...spots].map(([area, v]) => ({ area, name: areaName(area), ...v })).sort((x, y) => y.athletes - x.athletes || y.days - x.days).slice(0, 8),
    },
  };
}

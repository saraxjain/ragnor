// Google Health API (the successor to the Fitbit Web API) for Fitbit and Pixel Watch data.
// Base: https://health.googleapis.com/v4 ; resource: users/me/dataTypes/{dataType}/dataPoints
// Data types used: daily-heart-rate-variability, daily-resting-heart-rate, sleep.
// All Google Health API scopes are Restricted; in testing mode only listed test users can connect.
// Payload field names for the daily types aren't fully documented yet, so parsing below is defensive. Verify against live responses.
import { config } from "./config.ts";
import type { WearableDay } from "../shared/lib/index.ts";

export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

const BASE = "https://health.googleapis.com/v4";

export function authUrl(athleteId: string): string {
  const p = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: `${config.appUrl}/api/health/callback`,
    response_type: "code",
    scope: HEALTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: athleteId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: `${config.appUrl}/api/health/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
}

async function listPoints(token: string, dataType: string, start: string, end: string) {
  const out: Record<string, unknown>[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ startTime: start, endTime: end, pageSize: "200" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${BASE}/users/me/dataTypes/${dataType}/dataPoints?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${dataType}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { dataPoints?: Record<string, unknown>[]; nextPageToken?: string };
    out.push(...(body.dataPoints ?? []));
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return out;
}

/** Find the first finite number under any of the candidate keys, searching nested objects. */
function findNumber(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (keys.some((c) => k.toLowerCase().includes(c))) {
      const n = typeof v === "string" ? Number(v) : v;
      if (typeof n === "number" && Number.isFinite(n)) return n;
    }
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const n = findNumber(v, keys);
    if (n != null) return n;
  }
  return null;
}

function pointDate(p: Record<string, unknown>): string | null {
  const s = JSON.stringify(p);
  const civil = s.match(/"year":(\d{4}),"month":(\d{1,2}),"day":(\d{1,2})/);
  if (civil) return `${civil[1]}-${civil[2].padStart(2, "0")}-${civil[3].padStart(2, "0")}`;
  const iso = s.match(/"(?:endTime|startTime|date)":"(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

/** Pull the last `days` days and return one WearableDay per date. */
export async function fetchWearableDays(token: string, days = 31): Promise<WearableDay[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const [hrv, rhr, sleep] = await Promise.all([
    listPoints(token, "daily-heart-rate-variability", start.toISOString(), end.toISOString()),
    listPoints(token, "daily-resting-heart-rate", start.toISOString(), end.toISOString()),
    listPoints(token, "sleep", start.toISOString(), end.toISOString()),
  ]);
  const byDate = new Map<string, WearableDay>();
  const get = (d: string) => byDate.get(d) ?? (byDate.set(d, { date: d, hrv_ms: null, rhr_bpm: null, sleep_h: null }), byDate.get(d)!);
  for (const p of hrv) {
    const d = pointDate(p);
    const v = findNumber(p, ["rmssd", "milliseconds", "heartratevariability", "average"]);
    if (d && v != null) get(d).hrv_ms = Math.round(v * 10) / 10;
  }
  for (const p of rhr) {
    const d = pointDate(p);
    const v = findNumber(p, ["beatsperminute", "bpm", "restingheartrate", "value"]);
    if (d && v != null) get(d).rhr_bpm = Math.round(v * 10) / 10;
  }
  for (const p of sleep) {
    const d = pointDate(p);
    const mins = findNumber(p, ["minutesasleep"]);
    if (d && mins != null) get(d).sleep_h = Math.round((mins / 60) * 10) / 10;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

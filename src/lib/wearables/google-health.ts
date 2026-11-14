// Google Health API provider (Fitbit / Pixel Watch). The successor to the legacy Fitbit Web API.
//
// Written from the Google docs (accessed 2026-11-14):
//  - Landing:   https://developers.google.com/health  (successor to the Fitbit Web API; legacy Fitbit Web API and OAuth endpoints
//                scheduled to be turned off on 2026-11-02; migration guide at /health/migration)
//  - Setup:     https://developers.google.com/health/setup.md.txt
//      Web Server OAuth client; consent screen "External" + Testing with test users; unverified clients are capped at 100 users;
//      in Testing, refresh tokens expire after 7 days; users must first sign in to the Google Health app and have a profile.
//      Authorization endpoint https://accounts.google.com/o/oauth2/v2/auth, token endpoint https://oauth2.googleapis.com/token,
//      identity check GET https://health.googleapis.com/v4/users/me/identity.
//      The page lists the redirect URI https://www.google.com for obtaining an authorization code; whether other redirect URIs
//      (such as http://localhost) are accepted for a Web Server client is not stated there.
//  - REST ref:  https://developers.google.com/health/reference/rest and https://health.googleapis.com/$discovery/rest?version=v4
//      base https://health.googleapis.com; GET /v4/users/me/dataTypes/{dataType}/dataPoints (order: interval start descending;
//      pageSize); data types (kebab-case path segment): daily-heart-rate-variability, daily-resting-heart-rate, sleep.
//      Scopes: https://www.googleapis.com/auth/googlehealth.sleep.readonly (sleep) and
//      https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly (listed as "health metrics and
//      measurements"; the docs I read do NOT state which scope covers HRV / resting heart rate, so this is an assumption to verify).
//      Sleep data point: sleep.summary.minutesAsleep (int64 as string). The field names inside dailyHeartRateVariability and
//      dailyRestingHeartRate were NOT in the part of the schema I could read, so those two are read defensively (see pickNumber)
//      and MUST be checked against the API reference before relying on them.
// Never exercised: it needs a Google Cloud project, an OAuth client and a consenting test user (see docs/APP_NOTES.md).
import { addDays } from "../time";
import type { WearableDay, WearableProvider } from "./types";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const HEALTH_BASE = "https://health.googleapis.com";
export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
] as const;

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms */
  expiresAt: number;
}

/** Where tokens live. Memory in the demo; Firestore (server-only) in production. Tokens are secrets: never send to the browser. */
export interface TokenStore {
  get(athleteId: string): Promise<TokenSet | null>;
  set(athleteId: string, tokens: TokenSet): Promise<void>;
}

export function createMemoryTokenStore(): TokenStore {
  const m = new Map<string, TokenSet>();
  return { get: async (id) => m.get(id) ?? null, set: async (id, t) => void m.set(id, t) };
}

type Env = Record<string, string | undefined>;
export const googleHealthConfigured = (env: Env = process.env): boolean => Boolean(env.GOOGLE_HEALTH_CLIENT_ID?.trim() && env.GOOGLE_HEALTH_CLIENT_SECRET?.trim());
export const redirectUri = (env: Env = process.env): string => env.GOOGLE_HEALTH_REDIRECT_URI?.trim() || "http://localhost:3000/api/wearables/google/callback";

export function buildAuthUrl(state: string, env: Env = process.env): string {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_HEALTH_CLIENT_ID ?? "",
    redirect_uri: redirectUri(env),
    response_type: "code",
    scope: HEALTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}

async function tokenRequest(params: Record<string, string>, env: Env, fetchImpl: typeof fetch): Promise<TokenSet> {
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_HEALTH_CLIENT_ID ?? "", client_secret: env.GOOGLE_HEALTH_CLIENT_SECRET ?? "", ...params }),
  });
  if (!res.ok) throw new Error(`Google token request failed (${res.status})`);
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Google token response had no access token");
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? params.refresh_token ?? null, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

export const exchangeCode = (code: string, env: Env = process.env, f: typeof fetch = fetch) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(env) }, env, f);

/** Defensive numeric pick: first finite number found under any key matching one of the hints (breadth-first, depth 3). */
export function pickNumber(obj: unknown, hints: RegExp[], depth = 3): number | null {
  if (obj === null || typeof obj !== "object" || depth < 0) return null;
  const entries = Object.entries(obj as Record<string, unknown>);
  for (const [k, v] of entries) {
    if (hints.some((h) => h.test(k))) {
      const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
      if (Number.isFinite(n)) return n;
    }
  }
  for (const [, v] of entries) {
    const n = pickNumber(v, hints, depth - 1);
    if (n !== null) return n;
  }
  return null;
}

function pointDate(p: Record<string, unknown>, key: string): string | null {
  const body = p[key] as Record<string, unknown> | undefined;
  const d = (body?.date ?? (body?.interval as Record<string, unknown> | undefined)?.civilEndTime ?? (body?.interval as Record<string, unknown> | undefined)?.civilStartTime) as unknown;
  const civil = (d && typeof d === "object" && "date" in (d as object) ? (d as { date: unknown }).date : d) as unknown;
  if (typeof civil === "string") return civil.slice(0, 10);
  if (civil && typeof civil === "object") {
    const { year, month, day } = civil as { year?: number; month?: number; day?: number };
    if (year && month && day) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export function createGoogleHealthProvider(opts: { tokens: TokenStore; env?: Env; fetchImpl?: typeof fetch }): WearableProvider {
  const env = opts.env ?? process.env;
  const f = opts.fetchImpl ?? fetch;
  async function accessToken(athleteId: string): Promise<string> {
    let t = await opts.tokens.get(athleteId);
    if (!t) throw new Error("This athlete has not connected a Google Health account.");
    if (t.expiresAt - 60_000 < Date.now()) {
      if (!t.refreshToken) throw new Error("The Google Health connection expired; reconnect it.");
      t = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refreshToken }, env, f);
      await opts.tokens.set(athleteId, t);
    }
    return t.accessToken;
  }
  async function list(athleteId: string, dataType: string, pageSize: number): Promise<Record<string, unknown>[]> {
    const token = await accessToken(athleteId);
    // No server-side filter: the exact filter syntax was not confirmed, so fetch recent points and filter by date here.
    const res = await f(`${HEALTH_BASE}/v4/users/me/dataTypes/${dataType}/dataPoints?pageSize=${pageSize}`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google Health API error ${res.status}`);
    const j = (await res.json()) as { dataPoints?: Record<string, unknown>[] };
    return j.dataPoints ?? [];
  }
  return {
    name: "google-health",
    async getDays(athleteId, fromDate, toDate) {
      const [hrv, rhr, sleep] = await Promise.all([
        list(athleteId, "daily-heart-rate-variability", 60),
        list(athleteId, "daily-resting-heart-rate", 60),
        list(athleteId, "sleep", 25),
      ]);
      const days = new Map<string, WearableDay>();
      const day = (d: string): WearableDay => days.get(d) ?? (days.set(d, { localDate: d, hrvMs: null, restingHr: null, sleepHours: null }), days.get(d)!);
      for (const p of hrv) {
        const d = pointDate(p, "dailyHeartRateVariability");
        const v = pickNumber(p.dailyHeartRateVariability, [/rmssd/i, /average/i, /milli/i, /hrv/i, /value/i]);
        if (d && v !== null) day(d).hrvMs = v;
      }
      for (const p of rhr) {
        const d = pointDate(p, "dailyRestingHeartRate");
        const v = pickNumber(p.dailyRestingHeartRate, [/beatsPerMinute/i, /bpm/i, /resting/i, /value/i]);
        if (d && v !== null) day(d).restingHr = v;
      }
      for (const p of sleep) {
        const s = p.sleep as { summary?: { minutesAsleep?: string | number } } | undefined;
        const d = pointDate(p, "sleep");
        const mins = Number(s?.summary?.minutesAsleep);
        if (d && Number.isFinite(mins)) day(d).sleepHours = Math.round((mins / 60) * 10) / 10;
      }
      return [...days.values()].filter((d) => d.localDate >= fromDate && d.localDate <= toDate).sort((a, b) => a.localDate.localeCompare(b.localDate));
    },
  };
}

export const _test = { pointDate, addDays };

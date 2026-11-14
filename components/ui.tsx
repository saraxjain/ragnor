"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlert, IconInfo } from "./icons.tsx";

export type Band = "low" | "moderate" | "high";
const BAND_LABEL: Record<Band, string> = { low: "Low", moderate: "Moderate", high: "High" };

export function BandChip({ band, label }: { band: Band; label?: string }) {
  return <span className={`band band-${band}`}>{label ?? `${BAND_LABEL[band]} risk`}</span>;
}

export function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("");
}

const AVATAR_COLORS = ["#d3e3fd", "#c8f1f2", "#ffe3bf", "#e8def8", "#c4eed0", "#ffd8e4"];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const i = [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return (
    <span className="avatar" style={{ width: size, height: size, background: AVATAR_COLORS[i], color: "#1f1f1f", fontSize: size * 0.36 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Skeleton({ h = 20, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card stack" aria-busy="true" aria-label="Loading">
      <Skeleton h={22} w="40%" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={14} w={`${90 - i * 12}%`} />)}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <IconAlert size={20} />
      <div style={{ flex: 1 }}>{message}</div>
      {onRetry && <button className="btn btn-text btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function InfoBanner({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "success" }) {
  return (
    <div className={`banner banner-${tone}`} role="status">
      <IconInfo size={20} />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export function ModePill({ live, label }: { live: boolean; label?: string }) {
  return (
    <span className={`pill ${live ? "live" : "demo"}`} title={live ? "Connected to the live service" : "Using built-in sample data"}>
      <span className="dot" />
      {label ?? (live ? "Live" : "Sample data")}
    </span>
  );
}

/** Fetch JSON with loading/error state and a reload function. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  const node = msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null;
  return { show, node };
}

export function prettySymptom(s: string) {
  return s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function prettyArea(area: string) {
  const side = area.endsWith("_l") ? "Left " : area.endsWith("_r") ? "Right " : "";
  const base = area.replace(/_(l|r)$/, "").replaceAll("_", " ");
  const s = side + base;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function timeAgo(iso: string) {
  const d = (Date.now() - Date.parse(iso)) / 60000;
  if (d < 1) return "just now";
  if (d < 60) return `${Math.round(d)} min ago`;
  if (d < 60 * 24) return `${Math.round(d / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

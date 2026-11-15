"use client";
import { useState } from "react";
import { useApi, postJson } from "@/components/ui.tsx";
import type { TrustReport } from "@/lib/trust.ts";

/** Athlete-facing: how good this week's watch data was, and consent to share a brief with their clinician. */
export function DataTrustCard({ id }: { id: string }) {
  const { data } = useApi<{ trust: TrustReport }>(`/api/trust/${id}`);
  const b = useApi<{ brief: { headline: string; signoff?: { by: string } } | null }>(`/api/brief/${id}`);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const t = data.trust;
  const bad = t.readings.filter((r) => r.label === "unverified");
  const nights = [...new Set(bad.map((r) => r.date))].filter((d) => t.readings.some((r) => r.date === d)).slice(-3);
  const shared = !!b.data?.brief;
  async function share() {
    setBusy(true);
    try { await postJson(`/api/brief/${id}`, {}); b.reload(); } finally { setBusy(false); }
  }
  return (
    <section className="card" aria-labelledby="trust-h">
      <div className="row spread">
        <h3 id="trust-h" style={{ margin: 0 }}>Your watch data this week</h3>
        <span className={`band band-${t.summary.pct_usable >= 90 ? "low" : t.summary.pct_usable >= 75 ? "mod" : "high"}`}>{t.summary.pct_usable}% usable</span>
      </div>
      {nights.length ? (
        <p className="small">We left out {nights.length === 1 ? "one night" : `${nights.length} nights`} ({nights.map((d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })).join(", ")}) because your watch was loose or off for part of the night. Wear it a finger-width above your wrist bone, snug but comfortable.</p>
      ) : <p className="small">Every night was captured well. Nice.</p>}
      <div className="row wrap" style={{ gap: 8 }}>
        {shared ? (
          <span className="small">✓ Shared with your clinician{b.data?.brief?.signoff ? ` · reviewed by ${b.data.brief.signoff.by}` : " · waiting for review"}</span>
        ) : (
          <button className="btn btn-tonal btn-sm" onClick={share} disabled={busy}>{busy ? "Preparing…" : "Share a summary with my doctor"}</button>
        )}
      </div>
      <p className="tiny muted" style={{ marginBottom: 0 }}>Only a short summary and your trusted readings are shared. Your doctor, not Ragnor, makes any medical decisions.</p>
    </section>
  );
}

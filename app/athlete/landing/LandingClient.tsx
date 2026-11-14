"use client";
import { useEffect, useRef, useState } from "react";
import { AthleteNav, AthletePicker } from "@/components/AthleteShell.tsx";
import { BandChip, ErrorBanner, postJson, useApi } from "@/components/ui.tsx";
import { IconUpload, IconVideo, IconSpark, IconCheck, IconAlert, IconInfo } from "@/components/icons.tsx";
import type { LandingResult, LandingScore } from "@/shared/lib/index.ts";
import type { Athlete, FixPlan } from "@/lib/store.ts";

const ITEM_LABEL: Record<string, string> = {
  knee_flexion_contact: "Stiff knees at touchdown",
  knee_valgus_contact: "Knee caves in at touchdown",
  knee_valgus_max: "Knee collapses inward",
  trunk_flexion_contact: "Upright trunk",
  lateral_trunk_lean: "Leaning to one side",
  stance_width: "Stance too wide or narrow",
  foot_rotation: "Foot turned in or out",
  asymmetric_foot_contact: "Feet land at different times",
  heel_first_landing: "Heel lands first",
  stiff_landing_overall: "Stiff, loud landing",
};

export function LandingClient({ id }: { id: string }) {
  const existing = useApi<{ athlete: Athlete }>(`/api/athletes/${id}`);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ mode: string; result: LandingResult; score: LandingScore } | null>(null);
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const a = existing.data?.athlete;
    if (a?.landing && !res) {
      setRes({ mode: "saved", result: a.landing.result, score: a.landing.score });
      if (a.landing.fixplan) setPlan(a.landing.fixplan);
    }
  }, [existing.data, res]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("video/")) return setError("That isn't a video file. Use mp4, mov or webm.");
    if (f.size > 18 * 1024 * 1024) return setError("That video is over 18 MB. Trim it to the few seconds around the landing.");
    setError(null);
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setRes(null);
    setPlan(null);
  }

  async function analyze(demo = false) {
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const f = new FormData();
      f.set("athlete_id", id);
      if (demo) f.set("demo", "1");
      else if (file) f.set("video", file);
      const r = await fetch("/api/landing", { method: "POST", body: f });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Analysis failed");
      setRes(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function makePlan() {
    setPlanBusy(true);
    try {
      const r = await postJson<{ plan: FixPlan }>("/api/fixplan", { athlete_id: id });
      setPlan(r.plan);
      setTimeout(() => document.getElementById("fixplan")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build a plan");
    } finally {
      setPlanBusy(false);
    }
  }

  const seek = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      videoRef.current.pause();
    }
  };

  const found = res?.result.items.filter((i) => i.present && i.confidence >= 0.5) ?? [];
  const fine = res?.result.items.filter((i) => !i.present || i.confidence < 0.5) ?? [];

  return (
    <div className="page">
      <div className="phone-shell stack" style={{ paddingInline: 16 }}>
        <div className="row spread wrap">
          <h2>LandingCheck</h2>
          <AthletePicker id={id} />
        </div>
        <p className="small muted">Film a drop jump: step off a box about knee height, land on both feet, jump straight up. Gemini watches the landing for the movement patterns linked to ACL tears.</p>

        <section className="card stack">
          {url ? (
            <>
              <div className="video-wrap">
                <video ref={videoRef} src={url} controls playsInline muted onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} aria-label="Your landing video" />
              </div>
              {res && duration > 0 && found.length > 0 && (
                <div className="scrub" aria-label="Moments where landing errors appear">
                  {found.map((i, n) => (
                    <button key={i.id} className="scrub-marker" style={{ left: `${Math.min(97, Math.max(3, (i.timestamp_s / duration) * 100))}%`, background: "var(--high)" }} onClick={() => seek(i.timestamp_s)} aria-label={`Jump to ${ITEM_LABEL[i.id] ?? i.id} at ${i.timestamp_s} seconds`}>
                      {n + 1}
                    </button>
                  ))}
                </div>
              )}
              <div className="row wrap">
                <button className="btn btn-filled" onClick={() => analyze(false)} disabled={busy}>{busy ? <span className="spinner" /> : <IconSpark size={18} />} Analyze with Gemini</button>
                <button className="btn btn-text" onClick={() => inputRef.current?.click()}>Choose another video</button>
              </div>
            </>
          ) : (
            <div
              className={`drop ${over ? "over" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
            >
              <div className="feature-icon" style={{ background: "var(--teal-container)", color: "var(--teal-ink)", margin: "0 auto 12px" }}><IconVideo /></div>
              <strong>Record or upload a landing video</strong>
              <p className="small muted mt-8">On a phone this opens the camera. 5–10 seconds, under 18 MB.</p>
              <span className="btn btn-tonal btn-sm mt-16"><IconUpload size={16} /> Choose video</span>
            </div>
          )}
          <input ref={inputRef} type="file" accept="video/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn-text btn-sm" onClick={() => analyze(true)} disabled={busy}>No video handy? Use the sample result</button>
          </div>
        </section>

        <details className="card flat">
          <summary className="strong small" style={{ cursor: "pointer" }}>Filming tips for an accurate screen</summary>
          <ul className="small muted" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
            <li>Camera at hip height, 3 metres away, phone held vertical.</li>
            <li>Film from the front. Your whole body, both knees and both feet in frame.</li>
            <li>Shorts or leggings help Gemini see your knees.</li>
            <li>Film three jumps if you can; we score the clearest one.</li>
          </ul>
        </details>

        {busy && <div className="card stack" role="status" aria-busy="true"><div className="row small"><span className="spinner" /> Gemini is watching your landing frame by frame…</div><div className="skeleton" style={{ height: 14 }} /><div className="skeleton" style={{ height: 14, width: "70%" }} /></div>}
        {error && <ErrorBanner message={error} />}

        {res && !busy && (
          <section className="card stack" aria-labelledby="results">
            {!res.result.video_ok && <div className="banner banner-warn"><IconInfo size={18} /> {res.result.video_issue ?? "We couldn't see your whole landing. Try re-filming."}</div>}
            <div className="row spread">
              <div>
                <h3 id="results">{found.length} landing {found.length === 1 ? "error" : "errors"} found</h3>
                <p className="small muted">{res.mode === "gemini" ? "Scored by Gemini from your video" : res.mode === "demo" ? "Sample result (demo)" : "Your last screen"} · LESS-style screen, not a diagnosis</p>
              </div>
              <BandChip band={res.score.band} label={res.score.band === "low" ? "Clean" : res.score.band === "moderate" ? "Work on it" : "Priority"} />
            </div>
            <p className="strong">{res.result.summary}</p>
            {found.length > 0 && (
              <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
                {found.map((i, n) => (
                  <button key={i.id} className="item-row" onClick={() => seek(i.timestamp_s)} disabled={!url} aria-label={`${ITEM_LABEL[i.id] ?? i.id}, at ${i.timestamp_s} seconds`}>
                    <span className="icon-bubble" style={{ background: "var(--high-container)", color: "var(--high)", fontWeight: 700, fontSize: 13 }}>{n + 1}</span>
                    <span style={{ flex: 1 }}>
                      <span className="strong small">{ITEM_LABEL[i.id] ?? i.id}{i.side !== "none" && i.side !== "both" ? ` · ${i.side}` : ""}</span>
                      <span className="small muted" style={{ display: "block" }}>{i.plain_language}</span>
                    </span>
                    <span className="mono muted">{i.timestamp_s.toFixed(1)}s</span>
                  </button>
                ))}
              </div>
            )}
            {fine.length > 0 && (
              <details>
                <summary className="small muted" style={{ cursor: "pointer" }}>{fine.length} checks looked good</summary>
                <ul className="small muted" style={{ paddingLeft: 18, marginBottom: 0 }}>
                  {fine.map((i) => <li key={i.id}><IconCheck size={12} className="" /> {i.plain_language}</li>)}
                </ul>
              </details>
            )}
            <button className="btn btn-filled" onClick={makePlan} disabled={planBusy}>{planBusy ? <span className="spinner" /> : <IconSpark size={18} />} {plan ? "Rebuild my FixPlan" : "Build my FixPlan"}</button>
          </section>
        )}

        {plan && (
          <section id="fixplan" className="card stack" aria-labelledby="fp" style={{ background: "#f4effa", boxShadow: "none" }}>
            <div className="row spread">
              <h3 id="fp">Your FixPlan · 10 minutes</h3>
              <span className="pill" style={{ background: "#e8def8", color: "#5b3f9a" }}>Re-film in {plan.retest_in_days} days</span>
            </div>
            <p className="small">{plan.focus}</p>
            <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0, "--gap": "8px" } as React.CSSProperties}>
              {plan.warmup.map((w, n) => (
                <li key={w.name} className="row" style={{ alignItems: "flex-start", background: "var(--surface)", borderRadius: 14, padding: 12 }}>
                  <span className="icon-bubble" style={{ background: "#e8def8", color: "#5b3f9a", fontWeight: 700, fontSize: 13 }}>{n + 1}</span>
                  <span style={{ flex: 1 }}>
                    <span className="strong small">{w.name}</span>
                    <span className="small muted" style={{ display: "block" }}>{w.sets} × {w.reps_or_time}</span>
                    <span className="small" style={{ display: "block", marginTop: 4 }}>“{w.cue}”</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="tiny muted"><IconAlert size={12} /> Warm-ups like this target landing mechanics; they don't guarantee anything. Stop if something hurts and tell your coach.</p>
          </section>
        )}
      </div>
      <AthleteNav id={id} />
    </div>
  );
}

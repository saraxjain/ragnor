"use client";
// "Flag detail" screen from the team's app mockup: risk chip, title, likely cause, do this, Got it / Tell my trainer.
import { useState } from "react";
import Link from "next/link";
import { AthleteNav } from "@/components/AthleteShell.tsx";
import { BodyMap } from "@/components/BodyMap.tsx";
import { useApi, postJson, ErrorBanner, LoadingCard } from "@/components/ui.tsx";
import { IconBack, IconCheck, IconMoon, IconBolt, IconWave, IconKnee, IconPhone, IconHeart, IconInfo } from "@/components/icons.tsx";
import { flagCopy } from "@/lib/flagCopy.ts";
import type { Athlete } from "@/lib/store.ts";

const CAUSE_ICONS = {
  load: [<IconBolt key="b" size={18} />],
  sleep: [<IconBolt key="b" size={18} />, <IconMoon key="m" size={18} />],
  soreness: [<IconHeart key="h" size={18} />],
  wearable: [<IconWave key="w" size={18} />, <IconMoon key="m" size={18} />],
  landing: [<IconKnee key="k" size={18} />],
  head: [<IconPhone key="p" size={18} />],
  fuel: [<IconBolt key="b" size={18} />],
};

export function FlagDetail({ id, rule, area }: { id: string; rule: string; area?: string }) {
  const { data, error, loading } = useApi<{ athlete: Athlete }>(`/api/athletes/${id}`);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const a = data?.athlete;
  const flag = a?.risk_today.flags.find((f) => f.rule_id === rule && (area ? f.area === area : true)) ?? a?.risk_today.flags[0];
  const copy = flag ? flagCopy(flag) : null;
  const sore = Object.fromEntries((a?.checkins.find((c) => c.date === a.risk_today.date)?.soreness ?? []).map((s) => [s.area, s.level]));
  if (flag?.area && flag.area.includes("_") && !sore[flag.area]) sore[flag.area] = flag.band === "high" ? 3 : 2;

  async function act(action: "got_it" | "tell_trainer") {
    if (!flag) return;
    setBusy(action);
    setErr(null);
    try {
      const r = await postJson<{ message: string }>("/api/flags", { athlete_id: id, rule_id: flag.rule_id, area: flag.area, action });
      setDone(r.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page">
      <div className="phone-shell stack" style={{ paddingInline: 16 }}>
        <Link href={`/athlete?id=${id}`} className="row small" style={{ gap: 4 }}><IconBack size={16} /> Today</Link>
        <h2>Flag detail</h2>
        {error && <ErrorBanner message={error} />}
        {loading && !a && <LoadingCard lines={4} />}
        {a && !flag && (
          <div className="card stack center" style={{ alignItems: "center" }}>
            <div className="feature-icon" style={{ background: "var(--low-container)", color: "var(--low)" }}><IconCheck /></div>
            <h3>No active flags</h3>
            <p className="small muted">Nothing needs your attention today.</p>
          </div>
        )}
        {flag && copy && (
          <>
            <section className="card stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              <span className={`band band-${flag.band}`} style={{ alignSelf: "flex-start" }}>{flag.band === "high" ? "High risk" : flag.band === "moderate" ? "Moderate risk" : "Low risk"}</span>
              <h3 style={{ fontSize: 22 }}>{copy.title}</h3>
              {flag.area && flag.area !== "head" && Object.keys(sore).length > 0 && <BodyMap value={sore} />}
            </section>

            <section className="card stack" style={{ "--gap": "8px" } as React.CSSProperties}>
              <span className="small muted">Likely cause</span>
              <div className="row">
                <span className="row" style={{ gap: 4, color: "var(--primary)" }}>{CAUSE_ICONS[copy.causeKind]}</span>
                <strong>{copy.cause}</strong>
              </div>
              <p className="small muted">{flag.reason}</p>
            </section>

            <section className="card stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              <span className="small muted">Do this</span>
              <strong style={{ fontSize: 17 }}>{copy.athleteAction}</strong>
              {flag.rule_id === "R6_landing" && <Link href={`/athlete/landing?id=${id}#fixplan`} className="small">Open my FixPlan →</Link>}
              {done ? (
                <div className="banner banner-success" role="status"><IconCheck size={18} /> {done}</div>
              ) : (
                <button className="btn btn-green btn-lg btn-block" onClick={() => act("got_it")} disabled={!!busy}>
                  {busy === "got_it" ? <span className="spinner" /> : <IconCheck size={18} />} Got it
                </button>
              )}
            </section>

            {!done && (
              <button className="btn btn-filled btn-lg btn-block" onClick={() => act("tell_trainer")} disabled={!!busy}>
                {busy === "tell_trainer" ? <span className="spinner" /> : null} Tell my trainer
              </button>
            )}
            {err && <ErrorBanner message={err} />}

            <p className="tiny muted center row" style={{ justifyContent: "center", gap: 6 }}>
              <IconInfo size={14} /> Numbness, weakness, or swelling? See a clinician.
            </p>
          </>
        )}
      </div>
      <AthleteNav id={id} />
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckinError } from "../checkin/CheckinResult.tsx";
import { forgetMyProfile, readMyProfile, saveMyProfile, type MyProfile } from "@/lib/myProfile.ts";

const SPORTS = ["Girls Soccer", "Boys Soccer", "Girls Basketball", "Boys Basketball", "Girls Volleyball", "Football", "Gymnastics", "Track & Field", "Lacrosse", "Wrestling", "Other"];
const DEVICES: [string, string][] = [["none", "No watch"], ["Fitbit Charge", "Fitbit Charge"], ["Fitbit Inspire", "Fitbit Inspire"], ["Fitbit Sense", "Fitbit Sense"], ["Pixel Watch", "Pixel Watch"]];

export function NewProfile() {
  const router = useRouter();
  const [mine, setMine] = useState<MyProfile | null>(null);
  const [name, setName] = useState("");
  const [sport, setSport] = useState(SPORTS[0]);
  const [grade, setGrade] = useState(10);
  const [device, setDevice] = useState("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMine(readMyProfile()), []); // after mount, so server and browser render the same HTML

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/athletes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, sport, grade, device }) });
      // A non-JSON reply means the server itself hiccuped; show plain words, not a parser error.
      const body = await res.json().catch(() => null);
      if (!body) throw new Error("We couldn't reach the server. Wait a moment and try again.");
      if (!res.ok) throw new Error(body.error ?? "We couldn't create your profile.");
      saveMyProfile(body.athlete as MyProfile);
      router.push(`/athlete?id=${body.athlete.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create your profile.");
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="phone-shell stack" style={{ paddingInline: 16 }}>
        <div>
          <h2>Create your profile</h2>
          <p className="small muted" style={{ marginTop: 6 }}>Takes 20 seconds. You start with a clean slate: your own check-ins, landing screens and watch data build your personal baseline.</p>
        </div>

        {mine && (
          <section className="card stack" style={{ "--gap": "10px" } as React.CSSProperties} aria-labelledby="have">
            <strong id="have">You already have a profile</strong>
            <div className="small">{mine.name} · {mine.sport} · Grade {mine.grade}</div>
            <div className="row wrap">
              <Link className="btn btn-filled" href={`/athlete?id=${mine.id}`}>Open my profile</Link>
              <button className="btn btn-text" onClick={() => { forgetMyProfile(); setMine(null); }}>Start a new one instead</button>
            </div>
            <p className="tiny muted">Starting a new one only forgets the old profile on this device.</p>
          </section>
        )}

        {!mine && (
          <form className="card stack" onSubmit={create} aria-label="Create your athlete profile">
            <div className="field">
              <label htmlFor="np-name">Your name</label>
              <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" placeholder="First and last name" required />
            </div>
            <div className="field">
              <label htmlFor="np-sport">Sport</label>
              <select id="np-sport" className="select" value={sport} onChange={(e) => setSport(e.target.value)}>
                {SPORTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <span className="small" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }} id="np-grade">Grade</span>
              <div className="seg" role="group" aria-labelledby="np-grade" style={{ alignSelf: "flex-start" }}>
                {[9, 10, 11, 12].map((g) => <button type="button" key={g} aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}</button>)}
              </div>
            </div>
            <div className="field">
              <label htmlFor="np-device">Watch</label>
              <select id="np-device" className="select" value={device} onChange={(e) => setDevice(e.target.value)}>
                {DEVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <span className="tiny muted">You can connect it after your profile is made. No watch is fine: check-ins still work.</span>
            </div>
            {error && <CheckinError message={error} />}
            <button className="btn btn-green btn-lg btn-block" type="submit" disabled={busy || name.trim().length < 2}>{busy ? <span className="spinner" /> : null} Create my profile</button>
            <p className="tiny muted center">No account or password needed. Your profile is remembered on this device only.</p>
          </form>
        )}

        <Link className="btn btn-text" href="/athlete" style={{ alignSelf: "center" }}>Or look around as a sample athlete</Link>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AthleteNav, AthletePicker } from "@/components/AthleteShell.tsx";
import { BandChip, ErrorBanner, prettyArea, prettySymptom } from "@/components/ui.tsx";
import { IconMic, IconStop, IconAlert, IconCheck, IconMoon, IconClock, IconPhone } from "@/components/icons.tsx";
import type { CheckIn, RiskResult } from "@/shared/lib/index.ts";

interface Result {
  mode: string;
  checkin: CheckIn;
  summary: string;
  risk: RiskResult;
  hitwatch_started: boolean;
  red_flag_message: string | null;
}

const PROMPTS = ["How'd you sleep last night, roughly how many hours?", "Anything sore or tight? Where, and how bad, 0 to 3?", "How long and how hard was practice? Any hits?"];
const EXAMPLE = "Slept about five and a half hours. My left hamstring's pretty tight, maybe a two. Practice was two hours and brutal, lots of sprints. No hits.";

export function CheckinClient({ id }: { id: string }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); recRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function startRec() {
    setError(null);
    setAudio(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        setAudio(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => {
        if (s >= 44) stopRec();
        return s + 1;
      }), 1000);
    } catch {
      setError("We couldn't use your microphone. Allow mic access, or type your check-in below.");
    }
  }

  function stopRec() {
    recRef.current?.state === "recording" && recRef.current.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  }

  async function submit(useAudio: boolean) {
    setBusy(true);
    setError(null);
    try {
      const f = new FormData();
      f.set("athlete_id", id);
      if (useAudio && audio) f.set("audio", new File([audio], "checkin.webm", { type: audio.type }));
      else f.set("text", text);
      const res = await fetch("/api/checkin", { method: "POST", body: f });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check-in failed");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="phone-shell stack" style={{ paddingInline: 16 }}>
        <div className="row spread wrap">
          <h2>Check-in</h2>
          <AthletePicker id={id} />
        </div>

        {!result && (
          <>
            <section className="card stack center" style={{ alignItems: "center", paddingBlock: 28 }} aria-labelledby="voice">
              <h3 id="voice">Talk for about 20 seconds</h3>
              <ol className="small muted" style={{ textAlign: "left", margin: 0, paddingLeft: 18 }}>
                {PROMPTS.map((p) => <li key={p}>{p}</li>)}
              </ol>
              <button
                className="btn"
                onClick={recording ? stopRec : startRec}
                aria-pressed={recording}
                aria-label={recording ? "Stop recording" : "Start recording"}
                style={{ width: 96, height: 96, borderRadius: 999, background: recording ? "var(--high)" : "var(--primary)", color: "#fff", boxShadow: recording ? "0 0 0 10px var(--high-container)" : "var(--shadow-2)", marginTop: 8 }}
              >
                {recording ? <IconStop size={34} /> : <IconMic size={36} />}
              </button>
              <div className="small" aria-live="polite">{recording ? `Recording… 0:${String(seconds).padStart(2, "0")}` : audio ? "Got it. Send it, or record again." : "Tap to record"}</div>
              {audio && !recording && (
                <div className="row wrap" style={{ justifyContent: "center" }}>
                  <audio controls src={URL.createObjectURL(audio)} style={{ height: 36 }} />
                  <button className="btn btn-filled" onClick={() => submit(true)} disabled={busy}>
                    {busy ? <span className="spinner" /> : null} Send check-in
                  </button>
                </div>
              )}
            </section>

            <section className="card flat stack" aria-labelledby="typed">
              <div className="row spread">
                <h4 id="typed">Or type it</h4>
                <button className="btn btn-text btn-sm" onClick={() => setText(EXAMPLE)}>Use an example</button>
              </div>
              <label htmlFor="ci-text" className="sr-only">Your check-in</label>
              <textarea id="ci-text" className="textarea" placeholder="e.g. Slept 7 hours, calves a little sore, 90-minute practice, no hits." value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn btn-tonal" onClick={() => submit(false)} disabled={busy || !text.trim()}>
                {busy ? <span className="spinner" /> : null} Send typed check-in
              </button>
            </section>
          </>
        )}

        {busy && <div className="row small muted" role="status"><span className="spinner" /> Gemini is reading your check-in…</div>}
        {error && <ErrorBanner message={error} />}

        {result && (
          <>
            {result.red_flag_message && (
              <div className="banner banner-emergency" role="alert"><IconAlert size={22} /><div>{result.red_flag_message}</div></div>
            )}
            <section className="card stack" aria-labelledby="got">
              <div className="row spread">
                <h3 id="got">Here's what we logged</h3>
                <span className="pill teal">{result.mode.startsWith("gemini") ? "Read by Gemini" : "Offline parser"}</span>
              </div>
              <div className="grid grid-2" style={{ "--gap": "10px" } as React.CSSProperties}>
                <Field icon={<IconMoon size={16} />} label="Sleep" value={result.checkin.sleep_h != null ? `${result.checkin.sleep_h} h` : "Not mentioned"} />
                <Field icon={<IconClock size={16} />} label="Practice" value={result.checkin.load_min != null ? `${result.checkin.load_min} min · ${result.checkin.intensity}` : result.checkin.intensity} />
              </div>
              <div>
                <div className="small muted">Sore areas</div>
                <div className="row wrap mt-8">
                  {result.checkin.soreness.length ? result.checkin.soreness.map((s) => <span key={s.area} className="chip">{prettyArea(s.area)} · {s.level}/3</span>) : <span className="small">None</span>}
                </div>
              </div>
              {result.checkin.symptoms.length > 0 && (
                <div>
                  <div className="small muted">Symptoms mentioned</div>
                  <div className="row wrap mt-8">{result.checkin.symptoms.map((s) => <span key={s} className="chip">{prettySymptom(s)}</span>)}</div>
                </div>
              )}
              <hr className="divider" />
              <div className="row spread">
                <span className="small">Today's status</span>
                <BandChip band={result.risk.band} />
              </div>
              {result.risk.flags.slice(0, 3).map((f) => <p key={f.rule_id + (f.area ?? "")} className="small muted">• {f.reason.replace(/^HitWatch: /, "")}</p>)}
            </section>
            {result.hitwatch_started && (
              <div className="banner banner-info" role="status"><IconPhone size={20} /><div>You mentioned a hit, so HitWatch is on: we'll call you once a day for a week to check how you feel. <Link href={`/athlete/hitwatch?id=${id}`}>See HitWatch</Link></div></div>
            )}
            <div className="row">
              <Link href={`/athlete?id=${id}`} className="btn btn-filled"><IconCheck size={18} /> Done</Link>
              <button className="btn btn-text" onClick={() => { setResult(null); setAudio(null); setText(""); }}>New check-in</button>
            </div>
          </>
        )}
      </div>
      <AthleteNav id={id} />
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 14, padding: "10px 12px" }}>
      <div className="row small muted" style={{ gap: 6 }}>{icon}{label}</div>
      <div className="strong mt-8" style={{ marginTop: 2 }}>{value}</div>
    </div>
  );
}

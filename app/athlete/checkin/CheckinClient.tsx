"use client";
import { useEffect, useRef, useState } from "react";
import { AthleteNav, AthletePicker } from "@/components/AthleteShell.tsx";
import { prettyArea, prettySymptom } from "@/components/ui.tsx";
import { CheckinError, CheckinResult } from "./CheckinResult.tsx";
import { BodyMap } from "@/components/BodyMap.tsx";
import { IconMic, IconStop } from "@/components/icons.tsx";
import type { CheckIn, RiskResult } from "@/shared/lib/index.ts";

interface Result {
  mode: string;
  checkin: CheckIn;
  summary: string;
  risk: RiskResult;
  red_flag_message: string | null;
}

const PROMPTS = ["How'd you sleep last night, roughly how many hours?", "Anything sore or tight? Where, and how bad, 0 to 3?", "How long and how hard was practice?"];
const EXAMPLE = "Slept about five and a half hours. My left hamstring's pretty tight, maybe a two. Practice was two hours and brutal, lots of sprints.";

export function CheckinClient({ id }: { id: string }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<"tap" | "talk">("tap");
  const [followup, setFollowup] = useState<{ question: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [sleepH, setSleepH] = useState(7.5);
  const [sore, setSore] = useState<Record<string, number>>({});
  const [minutes, setMinutes] = useState(90);
  const [effort, setEffort] = useState(6);
  const [acts, setActs] = useState<string[]>([]);
  const [meals, setMeals] = useState<boolean[]>([true, true, false]);
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

  async function submitTap() {
    setBusy(true);
    setError(null);
    try {
      const f = new FormData();
      f.set("athlete_id", id);
      f.set("structured", JSON.stringify({ sleep_h: sleepH, soreness: sore, load_min: minutes, effort, activities: acts, meals: meals.filter(Boolean).length, took_hit: false, symptoms: [] }));
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

  /** `reply` is set when answering (or skipping, with "") the agent's one follow-up question. */
  async function submit(useAudio: boolean, reply?: string) {
    setBusy(true);
    setError(null);
    try {
      const f = new FormData();
      f.set("athlete_id", id);
      if (useAudio && audio) f.set("audio", new File([audio], "checkin.webm", { type: audio.type }));
      else f.set("text", text);
      if (reply !== undefined && followup) {
        f.set("followup_done", "1");
        f.set("followup_question", followup.question);
        f.set("followup_answer", reply);
      }
      const res = await fetch("/api/checkin", { method: "POST", body: f });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check-in failed");
      if (body.mode === "followup") {
        setFollowup({ question: String(body.question) });
        setAnswer("");
        return;
      }
      setFollowup(null);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="phone-shell wide stack" style={{ paddingInline: 16 }}>
        <div className="row spread wrap">
          <div>
            <h2>Daily check-in</h2>
            <span className="pill teal" style={{ marginTop: 6 }}>Takes 60 seconds</span>
          </div>
          <AthletePicker id={id} />
        </div>

        {!result && (
          <div className="seg" role="group" aria-label="Check-in style" style={{ alignSelf: "flex-start" }}>
            <button aria-pressed={tab === "tap"} onClick={() => setTab("tap")}>Tap</button>
            <button aria-pressed={tab === "talk"} onClick={() => setTab("talk")}>Talk (Gemini)</button>
          </div>
        )}

        {!result && tab === "tap" && (
          <>
            <section className="card stack" style={{ "--gap": "8px" } as React.CSSProperties} aria-labelledby="sl">
              <div className="row spread"><strong id="sl">Sleep</strong><span className="strong">{sleepH} hrs</span></div>
              <input type="range" className="green" min={3} max={12} step={0.5} value={sleepH} onChange={(e) => setSleepH(Number(e.target.value))} aria-label="Hours slept" />
            </section>

            <section className="card stack" style={{ "--gap": "8px" } as React.CSSProperties} aria-labelledby="so">
              <div className="row spread">
                <strong id="so">Soreness</strong>
                <span className="small" style={{ color: Object.keys(sore).length ? "var(--mod)" : "var(--ink-3)", fontWeight: 700 }}>
                  {Object.keys(sore).length ? Object.entries(sore).map(([a, l]) => `${prettyArea(a)} ${l}/3`).join(", ") : "Tap where it's sore"}
                </span>
              </div>
              <BodyMap value={sore} onChange={setSore} />
              <p className="tiny muted center">Tap again for worse. A fourth tap clears it.</p>
            </section>

            <section className="card stack" style={{ "--gap": "10px" } as React.CSSProperties} aria-labelledby="pr">
              <div className="row spread"><strong id="pr">Practice</strong><span className="strong">{minutes} min</span></div>
              <input type="range" min={0} max={240} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Practice minutes" />
              <div className="row wrap" style={{ gap: 6 }}>
                {[["sprints", "Sprints"], ["lower_body_lift", "Lower body lift"], ["upper_body_lift", "Upper body lift"], ["scrimmage", "Scrimmage / game"], ["skills", "Skills"], ["conditioning", "Conditioning"]].map(([k, l]) => (
                  <button key={k} className="toggle-chip" aria-pressed={acts.includes(k)} onClick={() => setActs((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k])}>{l}</button>
                ))}
              </div>
              <div className="row spread"><span className="small muted">Effort</span><span className="strong">{effort}/10</span></div>
              <input type="range" min={1} max={10} step={1} value={effort} onChange={(e) => setEffort(Number(e.target.value))} aria-label="Effort from 1 to 10" />
            </section>

            <section className="card stack" style={{ "--gap": "8px" } as React.CSSProperties} aria-labelledby="me">
              <strong id="me">Meals eaten</strong>
              <div className="row" style={{ gap: 8 }}>
                {["Breakfast", "Lunch", "Dinner"].map((m, i) => (
                  <button key={m} className="meal" aria-pressed={meals[i]} aria-label={m} onClick={() => setMeals((x) => x.map((v, j) => (j === i ? !v : v)))}>
                    {m[0]}
                  </button>
                ))}
              </div>
            </section>

            <button className="btn btn-green btn-lg btn-block" onClick={submitTap} disabled={busy}>{busy ? <span className="spinner" /> : null} Submit</button>
          </>
        )}

        {!result && tab === "talk" && (
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
              <button className="btn btn-tonal" onClick={() => { setFollowup(null); submit(false); }} disabled={busy || !text.trim() || Boolean(followup)}>
                {busy ? <span className="spinner" /> : null} Send typed check-in
              </button>
            </section>

            {followup && (
              <section className="card stack" style={{ "--gap": "10px" } as React.CSSProperties} aria-labelledby="fu" aria-live="polite">
                <span className="pill teal" style={{ alignSelf: "flex-start" }}>One quick question</span>
                <strong id="fu">{followup.question}</strong>
                <label htmlFor="fu-answer" className="sr-only">Your answer</label>
                <input id="fu-answer" className="textarea" style={{ minHeight: 0 }} value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && answer.trim() && !busy) submit(false, answer.trim()); }} placeholder="Type a short answer" autoFocus />
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn btn-filled" onClick={() => submit(false, answer.trim())} disabled={busy || !answer.trim()}>Send answer</button>
                  <button className="btn btn-text" onClick={() => submit(false, "")} disabled={busy}>Skip</button>
                </div>
                <p className="tiny muted">Asked by the check-in agent (Google ADK). Nothing is guessed if you skip.</p>
              </section>
            )}
          </>
        )}

        {busy && <div className="row small muted" role="status"><span className="spinner" /> Gemini is reading your check-in…</div>}
        {error && <CheckinError message={error} />}

        {result && <CheckinResult id={id} result={result} onNew={() => { setResult(null); setAudio(null); setText(""); setFollowup(null); }} />}
      </div>
      <AthleteNav id={id} />
    </div>
  );
}

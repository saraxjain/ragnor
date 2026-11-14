"use client";
// What the athlete sees after a check-in (tap, spoken or typed): what we heard, a way to correct it, how today compares with their own
// normal, and why the status is what it is. Everything here is deterministic: no model call is made by this view or by "Update my check-in".
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { postJson, prettyArea, prettySymptom, useApi } from "@/components/ui.tsx";
import { BodyMap } from "@/components/BodyMap.tsx";
import { Sparkline } from "@/components/charts.tsx";
import { IconAlert, IconCheck, IconPhone, IconInfo } from "@/components/icons.tsx";
import { flagCopy } from "@/lib/flagCopy.ts";
import { buildStructured, changedFields, compareLoad, compareSleep, compareWearable, friendlyCheckinError, sorenessStreaks, streakSentence, speechText, toEditable, MIN_HISTORY_DAYS, type Comparison, type Editable } from "@/lib/checkinResult.ts";
import type { Athlete } from "@/lib/store.ts";
import type { CheckIn, RiskResult } from "@/shared/lib/index.ts";

export interface CheckinResultData {
  mode: string;
  checkin: CheckIn;
  summary: string;
  risk: RiskResult;
  red_flag_message: string | null;
}

const COMMON_SYMPTOMS = ["headache", "dizziness", "nausea", "light_sensitivity", "feeling_in_a_fog", "blurred_vision"];
const MORE_SYMPTOMS = ["pressure_in_head", "neck_pain", "balance_problems", "noise_sensitivity", "feeling_slowed_down", "difficulty_concentrating", "difficulty_remembering", "fatigue", "confusion", "drowsiness", "more_emotional", "irritability", "sadness", "nervous_anxious", "trouble_sleeping"];
const RED_FLAGS = ["worsening_headache", "repeated_vomiting", "seizure", "loss_of_consciousness", "increasing_confusion", "slurred_speech", "weakness_or_numbness", "unequal_pupils", "cannot_recognize_people_or_places", "neck_pain_severe"];
const gap = (n: number) => ({ "--gap": `${n}px` }) as React.CSSProperties;
const btnMin: React.CSSProperties = { minHeight: 44 };

export function CheckinError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { message: main, detail } = friendlyCheckinError(message);
  return (
    <div className="banner banner-error" role="alert">
      <IconAlert size={20} />
      <div style={{ flex: 1 }}>
        <div>{main}</div>
        {detail && <details className="small mt-8"><summary style={{ cursor: "pointer", minHeight: 24 }}>Technical details</summary><div className="muted" style={{ overflowWrap: "anywhere" }}>{detail}</div></details>}
      </div>
      {onRetry && <button className="btn btn-text btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function CheckinResult({ id, result, onNew }: { id: string; result: CheckinResultData; onNew: () => void }) {
  const quote = useRef(result.summary); // the update goes through the tap path, whose summary is not what the athlete said
  const [current, setCurrent] = useState<CheckinResultData>(result);
  const [edited, setEdited] = useState(false);
  const orig = useMemo(() => toEditable(current.checkin), [current.checkin]);
  const [edit, setEdit] = useState<Editable>(orig);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const api = useApi<{ athlete: Athlete; wearable_compare: unknown }>(`/api/athletes/${id}`);
  const a = api.data?.athlete;
  const changes = changedFields(orig, edit);

  async function update() {
    setBusy(true);
    setErr(null);
    try {
      const f = new FormData();
      f.set("athlete_id", id);
      f.set("structured", JSON.stringify(buildStructured(edit, current.checkin)));
      const res = await fetch("/api/checkin", { method: "POST", body: f });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      const next: CheckinResultData = { ...body, summary: quote.current, mode: current.mode };
      setCurrent(next);
      setEdit(toEditable(next.checkin));
      setEdited(true);
      setAnnounce(`Updated. Today's status is now ${next.risk.band === "high" ? "high" : next.risk.band === "moderate" ? "moderate" : "low"} risk.`);
      void api.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const c = current.checkin;
  const modePill = current.mode === "tap" ? "Tap check-in" : current.mode === "gemini_adk" ? "Read by Google ADK agent + Gemini" : current.mode.startsWith("gemini") ? "Read by Gemini" : "Offline parser";
  const set = (p: Partial<Editable>) => setEdit((e) => ({ ...e, ...p }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      {(c.red_flags.length > 0 || current.red_flag_message) && (
        <div className="banner banner-emergency" role="alert"><IconAlert size={22} /><div>{current.red_flag_message ?? "You mentioned an emergency sign. Tell a parent or adult right now and get medical care. In an emergency, call 911."}</div></div>
      )}

      {/* 1. What I heard */}
      <section className="card stack" style={gap(12)} aria-labelledby="heard">
        <div className="row spread wrap">
          <h3 id="heard">What I heard</h3>
          <span className="row" style={{ gap: 6 }}><span className="pill teal">{modePill}</span>{edited && <span className="pill">Edited by you</span>}</span>
        </div>
        <blockquote style={{ margin: 0, padding: "4px 0 4px 14px", borderLeft: "3px solid var(--primary)", fontSize: 17, lineHeight: 1.5 }}>
          {quote.current ? `"${quote.current}"` : "No summary was recorded."}
        </blockquote>
        <p className="small muted" style={{ margin: 0 }}>Something wrong? Fix it in the next section. Blank answers are things you didn't mention.</p>
      </section>

      {/* 2. Confirm and correct */}
      <section className="card stack" style={gap(18)} aria-labelledby="fix">
        <h3 id="fix">Confirm and correct</h3>

        <Row label="Sleep" value={edit.sleep_h != null ? `${edit.sleep_h} h` : null}>
          {edit.sleep_h != null
            ? <input type="range" className="green" min={3} max={12} step={0.5} value={edit.sleep_h} onChange={(e) => set({ sleep_h: Number(e.target.value) })} aria-label="Hours slept" style={btnMin} />
            : <Ask q="How many hours did you sleep last night?" onAnswer={() => set({ sleep_h: 7.5 })} />}
        </Row>

        <Row label="Practice minutes" value={edit.load_min != null ? `${edit.load_min} min` : null}>
          {edit.load_min != null
            ? <input type="range" min={0} max={240} step={15} value={edit.load_min} onChange={(e) => set({ load_min: Number(e.target.value) })} aria-label="Practice minutes" style={btnMin} />
            : <Ask q="How long was practice?" onAnswer={() => set({ load_min: 90 })} />}
        </Row>

        <Row label="Intensity" value={edit.intensity !== "unknown" ? edit.intensity : null}>
          {edit.intensity === "unknown" && <p className="small" style={{ margin: 0 }}>How hard was it?</p>}
          <div className="seg" role="group" aria-label="Practice intensity">
            {(["light", "moderate", "hard"] as const).map((v) => <button key={v} style={btnMin} aria-pressed={edit.intensity === v} onClick={() => set({ intensity: v })}>{v[0].toUpperCase() + v.slice(1)}</button>)}
          </div>
        </Row>

        <Row label="Sore areas" value={Object.keys(edit.soreness).length ? null : "None"}>
          <div className="stack" style={gap(8)}>
            {Object.entries(edit.soreness).map(([area, level]) => (
              <div key={area} className="row spread wrap" style={{ gap: 8 }}>
                <span className="strong">{prettyArea(area)}</span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="seg" role="group" aria-label={`${prettyArea(area)} level`}>
                    {[1, 2, 3].map((l) => <button key={l} style={{ minHeight: 44, minWidth: 44 }} aria-pressed={level === l} aria-label={`Level ${l} of 3`} onClick={() => set({ soreness: { ...edit.soreness, [area]: l } })}>{l}</button>)}
                  </span>
                  <button className="btn btn-text btn-sm" style={btnMin} aria-label={`Remove ${prettyArea(area)}`} onClick={() => { const n = { ...edit.soreness }; delete n[area]; set({ soreness: n }); }}>Remove</button>
                </span>
              </div>
            ))}
            <details>
              <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", fontWeight: 600 }}>Add or change on the body map</summary>
              <BodyMap value={edit.soreness} onChange={(n) => set({ soreness: n })} />
              <p className="tiny muted center">Tap again for worse. A fourth tap clears it.</p>
            </details>
          </div>
        </Row>

        <Row label="Took a hit to the head" value={null}>
          <div className="seg" role="group" aria-label="Hit to the head">
            <button style={btnMin} aria-pressed={!edit.took_hit} onClick={() => set({ took_hit: false })}>No</button>
            <button style={btnMin} aria-pressed={edit.took_hit} onClick={() => set({ took_hit: true })}>Yes</button>
          </div>
        </Row>

        <Row label="Symptoms" value={edit.symptoms.length ? null : "None"}>
          <div className="row wrap" style={{ gap: 6 }}>
            {[...new Set([...COMMON_SYMPTOMS, ...edit.symptoms])].map((s) => <button key={s} className="toggle-chip" style={btnMin} aria-pressed={edit.symptoms.includes(s)} onClick={() => set({ symptoms: toggle(edit.symptoms, s) })}>{prettySymptom(s)}</button>)}
          </div>
          <details>
            <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", fontWeight: 600 }}>More symptoms</summary>
            <div className="row wrap" style={{ gap: 6 }}>
              {MORE_SYMPTOMS.filter((s) => !edit.symptoms.includes(s)).map((s) => <button key={s} className="toggle-chip" style={btnMin} aria-pressed={false} onClick={() => set({ symptoms: toggle(edit.symptoms, s) })}>{prettySymptom(s)}</button>)}
            </div>
          </details>
        </Row>

        <Row label="Emergency signs" value={edit.red_flags.length ? null : "None"}>
          {orig.red_flags.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{orig.red_flags.map((s) => <span key={s} className="chip" style={{ minHeight: 44, borderColor: "var(--high)", color: "var(--high)" }}>{prettySymptom(s)}</span>)}</div>}
          {orig.red_flags.length > 0 && <p className="tiny muted" style={{ margin: 0 }}>These stay on your check-in. You can add more but not remove them here.</p>}
          <details>
            <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", fontWeight: 600 }}>Add an emergency sign</summary>
            <div className="row wrap" style={{ gap: 6 }}>
              {RED_FLAGS.filter((s) => !orig.red_flags.includes(s)).map((s) => <button key={s} className="toggle-chip" style={btnMin} aria-pressed={edit.red_flags.includes(s)} onClick={() => set({ red_flags: toggle(edit.red_flags, s) })}>{prettySymptom(s)}</button>)}
            </div>
          </details>
        </Row>

        {changes.length > 0 && (
          <div className="stack" style={gap(8)}>
            <button className="btn btn-filled btn-block" style={btnMin} onClick={update} disabled={busy}>{busy ? <span className="spinner" /> : null} Update my check-in</button>
            <span className="tiny muted center">Changed: {changes.join(", ")}</span>
          </div>
        )}
        {err && <CheckinError message={err} onRetry={update} />}
      </section>

      {/* 3. Comparison */}
      <Compare c={current.checkin} athlete={a} loading={api.loading && !a} />

      {/* 4. Why this status */}
      <section className="card stack" style={gap(12)} aria-labelledby="why">
        <h3 id="why">Why this status</h3>
        <div aria-live="polite" role="status">
          <div className="row wrap" style={{ gap: 12 }}>
            <span className={`band band-${current.risk.band}`} style={{ height: 40, fontSize: 18, fontWeight: 700, padding: "0 18px 0 14px" }}>{current.risk.band === "high" ? "High" : current.risk.band === "moderate" ? "Moderate" : "Low"} risk</span>
            <span className="small muted">{current.risk.flags.length ? `${current.risk.flags.length} thing${current.risk.flags.length === 1 ? "" : "s"} to know` : ""}</span>
          </div>
          <span className="sr-only">{announce}</span>
        </div>
        {current.risk.low_confidence && <MissingNote c={current.checkin} />}
        {current.risk.flags.length === 0 && <p style={{ margin: 0, fontSize: 17 }}>No rule fired today. Nothing in this check-in matched a risk rule.</p>}
        {current.risk.flags.map((f) => <FlagRow key={f.rule_id + (f.area ?? "")} id={id} flag={f} />)}
      </section>


      <ReadAloud current={current} />

      <div className="row">
        <Link href={`/athlete?id=${id}`} className="btn btn-filled" style={btnMin}><IconCheck size={18} /> Done</Link>
        <button className="btn btn-text" style={btnMin} onClick={onNew}>New check-in</button>
      </div>
    </>
  );
}

function Row({ label, value, children }: { label: string; value: string | null; children: React.ReactNode }) {
  return (
    <div className="stack" style={gap(8)}>
      <div className="row spread"><strong>{label}</strong>{value && <span className="strong">{value}</span>}</div>
      {children}
    </div>
  );
}

function Ask({ q, onAnswer }: { q: string; onAnswer: () => void }) {
  return (
    <div className="row spread wrap" style={{ gap: 8 }}>
      <span style={{ fontSize: 16 }}>{q}</span>
      <button className="btn btn-tonal btn-sm" style={btnMin} onClick={onAnswer}>Tell me</button>
    </div>
  );
}

function MissingNote({ c }: { c: CheckIn }) {
  const missing = [c.sleep_h == null && "sleep", c.load_min == null && "practice minutes", c.intensity === "unknown" && "how hard practice was"].filter(Boolean) as string[];
  return (
    <div className="banner banner-info" role="status"><IconInfo size={20} /><div>This status may be incomplete because key answers are missing{missing.length ? `: ${missing.join(", ")}` : ""}. Fill them in above and press Update.</div></div>
  );
}

function FlagRow({ id, flag }: { id: string; flag: RiskResult["flags"][number] }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const copy = flagCopy(flag);
  const panel = `flag-${flag.rule_id}-${flag.area ?? "all"}`;
  async function act(action: "got_it" | "tell_trainer") {
    setBusy(action);
    setErr(null);
    try {
      const r = await postJson<{ message: string }>("/api/flags", { athlete_id: id, rule_id: flag.rule_id, area: flag.area, action });
      setMsg(r.message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div style={{ border: "1px solid var(--outline)", borderRadius: 14, background: "var(--surface)" }}>
      <button aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)} className="row spread" style={{ width: "100%", minHeight: 48, padding: "10px 14px", background: "none", border: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", gap: 10 }}>
        <span><span className={`band band-${flag.band}`} style={{ marginRight: 8 }}>{flag.band}</span><strong>{copy.title}</strong></span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={panel} className="stack" style={{ ...gap(10), padding: "0 14px 14px" }}>
          <p style={{ margin: 0, fontSize: 16 }}><strong>Why:</strong> {flag.reason}</p>
          <p style={{ margin: 0, fontSize: 16 }}><strong>What it likely means:</strong> {copy.cause}. This is a flag to act on, not a medical decision.</p>
          <p style={{ margin: 0, fontSize: 16 }}><strong>Do today:</strong> {copy.athleteAction}</p>
          {msg ? <p className="small" role="status" style={{ margin: 0, color: "var(--low)" }}>{msg}</p> : (
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn btn-tonal" style={btnMin} onClick={() => act("got_it")} disabled={busy !== null}>{busy === "got_it" ? <span className="spinner" /> : null} Got it</button>
              <button className="btn btn-text" style={btnMin} onClick={() => act("tell_trainer")} disabled={busy !== null}>{busy === "tell_trainer" ? <span className="spinner" /> : null} Tell my trainer</button>
            </div>
          )}
          {err && <div className="small" role="alert" style={{ color: "var(--high)" }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

function Bars({ c }: { c: Comparison }) {
  if (!c.bar) return null;
  const max = Math.max(c.bar.value, c.bar.reference, 1);
  const rows: [string, number, string][] = [[c.bar.labels?.[0] ?? "Today", c.bar.value, "var(--primary)"], [c.bar.labels?.[1] ?? "Usual", c.bar.reference, "var(--outline)"]];
  return (
    <div className="stack" style={gap(4)} role="img" aria-label={`${c.title}: today ${c.bar.value} ${c.bar.unit}, usual ${c.bar.reference} ${c.bar.unit}`}>
      {rows.map(([l, v, col]) => (
        <div key={l} className="row" style={{ gap: 8 }}>
          <span className="tiny muted" style={{ width: 84 }}>{l}</span>
          <div style={{ flex: 1, background: "var(--surface-1)", borderRadius: 6, height: 10 }}><div style={{ width: `${Math.max(2, (v / max) * 100)}%`, height: 10, borderRadius: 6, background: col }} /></div>
          <span className="tiny strong" style={{ width: 64, textAlign: "right" }}>{v} {c.bar!.unit}</span>
        </div>
      ))}
    </div>
  );
}

function Compare({ c, athlete, loading }: { c: CheckIn; athlete?: Athlete; loading: boolean }) {
  const rows = useMemo(() => {
    if (!athlete) return [];
    const hist = athlete.checkins;
    const out: (Comparison & { spark?: (number | null)[] })[] = [];
    const days = [...hist.filter((x) => x.date !== c.date), c].sort((x, y) => x.date.localeCompare(y.date));
    out.push({ ...compareSleep(c, hist), spark: days.slice(-8).map((x) => x.sleep_h) });
    out.push({ ...compareLoad(c, hist), spark: days.slice(-14).map((x) => x.load_min) });
    const st = sorenessStreaks(c, hist);
    out.push({
      key: "soreness", title: "Soreness", bar: null,
      sentence: days.length < MIN_HISTORY_DAYS ? "Not enough history yet to spot soreness streaks. Keep checking in and this will fill in." : st.length ? st.map((s) => streakSentence(s, prettyArea(s.area))).join(" ") : "No area has been sore (2 or more of 3) two days in a row.",
    });
    const w = compareWearable(athlete.wearable.recent, athlete.wearable.baseline)[0];
    if (w) out.push({ ...w, spark: athlete.wearable.recent.map((d) => (w.key === "hrv" ? d.hrv_ms : d.rhr_bpm)) });
    else out.push({ key: "wearable", title: "Watch data", bar: null, sentence: "No watch data to compare yet, or not enough days to set your normal." });
    return out;
  }, [athlete, c]);
  return (
    <section className="card stack" style={gap(14)} aria-labelledby="cmp">
      <h3 id="cmp">How today compares to your normal</h3>
      {loading && <p className="small muted" style={{ margin: 0 }}>Loading your history...</p>}
      {rows.map((r) => (
        <div key={r.key} className="stack" style={gap(6)}>
          <div className="row spread"><strong>{r.title}</strong>{r.spark && r.spark.filter((x) => x != null).length >= 2 && <Sparkline values={r.spark} color="var(--primary)" width={96} height={28} />}</div>
          <Bars c={r} />
          <p style={{ margin: 0, fontSize: 16 }}>{r.sentence}</p>
        </div>
      ))}
    </section>
  );
}

function ReadAloud({ current }: { current: CheckinResultData }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);
  if (!supported) return null;
  function toggle() {
    const s = window.speechSynthesis;
    if (speaking) { s.cancel(); setSpeaking(false); return; }
    const first = current.risk.flags[0];
    const u = new SpeechSynthesisUtterance(speechText({ summary: current.summary, band: current.risk.band, firstAction: first ? flagCopy(first).athleteAction : null, redFlag: current.red_flag_message }));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    s.speak(u);
  }
  return <button className="btn btn-tonal" style={btnMin} aria-pressed={speaking} onClick={toggle}>{speaking ? "Stop reading" : "Read it to me"}</button>;
}

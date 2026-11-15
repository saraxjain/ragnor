"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { postJson } from "@/components/ui.tsx";
import { Ring } from "@/components/charts.tsx";
import { IconWatch, IconShield, IconHeart, IconSpark, IconLock, IconReport, IconPhone, IconCheck, IconVideo, IconPlay } from "@/components/icons.tsx";
import { TrustStrip } from "@/components/TrustStrip.tsx";
import { AGENT_NAME } from "@/lib/briefLabels.ts";
import type { Brief } from "@/lib/brief.ts";
import type { TrustReport } from "@/lib/trust.ts";
import { EngineDeeper, type ModelInfo } from "@/components/EngineDeeper.tsx";

interface TrustResp { athlete: { id: string; name: string; sport: string; grade: number; device: string }; trust: TrustReport; risk: { raw: { risk_7d: number; above_threshold: boolean }; trusted: { risk_7d: number; above_threshold: boolean } } }
interface ModelCard { metrics: { auroc: number; sensitivity: number; brier: number }; baseline_metrics: { sensitivity: number } }
interface EvalResp { report: { n: number; metrics: { red_flag_recall: number; band_accuracy: number; guardrail_violations: number; false_emergencies: number } } }

const PEOPLE = [
  { id: "ath_04", label: "Ava: alarming numbers that turn out to be a loose watch" },
  { id: "ath_01", label: "Maya: a real recovery problem hiding in noisy data" },
  { id: "ath_07", label: "Hannah: clean data, one clear issue" },
];
// The workflow shown on the left. `actor` says who does the work at that stage.
type Actor = "code" | "ai" | "human";
const STAGES: { title: string; actor: Actor; what: string }[] = [
  { title: "Collect", actor: "code", what: "Watch, check-ins and landing video come in" },
  { title: "Trust filter", actor: "code", what: "Was the watch really worn?" },
  { title: "Risk model", actor: "code", what: "Ten inputs, one estimate" },
  { title: "AI agents debate", actor: "ai", what: "Three analysts, a skeptic and a lead" },
  { title: "Safety check", actor: "code", what: "Fixed rules, not AI" },
  { title: "Clinician signs", actor: "human", what: "Nothing is sent before this" },
  { title: "Back to the athlete", actor: "human", what: "Plain words, never a diagnosis" },
];
const ACTOR_LABEL: Record<Actor, string> = { code: "Automatic", ai: "AI agents", human: "A person" };
const STAGE_ICON = [IconWatch, IconShield, IconHeart, IconSpark, IconLock, IconReport, IconPhone];
const AGENTS: { id: Brief["debate"][number]["agent"]; name: string; job: string; parallel?: boolean }[] = [
  { id: "signal", name: "Signal-quality", job: "Can these readings be trusted?", parallel: true },
  { id: "baseline", name: "Baseline", job: "How far from their own normal?", parallel: true },
  { id: "clinical", name: "Clinical-relevance", job: "Does it matter for care?", parallel: true },
  { id: "skeptic", name: "Skeptic", job: "Argues every finding is noise" },
  { id: "lead", name: "Lead", job: "Decides and writes the brief" },
];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The guided demo: one story, told in order. `focus` is what the page scrolls to; `say` is the presenter's line.
type Ctx = { t: TrustResp; b: Brief };
interface Scene { who: string; step: number; focus: "compare" | number; title: string; say: (c: Ctx) => string; sign?: boolean; reveal?: boolean }
const count = (b: Brief, s: string) => b.findings.filter((f) => f.status === s).length;
/** Nights this week where at least one reading was left out, and roughly how long the watch was on. */
function nightsOut(t: TrustResp) {
  const week = [...new Set(t.trust.readings.map((r) => r.date))].slice(-7);
  const bad = t.trust.readings.filter((r) => r.label === "unverified" && week.includes(r.date));
  const dates = [...new Set(bad.map((r) => r.date))];
  const worn = dates.length ? Math.round(bad.reduce((sum, r) => sum + r.wear_h, 0) / bad.length) : null;
  const hours = Object.fromEntries(week.map((d) => [d, t.trust.readings.find((r) => r.date === d)?.wear_h ?? 0]));
  return { week, dates, worn, hours };
}
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven"];
const nights = (n: number) => `${NUM[n] ?? n} night${n === 1 ? "" : "s"}`;
const SCENES: Scene[] = [
  { who: "ath_04", step: -1, focus: "compare", title: "Ava's week looks alarming", say: () => "But which nights are real?" },
  { who: "ath_04", step: 1, focus: 1, title: "Check every night", say: ({ t }) => `${nights(nightsOut(t).dates.length)} the watch was barely worn. Set aside.`.replace(/^./, (c) => c.toUpperCase()) },
  { who: "ath_04", step: 2, focus: 2, title: "Re-estimate the risk", say: ({ t }) => `${pct(t.risk.raw.risk_7d)} drops to ${pct(t.risk.trusted.risk_7d)}.` },
  { who: "ath_04", step: 3, focus: 3, title: "AI agents argue it out", say: ({ b }) => (count(b, "noise") === b.findings.length ? "Every finding ruled out. A false alarm." : `${count(b, "noise")} findings ruled out.`) },
  { who: "ath_01", step: 3, focus: 3, title: "Now Maya: a real problem", say: ({ b }) => (count(b, "noise") === 0 ? "Every finding survives the skeptic." : `${b.findings.length - count(b, "noise")} findings survive the skeptic.`) },
  { who: "ath_01", step: 4, focus: 4, title: "Safety is code, not AI", say: () => "Fixed rules check every word." },
  { who: "ath_01", step: 6, focus: 5, sign: true, title: "A clinician signs", say: () => "Nothing is sent without a person." },
  { who: "ath_01", step: 6, focus: 6, title: "Back to the athlete", say: () => "Plain words, never a diagnosis." },
  { who: "ath_01", step: 6, focus: "compare", reveal: true, title: "One page a clinician can trust", say: () => "A week of watch data in. One signed page out." },
];
const SCENE_MS = 5000; // how long each scene stays up when the story plays by itself

export function EngineLive({ model: modelInfo, geminiLive, geminiModel }: { model: ModelInfo; geminiLive: boolean; geminiModel: string }) {
  const [who, setWho] = useState(PEOPLE[0].id);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [trust, setTrust] = useState<TrustResp | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [shown, setShown] = useState(0);
  const [fhir, setFhir] = useState<string | null>(null);
  const [model, setModel] = useState<ModelCard | null>(null);
  const [evals, setEvals] = useState<EvalResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scene, setScene] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false); // the story advances by itself
  const [deep, setDeep] = useState(false);
  const [sel, setSel] = useState<"overview" | number | null>(null); // null = follow the run
  const splitRef = useRef<HTMLDivElement | null>(null);
  const deepRef = useRef<HTMLDetailsElement | null>(null);
  const cache = useRef(new Map<string, Ctx>());
  const token = useRef(0); // cancels a running animation when something else starts

  useEffect(() => {
    fetch("/api/model").then((r) => r.json()).then(setModel).catch(() => {});
    fetch("/api/evals").then((r) => r.json()).then(setEvals).catch(() => {});
  }, []);

  // Show a stage on the right. On a narrow screen the panes stack, so bring the detail into view.
  const scrollTo = useCallback((focus: "compare" | number) => {
    setSel(focus === "compare" ? "overview" : focus);
    const el = splitRef.current;
    if (el && (el.getBoundingClientRect().top < 0 || el.getBoundingClientRect().top > 130)) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // The raw week is free to load (no AI), so the "without Ragnor" side is always filled in.
  useEffect(() => {
    let on = true;
    fetch(`/api/trust/${who}`).then((r) => r.json()).then((t: TrustResp) => { if (on && t.athlete) setTrust(t); }).catch(() => {});
    return () => { on = false; };
  }, [who]);

  function pick(id: string) {
    token.current++;
    setWho(id); setStep(-1); setTrust(null); setBrief(null); setFhir(null); setShown(0); setErr(null); setSel(null);
  }

  async function playDebate(n: number, my: number) {
    for (let i = 1; i <= n; i++) { if (token.current !== my) return; setShown(i); await wait(700); }
  }

  /** Automatic run. `liveRun` calls Gemini; otherwise a recorded Gemini run is replayed when one fits. */
  async function run(liveRun: boolean, id = who) {
    const my = ++token.current;
    const ok = () => token.current === my;
    setScene(null); setAuto(false); setRunning(true); setErr(null); setBrief(null); setFhir(null); setShown(0); setStep(0);
    try {
      const t = (await (await fetch(`/api/trust/${id}`)).json()) as TrustResp;
      if (!ok()) return;
      setTrust(t); scrollTo(0);
      await wait(1300); if (!ok()) return; setStep(1); scrollTo(1);
      await wait(2200); if (!ok()) return; setStep(2); scrollTo(2);
      await wait(2000); if (!ok()) return; setStep(3); scrollTo(3);
      const b = (await postJson<{ brief: Brief }>(`/api/brief/${id}`, liveRun ? {} : { saved: true })).brief;
      if (!ok()) return;
      setBrief(b); cache.current.set(id, { t, b });
      await playDebate(b.debate.length, my);
      if (!ok()) return; setStep(4); scrollTo(4);
      await wait(1600); if (!ok()) return; setStep(5); scrollTo(5);
    } catch (e) { if (ok()) setErr(e instanceof Error ? e.message : "The run failed. Try again."); }
    finally { if (ok()) setRunning(false); }
  }

  async function sign(id = who) {
    await postJson(`/api/brief/${id}`, { decision: "sent", by: "Dr. Patel, Sports Medicine" });
    setFhir(JSON.stringify(await (await fetch(`/api/brief/${id}/fhir`)).json(), null, 2));
    setStep(6);
  }

  async function loadFor(id: string): Promise<Ctx> {
    const hit = cache.current.get(id);
    if (hit) return hit;
    const t = (await (await fetch(`/api/trust/${id}`)).json()) as TrustResp;
    const b = (await postJson<{ brief: Brief }>(`/api/brief/${id}`, { saved: true })).brief;
    const c = { t, b };
    cache.current.set(id, c);
    return c;
  }

  /** Guided demo: the presenter moves scene by scene; each scene sets the page to exactly what the line describes. */
  async function goScene(i: number) {
    if (i < 0 || i >= SCENES.length || busy) return;
    const my = ++token.current;
    const s = SCENES[i];
    setBusy(true); setRunning(false); setErr(null);
    try {
      const c = await loadFor(s.who);
      if (token.current !== my) return;
      setWho(s.who); setTrust(c.t); setBrief(c.b); setScene(i);
      if (s.sign) await sign(s.who); else if (s.step < 6) setFhir(null);
      setStep(s.step);
      const fresh = s.step === 3 && (scene == null || SCENES[scene].who !== s.who || SCENES[scene].step < 3);
      setShown(fresh ? 0 : c.b.debate.length);
      scrollTo(s.focus);
      if (fresh) void playDebate(c.b.debate.length, my);
    } catch (e) { setErr(e instanceof Error ? e.message : "The demo could not load. Try again."); setScene(null); }
    finally { setBusy(false); }
  }
  const endDemo = () => { token.current++; setScene(null); setAuto(false); };

  // The story plays itself: each scene holds for a few seconds (the debate scene waits until the agents have finished).
  const debateDone = !brief || shown >= brief.debate.length;
  useEffect(() => {
    if (!auto || scene == null || busy) return;
    if (SCENES[scene].step === 3 && !debateDone) return;
    if (scene >= SCENES.length - 1) { setAuto(false); return; }
    const t = setTimeout(() => void nav.current.goScene(scene + 1), SCENE_MS);
    return () => clearTimeout(t);
  }, [auto, scene, busy, debateDone]);
  const play = () => { setAuto(true); if (scene == null || scene >= SCENES.length - 1) void goScene(0); };

  // Arrow keys drive the guided demo.
  const nav = useRef({ scene, goScene, endDemo });
  nav.current = { scene, goScene, endDemo };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = nav.current;
      if (n.scene == null || (e.target as HTMLElement | null)?.closest("input, select, textarea")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); void n.goScene(n.scene + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); void n.goScene(n.scene - 1); }
      else if (e.key === "Escape") n.endDemo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openDeep() {
    setDeep(true);
    setTimeout(() => deepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  const a = trust?.athlete;
  const first = a?.name.split(" ")[0] ?? "the athlete";
  const sc = scene == null ? null : SCENES[scene];
  const ctx = trust && brief ? { t: trust, b: brief } : null;
  const showAfter = Boolean(brief) && (step >= 5 || Boolean(sc?.reveal));

  const view: "overview" | number = sel ?? (step < 0 || step > 6 ? "overview" : step);
  const out = trust ? nightsOut(trust) : null;
  const kept = brief ? brief.findings.length - count(brief, "noise") : 0;
  const verdict = (f: Brief["findings"][number]) => (f.status === "discuss" ? "Kept: discuss" : f.status === "watch" ? "Kept: watch" : "Ruled out");
  const tone = (f: Brief["findings"][number]) => (f.status === "discuss" ? "high" : f.status === "watch" ? "moderate" : "low");

  // One or two words per stage for the workflow on the left, shown once the run reaches it.
  const result: (string | null)[] = [
    trust && step >= 0 ? "3 sources in" : null,
    out && step >= 1 ? (out.dates.length ? `${out.dates.length} night${out.dates.length === 1 ? "" : "s"} set aside` : "Every night kept") : null,
    trust && step >= 2 ? (trust.risk.trusted.above_threshold ? "Worth a look" : "Typical") : null,
    brief && step >= 3 && shown >= brief.debate.length ? `${kept} kept · ${count(brief, "noise")} ruled out` : null,
    brief && step >= 4 ? (brief.safety.every((x) => x.passed) ? "Passed" : "Made more cautious") : null,
    brief && step >= 5 ? (fhir ? "Signed" : "Waiting") : null,
    fhir && step >= 6 ? "Sent" : null,
  ];
  const said = brief && step >= 3 ? brief.debate.slice(0, shown) : [];
  const talking = brief && step === 3 && shown > 0 && shown < brief.debate.length ? said.at(-1)?.agent : null;
  const debating = Boolean(brief) && step === 3 && shown < (brief?.debate.length ?? 0);

  const detail = (i: number): React.ReactNode => {
    if (step < i) return <p className="muted">Press Play to see this step.</p>;
    switch (i) {
      case 0: return a && (
        <>
          <div className="eng-sources">
            <div className="eng-source"><span className="eng-ico"><IconWatch size={26} /></span><div className="eng-source-t">{a.device}</div></div>
            <div className="eng-source"><span className="eng-ico"><IconCheck size={26} /></span><div className="eng-source-t">Daily check-in</div></div>
            <div className="eng-source"><span className="eng-ico"><IconVideo size={26} /></span><div className="eng-source-t">Landing video</div></div>
          </div>
        </>
      );
      case 1: return out && (
        <>
          <div className="eng-big">{out.dates.length ? <>{out.dates.length} of 7 nights set aside</> : <>Every night kept</>}</div>
          <div className="eng-nights" role="img" aria-label={`${7 - out.dates.length} nights kept, ${out.dates.length} set aside`}>
            {out.week.map((d) => {
              const bad = out.dates.includes(d);
              return (
                <div key={d} className={`eng-night ${bad ? "bad" : "ok"}`} title={`Worn about ${Math.round(out.hours[d])} hours`}>
                  <Ring value={Math.min(out.hours[d], 8)} max={8} size={62} stroke={7} color={bad ? "var(--high)" : "var(--eng-accent)"} track="var(--eng-track)" label="">
                    <span className="eng-night-mark">{bad ? "✕" : "✓"}</span>
                  </Ring>
                  <small>{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}</small>
                </div>
              );
            })}
          </div>
          <div className="eng-key"><span><i className="ok" /> Worn all night</span><span><i className="bad" /> Barely worn</span></div>
        </>
      );
      case 2: return trust && (
        <>
          <div className="eng-risk">
            <Ring value={Math.min(trust.risk.trusted.risk_7d, modelInfo.threshold * 2)} max={modelInfo.threshold * 2} size={176} stroke={16} color={trust.risk.trusted.above_threshold ? "var(--mod-fill)" : "var(--eng-accent)"} track="var(--eng-track)" label={`7-day injury risk ${pct(trust.risk.trusted.risk_7d)}`}>
              <div><div className="eng-risk-n">{pct(trust.risk.trusted.risk_7d)}</div><div className="tiny muted">7-day risk</div></div>
            </Ring>
            <div style={{ flex: 1, minWidth: 260 }}>
              <span className={`band band-${trust.risk.trusted.above_threshold ? "moderate" : "low"}`}>{trust.risk.trusted.above_threshold ? "Worth a look" : "Typical"}</span>
              {trust.risk.raw.risk_7d !== trust.risk.trusted.risk_7d && <div className="eng-was">was <s>{pct(trust.risk.raw.risk_7d)}</s></div>}
            </div>
          </div>
        </>
      );
      case 3: return brief && (
        <>
          <div className="eng-agents">
            {AGENTS.map((ag, k) => {
              const n = said.filter((m) => m.agent === ag.id).length;
              return <span key={ag.id} className="eng-agent-wrap">{k > 0 && <span className="eng-agent-arrow" aria-hidden="true">{ag.parallel ? "+" : "→"}</span>}<span className={`eng-agent ${n ? "spoke" : ""} ${talking === ag.id ? "talking" : ""}`}><strong>{ag.name}</strong></span></span>;
            })}
          </div>
          {debating ? <div className="eng-thinking"><span className="spinner" /> {talking ? `${AGENT_NAME[talking]} is speaking…` : "The agents are starting…"}</div> : (
            <div className="stack fade-in" style={{ "--gap": "10px" } as React.CSSProperties}>
              {brief.findings.map((f) => (
                <div key={f.id} className={`eng-verdict ${f.status === "noise" ? "out" : ""}`}>
                  <div className="row spread wrap" style={{ gap: 8 }}><span className="strong">{f.title}</span><span className={`band band-${tone(f)}`}>{verdict(f)}</span></div>
                </div>
              ))}
            </div>
          )}
          <details className="eng-more">
            <summary>Read the full debate</summary>
            <div className="stack mt-8" style={{ "--gap": "8px" } as React.CSSProperties}>
              {said.map((m, k) => <div key={k} className={`chat-msg agent-${m.agent}`}><span className="tiny strong">{AGENT_NAME[m.agent]}</span><div className="small">{m.text}</div></div>)}
            </div>
          </details>
          <div className="row wrap tiny muted" style={{ gap: 10, marginTop: 10 }}>
            <span>{brief.engine === "adk" ? "Google Agent Development Kit + Gemini" : "Offline agents (no Gemini key or quota)"}{brief.saved ? " · recorded run, replayed" : " · live run"}</span>
            {brief.saved && geminiLive && !sc && <button className="btn btn-text btn-sm" style={{ padding: "0 6px" }} onClick={() => void run(true)} disabled={running}>Run it live</button>}
          </div>
        </>
      );
      case 4: return brief && (
        <>
          <ul className="eng-checks">{brief.safety.map((x, k) => <li key={k} className={x.passed ? "ok" : "no"}>{x.name}</li>)}</ul>
        </>
      );
      case 5: return brief && (
        <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
          <div className="eng-brief">
            <div className="tiny muted">Pre-visit brief · {a?.name}</div>
            <div className="strong" style={{ fontSize: 18 }}>{brief.headline}</div>
            {brief.findings.map((f) => <div key={f.id} className="eng-finding"><span className={`band band-${tone(f)}`}>{f.status === "discuss" ? "Discuss" : f.status === "watch" ? "Watch" : "Ruled out"}</span><span>{f.title}</span></div>)}
          </div>
          {!fhir ? <div className="row wrap" style={{ gap: 8 }}><button className="btn btn-filled" onClick={() => void sign()}>Sign &amp; send to the health record</button><Link className="btn btn-outlined" href={`/clinician/patient/${who}`}>Open the full brief</Link></div>
            : <>
              <div className="eng-big" style={{ fontSize: 22 }}>✓ Signed and filed</div>
              <details className="eng-more"><summary>Show the filed record (FHIR)</summary><div className="code mt-8" style={{ maxHeight: 280, overflow: "auto" }}>{fhir}</div></details>
            </>}
        </div>
      );
      default: return trust && brief && (
        <div className="phone-preview small">
          {trust.trust.summary.unverified > 0 && <p>⌚ Your watch missed part of {trust.trust.summary.unverified >= 6 ? "two nights" : "a night"} this week, so we left those readings out. Try wearing it a finger-width above your wrist bone, snug but comfortable.</p>}
          {brief.findings.some((f) => f.id === "sleep" && f.status !== "noise") && <p>😴 You&apos;ve been short on sleep. Your doctor may ask about it at your visit.</p>}
          {brief.findings.some((f) => f.id === "pain" && f.status !== "noise") && <p>🦵 Your clinician has seen your soreness reports. Tell your coach if it gets worse.</p>}
          <p className="tiny muted">Reviewed by Dr. Patel.</p>
        </div>
      );
    }
  };

  const tiles = brief && out ? [
    { Icon: IconShield, t: out.dates.length ? `${out.dates.length} night${out.dates.length === 1 ? "" : "s"} set aside` : "Every night kept" },
    { Icon: IconSpark, t: `${kept} kept, ${count(brief, "noise")} ruled out` },
    { Icon: IconReport, t: fhir ? "Signed by a clinician" : "Waiting for a signature" },
  ] : [];
  const overview = showAfter && brief ? (
    <div className="eng-payoff fade-in">
      <div className="eng-brief">
        <div className="tiny muted">Pre-visit brief · {a?.name}</div>
        <div className="strong" style={{ fontSize: 18 }}>{brief.headline}</div>
        {brief.findings.map((f) => <div key={f.id} className="eng-finding"><span className={`band band-${tone(f)}`}>{f.status === "discuss" ? "Discuss" : f.status === "watch" ? "Watch" : "Ruled out"}</span><span>{f.title}</span></div>)}
        <div className="small muted">{fhir ? "✓ Signed by a clinician and filed." : "Waiting for a clinician to sign."}</div>
      </div>
      <div className="eng-tiles">
        {tiles.map(({ Icon, t }) => <div key={t} className="eng-tile"><span className="eng-ico"><Icon size={22} /></span><div className="eng-source-t">{t}</div></div>)}
      </div>
    </div>
  ) : (
    <>
      <div className="eng-nights" role="img" aria-label="Seven nights of watch data, all looking the same">
        {(out?.week ?? Array.from({ length: 7 }, (_, k) => String(k))).map((d) => (
          <div key={d} className="eng-night unknown">
            <Ring value={8} max={8} size={62} stroke={7} color="var(--surface-3)" track="var(--eng-track)" label="">
              <span className="eng-night-mark">?</span>
            </Ring>
            <small>{out ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }) : " "}</small>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="page eng"><div className="container stack" style={{ "--gap": "18px" } as React.CSSProperties}>
      <header className="eng-head">
        <div>
          <div className="eyebrow">Behind the scenes</div>
          <h1 className="eng-h1">From the watch to the doctor</h1>
        </div>
        <button className="btn btn-filled btn-lg" onClick={auto ? () => setAuto(false) : play} disabled={busy && !auto}>{auto ? <>Pause</> : <><IconPlay size={18} /> {scene != null && scene < SCENES.length - 1 ? "Resume" : "Play the story"}</>}</button>
      </header>
      {err && <p className="small" style={{ color: "var(--high)", margin: 0 }}>{err}</p>}

      <div className="stack" style={{ "--gap": "14px", scrollMarginTop: 80 } as React.CSSProperties} ref={splitRef}>
        {/* Who we are looking at, and the journey their data takes */}
        <section className="eng-top" aria-label="Workflow">
          <div className="eng-who">
            <Ring value={STAGES.filter((_, k) => step > k || (k === 6 && step === 6 && fhir)).length} max={7} size={64} stroke={7} color="var(--eng-accent)" track="var(--eng-track)" label={`${STAGES.filter((_, k) => step > k || (k === 6 && step === 6 && fhir)).length} of 7 steps done`}>
              <span className="eng-who-n">{STAGES.filter((_, k) => step > k || (k === 6 && step === 6 && fhir)).length}<small>/7</small></span>
            </Ring>
            <div style={{ minWidth: 0, flex: 1 }}>
              <select className="eng-select" value={who} onChange={(e) => { setScene(null); setAuto(false); pick(e.target.value); void run(false, e.target.value); }} disabled={running} aria-label="Athlete">
                {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.label.split(":")[0]}</option>)}
              </select>
              <div className="small muted">{a ? `${a.sport} · ${a.device}` : " "}</div>
            </div>
          </div>
          <ol className="eng-track">
            {STAGES.map((st, i) => {
              const state = step > i || (i === 6 && step === 6 && fhir) ? "done" : step === i ? "now" : "wait";
              const Icon = STAGE_ICON[i];
              return (
                <li key={st.title} className={`eng-li ${state}`}>
                  <button type="button" className={`eng-node ${state} ${view === i ? "sel" : ""}`} onClick={() => { setAuto(false); setSel(i); }} aria-current={view === i ? "step" : undefined}>
                    <span className="eng-dot" aria-hidden="true">{state === "done" ? <IconCheck size={18} /> : <Icon size={18} />}</span>
                    <span className="eng-node-t">{st.title}</span>
                    <span className="eng-node-s">{result[i] ?? ACTOR_LABEL[st.actor]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="eng-stage">
        <section className="card eng-detail">
          {sc && scene != null && (
            <div className="eng-cap" role="region" aria-label="Story">
              <span className="demo-dots">{SCENES.map((x, i) => <button key={i} type="button" aria-label={`Scene ${i + 1}: ${x.title}`} className={i === scene ? `now ${auto ? "run" : ""}` : i < scene ? "done" : ""} onClick={() => { setAuto(false); void goScene(i); }} />)}</span>
              <span className="eng-cap-who">{PEOPLE.find((p) => p.id === sc.who)?.label.split(":")[0]}</span>
            </div>
          )}
          {view === "overview" ? (
            <>
              <h2 className="eng-h2">{sc ? sc.title : showAfter ? "One page a clinician can trust" : "Seven nights. Which ones are real?"}</h2>
              <p className="eng-say" aria-live="polite">{sc && ctx ? sc.say(ctx) : " "}</p>
              {overview}
            </>
          ) : (
            <>
              <h2 className="eng-h2">{sc ? sc.title : STAGES[view].title}</h2>
              <p className="eng-say" aria-live="polite">{sc && ctx ? sc.say(ctx) : STAGES[view].what}</p>
              {detail(view)}
            </>
          )}
        </section>
        </div>
      </div>

      {/* Everything a technical judge might ask about, out of the way of the story */}
      <details ref={deepRef} className="engine-deep" open={deep} onToggle={(e) => setDeep((e.target as HTMLDetailsElement).open)} style={{ scrollMarginTop: 80 }}>
        <summary>
          <span>
            <span className="eyebrow">For technical questions</span>
            <span className="engine-deep-title">Under the hood: the coach-side agents, who decides what, and how we test it</span>
          </span>
          <span className="engine-deep-cue" aria-hidden="true">{deep ? "Hide" : "Open"}</span>
        </summary>
        {deep && (
          <div className="stack" style={{ "--gap": "18px", marginTop: 8 } as React.CSSProperties}>
            <EngineDeeper id={who} model={modelInfo} geminiLive={geminiLive} geminiModel={geminiModel} />
            {evals && <section className="card flat">
              <h3 style={{ marginTop: 0 }}>How we test it</h3>
              <p className="small">{evals.report.n} scripted check-ins run through the production pipeline on every change: <strong>{Math.round(evals.report.metrics.red_flag_recall * 100)}%</strong> of emergency signs caught, <strong>{evals.report.metrics.false_emergencies}</strong> false emergencies, <strong>{evals.report.metrics.guardrail_violations}</strong> unsafe phrases, <strong>{Math.round(evals.report.metrics.band_accuracy * 100)}%</strong> correct triage.</p>
            </section>}
          </div>
        )}
      </details>
    </div></div>
  );
}

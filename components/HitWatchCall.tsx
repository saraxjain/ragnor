"use client";
import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { postJson, BandChip } from "./ui.tsx";
import { IconPhone, IconCheck, IconAlert, IconHeadset, IconStop } from "./icons.tsx";
import { LogoMark } from "./Logo.tsx";

type Line = { role: "agent" | "athlete"; text: string };
type ToolCall = { name: string; args: Record<string, unknown>; result: unknown };
interface Decision { escalate: boolean; urgency: "routine" | "same_day" | "urgent"; reasons: string[]; symptom_total_today: number; symptom_total_baseline: number }

interface CallStart {
  mode: "phone" | "web" | "simulated";
  day: number;
  to?: string;
  agent_id?: string;
  signed_url?: string | null;
  dynamic_variables?: Record<string, string | number>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function HitWatchCall({ athleteId, athleteName, onDone, prefer }: { athleteId: string; athleteName: string; onDone?: () => void; prefer?: "phone" | "web" | "simulated" }) {
  const [phase, setPhase] = useState<"idle" | "starting" | "ringing" | "live" | "processing" | "done" | "error">("idle");
  const [start, setStart] = useState<CallStart | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [engine, setEngine] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const first = athleteName.split(" ")[0];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines, tools]);

  async function begin(mode?: "phone" | "web" | "simulated") {
    setPhase("starting");
    setError(null);
    setLines([]);
    setTools([]);
    setDecision(null);
    try {
      const s = await postJson<CallStart>("/api/hitwatch/call", { athlete_id: athleteId, prefer: mode ?? prefer });
      setStart(s);
      if (s.mode === "simulated") await runSimulated(s.day);
      else if (s.mode === "phone") await waitForPhone(s.day);
      else setPhase("live");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the call.");
      setPhase("error");
    }
  }

  async function runSimulated(day: number) {
    setPhase("ringing");
    await sleep(1400);
    setPhase("live");
    const res = await postJson<{ transcript: Line[]; run: { mode: string; tool_calls: ToolCall[]; decision: Decision | null } }>("/api/hitwatch/simulate", { athlete_id: athleteId, day });
    for (const l of res.transcript) {
      setLines((x) => [...x, l]);
      await sleep(l.role === "agent" ? 900 : 700);
    }
    setPhase("processing");
    setEngine(res.run.mode === "adk" ? "Google ADK agent + Gemini" : res.run.mode === "gemini" ? "Gemini function calling" : "Rules engine (offline)");
    for (const t of res.run.tool_calls) {
      await sleep(550);
      setTools((x) => [...x, t]);
    }
    setDecision(res.run.decision);
    setPhase("done");
    onDone?.();
  }

  async function waitForPhone(day: number) {
    setPhase("ringing");
    for (let i = 0; i < 90; i++) {
      await sleep(3000);
      const r = await fetch(`/api/athletes/${athleteId}`, { cache: "no-store" }).then((x) => x.json());
      const call = r.athlete?.hitwatch?.calls?.find((c: { day: number }) => c.day === day);
      if (call) {
        setLines(call.transcript ?? []);
        setDecision(r.athlete.hitwatch.today_decision);
        setEngine("ElevenLabs phone call + Gemini");
        setPhase("done");
        onDone?.();
        return;
      }
    }
    setError("The call hasn't reported back yet. Check the ElevenLabs dashboard, or try again.");
    setPhase("error");
  }

  return (
    <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
      {phase === "idle" && (
        <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <button className="btn btn-filled btn-lg btn-block" onClick={() => begin()}>
            <IconPhone size={20} /> Start today's HitWatch call
          </button>
          <div className="row wrap" style={{ justifyContent: "center", gap: 4 }}>
            <button className="btn btn-text btn-sm" onClick={() => begin("simulated")}>Run the scripted demo call</button>
            <button className="btn btn-text btn-sm" onClick={() => begin("web")}>Talk in the browser</button>
          </div>
        </div>
      )}

      {(phase === "starting" || phase === "ringing") && (
        <div className="card tonal center stack" style={{ alignItems: "center", padding: 24 }} aria-live="polite">
          <div className="pulse"><LogoMark size={52} /></div>
          <strong>{phase === "starting" ? "Connecting…" : start?.mode === "phone" ? `Calling ${first} at ${start.to}…` : `Calling ${first}…`}</strong>
          <span className="small muted">Day {start?.day ?? "?"} of 7 · HitWatch</span>
        </div>
      )}

      {phase === "live" && start?.mode === "web" && start.agent_id && (
        <ConversationProvider>
          <WebCall start={start} athleteId={athleteId} onLine={(l) => setLines((x) => [...x, l])} onTool={(t) => setTools((x) => [...x, t])}
            onEnd={async () => {
              setPhase("processing");
              const r = await fetch(`/api/athletes/${athleteId}`, { cache: "no-store" }).then((x) => x.json());
              setDecision(r.athlete?.hitwatch?.today_decision ?? null);
              setEngine("ElevenLabs voice + Gemini");
              setPhase("done");
              onDone?.();
            }}
          />
        </ConversationProvider>
      )}

      {lines.length > 0 && (
        <div className="card flat">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 8 }}><IconHeadset size={18} /><strong className="small">Call transcript</strong></div>
            {phase === "live" && <span className="pill live"><span className="dot pulse" /> On call</span>}
          </div>
          <div className="transcript" aria-live="polite">
            {lines.map((l, i) => (
              <div key={i} className={`bubble ${l.role}`}>{l.text}</div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {tools.length > 0 && (
        <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
          <div className="row spread">
            <strong className="small">What the agent did</strong>
            {engine && <span className="pill teal">{engine}</span>}
          </div>
          {tools.map((t, i) => (
            <div key={i} className="toolcall">
              <span className="fn">{t.name}</span>({summarizeArgs(t)}){"\n"}→ {summarizeResult(t)}
            </div>
          ))}
        </div>
      )}

      {phase === "processing" && <div className="row small muted"><span className="spinner" /> Checking against {first}'s baseline…</div>}

      {phase === "done" && decision && (
        <div className={`banner ${decision.escalate ? (decision.urgency === "urgent" ? "banner-emergency" : "banner-warn") : "banner-success"}`} role="status">
          {decision.escalate ? <IconAlert size={20} /> : <IconCheck size={20} />}
          <div className="stack" style={{ "--gap": "6px" } as React.CSSProperties}>
            <strong>
              {decision.escalate
                ? decision.urgency === "urgent" ? "Urgent: alert drafted for staff right now" : "Same-day alert drafted, waiting for a coach to approve"
                : "No change from baseline today"}
            </strong>
            {decision.reasons.map((r) => <span key={r} className="small">• {r}</span>)}
            <span className="tiny" style={{ opacity: 0.8 }}>Nothing is sent to a parent or clinician until a person approves it.</span>
          </div>
        </div>
      )}

      {phase === "done" && (
        <button className="btn btn-outlined" onClick={() => { setPhase("idle"); setLines([]); setTools([]); setDecision(null); }}>Done</button>
      )}

      {phase === "error" && error && (
        <div className="banner banner-error" role="alert">
          <IconAlert size={20} />
          <div style={{ flex: 1 }}>{error}</div>
          <button className="btn btn-text btn-sm" onClick={() => begin("simulated")}>Use the demo call</button>
        </div>
      )}
    </div>
  );
}

function WebCall({ start, athleteId, onLine, onTool, onEnd }: { start: CallStart; athleteId: string; onLine: (l: Line) => void; onTool: (t: ToolCall) => void; onEnd: () => void }) {
  const base = { athlete_id: athleteId, hit_id: start.dynamic_variables?.hit_id, day: start.day };
  const callTool = (name: string) => async (params: Record<string, unknown>) => {
    const args = { ...base, ...params };
    const res = await fetch(`/api/hitwatch/tools/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
    const result = await res.json();
    onTool({ name, args, result });
    return JSON.stringify(result);
  };
  const ended = useRef(false);
  const conv = useConversation({
    clientTools: {
      log_symptoms: callTool("log_symptoms"),
      compare_to_baseline: callTool("compare_to_baseline"),
      draft_alert: callTool("draft_alert"),
      schedule_followup: callTool("schedule_followup"),
    },
    onMessage: (m) => onLine({ role: m.source === "ai" ? "agent" : "athlete", text: m.message }),
    onDisconnect: () => {
      if (!ended.current) {
        ended.current = true;
        onEnd();
      }
    },
  });
  const started = useRef(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        if (start.signed_url) conv.startSession({ signedUrl: start.signed_url, dynamicVariables: start.dynamic_variables });
        else conv.startSession({ agentId: start.agent_id!, connectionType: "webrtc", dynamicVariables: start.dynamic_variables });
      } catch {
        setErr("Microphone access is needed for a browser call. Allow the mic, or use the scripted demo call.");
      }
    })();
  }, [conv, start]);

  return (
    <div className="card tonal row spread">
      <div className="row">
        <span className={conv.isSpeaking ? "pulse" : ""}><LogoMark size={40} /></span>
        <div>
          <strong>{conv.status === "connected" ? (conv.isSpeaking ? "Ragnor is speaking" : "Listening…") : "Connecting to the voice agent…"}</strong>
          <div className="small muted">{err ?? "Answer out loud, like a real check-in call."}</div>
        </div>
      </div>
      <button className="btn btn-danger" onClick={() => conv.endSession()}><IconStop size={16} /> End call</button>
    </div>
  );
}

function summarizeArgs(t: ToolCall) {
  const a = t.args as Record<string, unknown>;
  if (t.name === "log_symptoms") {
    const s = (a.symptoms as { name: string; severity: number }[] | undefined) ?? [];
    return `day=${a.day}, ${s.map((x) => `${x.name}:${x.severity}`).join(", ")}${(a.red_flags as string[] | undefined)?.length ? `, red_flags=${(a.red_flags as string[]).join("|")}` : ""}`;
  }
  if (t.name === "draft_alert") return `urgency=${a.urgency}, to=${(a.recipients_suggested as string[] | undefined)?.join("+")}`;
  if (t.name === "schedule_followup") return `${String(a.when_iso ?? "").slice(0, 16)}`;
  return `day=${a.day}`;
}

function summarizeResult(t: ToolCall) {
  const r = t.result as Record<string, unknown>;
  if (!r) return "ok";
  if (r.error) return `error: ${r.error}`;
  if (t.name === "log_symptoms") return `saved · symptom total ${r.symptom_total}`;
  if (t.name === "compare_to_baseline") return `${r.escalate ? `ESCALATE (${r.urgency})` : "no escalation"} · total ${r.symptom_total_today} vs preseason ${r.symptom_total_baseline}`;
  if (t.name === "draft_alert") return `draft ${r.alert_id} · waiting for approval`;
  if (t.name === "schedule_followup") return "next call scheduled";
  return JSON.stringify(r).slice(0, 120);
}

export { BandChip };

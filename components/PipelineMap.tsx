"use client";
// A picture of the whole pipeline: what goes in, who handles each stage (code, AI or a person), and what comes out.
// Stages light up as the live run reaches them, and each stage shows its real result underneath.

type Actor = "code" | "ai" | "human";
const ACTOR: Record<Actor, { label: string; fill: string; stroke: string; ink: string }> = {
  code: { label: "Fixed code", fill: "var(--surface-2)", stroke: "var(--teal)", ink: "var(--ink)" },
  ai: { label: "AI agents (Gemini)", fill: "var(--primary-container)", stroke: "var(--primary)", ink: "var(--on-primary-container)" },
  human: { label: "A person decides", fill: "var(--high-container)", stroke: "var(--high)", ink: "var(--ink)" },
};

export interface PipelineLive {
  collect?: string;
  trust?: string;
  excluded?: string;
  risk?: string;
  debate?: string;
  safety?: string;
  clinician?: string;
  athlete?: string;
}

const W = 1240;
const H = 318;
const MID = 138;

export function PipelineMap({ step, live, onPick }: { step: number; live: PipelineLive; onPick: (i: number) => void }) {
  const idle = step < 0;
  const cls = (i: number) => `pm-node ${idle || step >= i ? "on" : ""} ${step === i ? "now" : ""}`;
  const edge = (i: number) => `pm-edge ${!idle && step >= i ? "flow" : ""} ${idle || step >= i ? "on" : ""}`;
  const pick = (i: number) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: () => onPick(i),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(i); } },
  });

  const Box = ({ i, x, w, title, sub, actor, value, h = 76 }: { i: number; x: number; w: number; title: string; sub: string; actor: Actor; value?: string; h?: number }) => {
    const a = ACTOR[actor];
    return (
      <g className={cls(i)} {...pick(i)} aria-label={`Step ${i + 1}: ${title}. ${sub}. ${a.label}.${value ? ` Result: ${value}.` : ""}`}>
        <rect x={x} y={MID - h / 2} width={w} height={h} rx="14" fill={a.fill} stroke={a.stroke} strokeWidth="1.5" />
        <circle cx={x + 16} cy={MID - h / 2 + 16} r="10" fill={a.stroke} />
        <text x={x + 16} y={MID - h / 2 + 20} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#fff">{i + 1}</text>
        <text x={x + w / 2} y={MID + 2} textAnchor="middle" fontSize="14.5" fontWeight="700" fill={a.ink}>{title}</text>
        <text x={x + w / 2} y={MID + 20} textAnchor="middle" fontSize="11.5" fill="var(--ink-2)">{sub}</text>
        {value && <text x={x + w / 2} y={MID + h / 2 + 20} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)" className="pm-value">{value}</text>}
      </g>
    );
  };
  const Arrow = ({ i, x1, x2, y1 = MID, y2 = MID }: { i: number; x1: number; x2: number; y1?: number; y2?: number }) => (
    <line className={edge(i)} x1={x1} y1={y1} x2={x2 - 5} y2={y2} markerEnd="url(#pm-arrow)" />
  );
  const Agent = ({ x, y, name, r = 25 }: { x: number; y: number; name: string; r?: number }) => (
    <g>
      <circle cx={x} cy={y} r={r} fill="var(--surface)" stroke="var(--primary)" strokeWidth="1.5" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--on-primary-container)">{name}</text>
    </g>
  );

  const inputs = [
    { y: 62, label: "Watch readings" },
    { y: MID, label: "Daily check-in" },
    { y: 214, label: "Landing video" },
  ];

  return (
    <div className="pm-wrap">
      <div className="pm-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="pm-svg" role="group" aria-label="Diagram of the pipeline from watch to clinician. Select a stage to jump to it.">
          <defs>
            <marker id="pm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)" />
            </marker>
          </defs>

          {/* 1. What goes in */}
          <g className={cls(0)} {...pick(0)} aria-label={`Step 1: Collect. Watch readings, daily check-ins and landing videos come in.${live.collect ? ` ${live.collect}.` : ""}`}>
            {inputs.map((s) => (
              <g key={s.label}>
                <rect x="8" y={s.y - 21} width="132" height="42" rx="12" fill="var(--surface)" stroke="var(--outline)" strokeWidth="1.5" />
                <text x="74" y={s.y + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--ink)">{s.label}</text>
              </g>
            ))}
            <text x="74" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink-3)" letterSpacing=".06em">1 · WHAT GOES IN</text>
            {live.collect && <text x="74" y="258" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)" className="pm-value">{live.collect}</text>}
          </g>
          {inputs.map((s) => <Arrow key={s.label} i={1} x1={140} x2={184} y1={s.y} y2={s.y === MID ? MID : s.y < MID ? MID - 18 : MID + 18} />)}

          {/* 2. Trust filter, with the reject bin */}
          <Box i={1} x={184} w={150} title="Trust filter" sub="Was it really worn?" actor="code" value={live.trust} />
          <line className={edge(1)} x1={259} y1={MID + 38 + (live.trust ? 28 : 0)} x2={259} y2={266} strokeDasharray="4 4" markerEnd="url(#pm-arrow)" />
          <g className={cls(1)}>
            <rect x="184" y="272" width="150" height="36" rx="10" fill="var(--surface)" stroke="var(--outline)" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x="259" y="294" textAnchor="middle" fontSize="11.5" fill="var(--ink-2)">{live.excluded ?? "Unreliable readings left out"}</text>
          </g>
          <Arrow i={2} x1={334} x2={372} />

          {/* 3. Risk model */}
          <Box i={2} x={372} w={140} title="Risk model" sub="10 inputs, 1 estimate" actor="code" value={live.risk} />
          <Arrow i={3} x1={512} x2={548} />

          {/* 4. The agents */}
          <g className={cls(3)} {...pick(3)} aria-label={`Step 4: AI agents debate. Three analysts work in parallel, a skeptic challenges them, and a lead writes the brief.${live.debate ? ` Result: ${live.debate}.` : ""}`}>
            <rect x="548" y="22" width="298" height="232" rx="18" fill="var(--primary-container)" stroke="var(--primary)" strokeWidth="1.5" />
            <circle cx="566" cy="40" r="10" fill="var(--primary)" />
            <text x="566" y="44" textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#fff">4</text>
            <text x="584" y="44.5" fontSize="13.5" fontWeight="700" fill="var(--on-primary-container)">AI agents debate</text>
            {[78, MID, 198].map((y) => <line key={y} x1={617} y1={y} x2={677} y2={MID + (y - MID) * 0.25} stroke="var(--primary)" strokeWidth="1.5" opacity=".6" />)}
            <line x1={731} y1={MID} x2={765} y2={MID} stroke="var(--primary)" strokeWidth="1.5" opacity=".6" markerEnd="url(#pm-arrow)" />
            <Agent x={592} y={78} name="Signal" />
            <Agent x={592} y={MID} name="Baseline" />
            <Agent x={592} y={198} name="Clinical" />
            <Agent x={704} y={MID} name="Skeptic" r={27} />
            <Agent x={796} y={MID} name="Lead" r={27} />
            <text x={592} y={240} textAnchor="middle" fontSize="10.5" fill="var(--on-primary-container)">3 analysts</text>
            <text x={704} y={186} textAnchor="middle" fontSize="10.5" fill="var(--on-primary-container)">argues it is noise</text>
            <text x={796} y={186} textAnchor="middle" fontSize="10.5" fill="var(--on-primary-container)">writes the brief</text>
            {live.debate && <text x="697" y="274" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)" className="pm-value">{live.debate}</text>}
          </g>
          <Arrow i={4} x1={846} x2={880} />

          {/* 5-7 */}
          <Box i={4} x={880} w={112} title="Safety check" sub="Rules, not AI" actor="code" value={live.safety} />
          <Arrow i={5} x1={992} x2={1022} />
          <Box i={5} x={1022} w={104} title="Clinician" sub="Reads and signs" actor="human" value={live.clinician} />
          <Arrow i={6} x1={1126} x2={1150} />
          <Box i={6} x={1150} w={84} title="Athlete" sub="Plain words" actor="human" value={live.athlete} />
        </svg>
      </div>
      <div className="row wrap tiny pm-legend" style={{ gap: 16 }}>
        {(Object.keys(ACTOR) as Actor[]).map((k) => (
          <span key={k} className="row" style={{ gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: ACTOR[k].fill, border: `1.5px solid ${ACTOR[k].stroke}`, display: "inline-block" }} aria-hidden="true" />
            {ACTOR[k].label}
          </span>
        ))}
        <span className="muted">{idle ? "Run the pipeline to watch each stage light up. Select a stage to jump to it." : "Select a stage to jump to its details."}</span>
      </div>
    </div>
  );
}

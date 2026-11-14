// Inline SVG architecture diagram. Colours come from CSS variables (see globals.css), so it reads in light and dark.
import type { ReactNode } from "react";

type Variant = "built" | "ai" | "planned" | "safety";

function Box({ x, y, w = 150, h = 64, title, lines = [], variant = "built" }: { x: number; y: number; w?: number; h?: number; title: string; lines?: string[]; variant?: Variant }) {
  const cls = variant === "built" ? "box" : `box ${variant}`;
  return (
    <g>
      <rect className={cls} x={x} y={y} width={w} height={h} rx={9} />
      <text x={x + w / 2} y={y + 22} textAnchor="middle" fontWeight={700}>
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} className="sub" x={x + w / 2} y={y + 39 + i * 14} textAnchor="middle">
          {l}
        </text>
      ))}
    </g>
  );
}

function Arrow({ d, ai = false }: { d: string; ai?: boolean }) {
  return <path className={ai ? "arrow ai" : "arrow"} d={d} markerEnd={`url(#${ai ? "head-ai" : "head"})`} />;
}

function Lane({ y, children }: { y: number; children: ReactNode }) {
  return (
    <text className="lane" x={20} y={y}>
      {children}
    </text>
  );
}

export function Architecture() {
  return (
    <div>
      <div className="diagram-wrap" tabIndex={0} role="region" aria-label="System architecture diagram (scrolls sideways on small screens)">
        <svg className="diagram" viewBox="0 0 1000 620" role="img" aria-labelledby="arch-title arch-desc">
          <title id="arch-title">Ragnor system architecture</title>
          <desc id="arch-desc">
            Inputs: daily check-in, landing-check result from the video pipeline, wearables (mock by default, Google Health provider built but unverified), a simulated mouthguard impact
            webhook, and the HitWatch voice agent tools. All pass validation, the data layer (demo store or Firestore, server-only), the versioned rules engine and a flags and audit log, then a
            human approval queue. Athletes see their own flags immediately; the reviewer sees everything; coaches and parents see only approved alerts. The Gemini agent panel branches from the
            rules result: de-identified case brief, three debaters over two rounds, moderator, guardrail that keeps the level equal to the rules level, and an explanation for the reviewer.
            Planned: notifications, real sign-in, the video pipeline itself, Search grounding, clinician review.
          </desc>
          <defs>
            <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path className="head" d="M0 0 L10 5 L0 10 z" />
            </marker>
            <marker id="head-ai" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path className="head ai" d="M0 0 L10 5 L0 10 z" />
            </marker>
            <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="var(--surface)" />
              <line className="hatch-line" x1="0" y1="0" x2="0" y2="8" />
            </pattern>
          </defs>

          <Lane y={26}>1. Inputs (all validated server-side)</Lane>
          <Box x={20} y={42} w={180} h={62} title="Check-in" lines={["Form + shared shape", "POST /api/ingest/checkin"]} />
          <Box x={220} y={42} w={180} h={62} title="Landing result" lines={["From the video pipeline", "POST /api/ingest/landing"]} />
          <Box x={420} y={42} w={180} h={62} title="Wearables" lines={["Mock by default;", "Google Health: unverified"]} />
          <Box x={620} y={42} w={180} h={62} title="Impact webhook" lines={["Simulated mouthguard,", "secret + idempotent"]} />
          <Box x={820} y={42} w={160} h={62} title="HitWatch tools" lines={["ElevenLabs agent;", "needs your setup"]} />
          <path className="arrow" d="M110 104 V124 M310 104 V124 M510 104 V124 M710 104 V124 M900 104 V124 M110 124 H900" />
          <Arrow d="M110 124 V143" />

          <Box x={20} y={145} w={140} h={64} title="Validation" lines={["Ranges, shapes,", "secrets"]} />
          <Box x={180} y={145} w={160} h={64} title="Data layer" lines={["Demo store / Firestore", "Consent gate (minors)"]} />
          <Box x={360} y={145} w={150} h={64} title="Rules engine" lines={["Pure, versioned,", "decides the level"]} variant="safety" />
          <Box x={530} y={145} w={140} h={64} title="Flags + audit" lines={["Rule id, version,", "inputs; append-only"]} />
          <Box x={690} y={145} w={290} h={64} title="Human approval queue" lines={["Reviewer approves or dismisses;", "every action is audit-logged"]} variant="safety" />
          <Arrow d="M160 177 H178" />
          <Arrow d="M340 177 H358" />
          <Arrow d="M510 177 H528" />
          <Arrow d="M670 177 H688" />

          <Lane y={240}>2. Gemini agent panel (explains; never decides the level)</Lane>
          <Box x={380} y={256} w={110} h={70} title="Case brief" lines={["De-identified:", "numbers + labels"]} variant="ai" />
          <Box x={258} y={256} w={110} h={70} title="3 debaters" lines={["Load, symptoms,", "sceptic; 2 rounds"]} variant="ai" />
          <Box x={136} y={256} w={110} h={70} title="Moderator" lines={["Explanation,", "focus, confidence"]} variant="ai" />
          <Box x={14} y={256} w={110} h={70} title="Guardrail" lines={["Final level =", "rules level"]} variant="safety" />
          <Arrow d="M435 209 V254" ai />
          <Arrow d="M378 291 H370" ai />
          <Arrow d="M256 291 H248" ai />
          <Arrow d="M134 291 H126" ai />

          <Lane y={356}>3. Who sees what</Lane>
          <path className="arrow" d="M835 209 V384 H120 M120 384 V401 M340 384 V401 M560 384 V401 M780 384 V401" />
          <Box x={20} y={402} w={200} h={66} title="Athlete" lines={["Own flags and urgent", "guidance immediately"]} />
          <Box x={240} y={402} w={200} h={66} title="Reviewer (trainer)" lines={["Queue, roster, HitWatch", "timeline, due today"]} />
          <Box x={460} y={402} w={200} h={66} title="Coach" lines={["Approved alerts only:", "reason + source"]} />
          <Box x={680} y={402} w={200} h={66} title="Parent" lines={["Consent + approved", "alerts for the minor"]} />

          <Lane y={506}>4. Planned or not verified</Lane>
          <Box x={20} y={522} w={175} h={64} title="Notifications / SMS" lines={["Would push approved", "alerts"]} variant="planned" />
          <Box x={210} y={522} w={175} h={64} title="Real sign-in" lines={["Replaces the demo", "role picker"]} variant="planned" />
          <Box x={400} y={522} w={175} h={64} title="Video pipeline" lines={["LandingCheck, FixPlan", "(teammates)"]} variant="planned" />
          <Box x={590} y={522} w={175} h={64} title="Search grounding" lines={["Coach-view source:", "stub, no citation yet"]} variant="planned" />
          <Box x={780} y={522} w={200} h={64} title="Clinician review" lines={["Of every rule and", "threshold"]} variant="planned" />
        </svg>
      </div>
      <ul className="legend" aria-label="Legend">
        <li>
          <span className="swatch" aria-hidden="true" /> Built and running in demo mode
        </li>
        <li>
          <span className="swatch safety" aria-hidden="true" /> Safety control (rules engine, human approval, guardrail)
        </li>
        <li>
          <span className="swatch ai" aria-hidden="true" /> Gemini panel (live with a key, otherwise a labelled scripted example)
        </li>
        <li>
          <span className="swatch planned" aria-hidden="true" /> Planned, or built but never run against the real service
        </li>
      </ul>
    </div>
  );
}

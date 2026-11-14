"use client";
// Tap-to-mark soreness body map (front + back). The whole figure is made of tappable regions, so any spot you
// press belongs to a named area. Each tap cycles a region 0 -> 1 -> 2 -> 3 -> 0. Read-only when onChange is omitted.
// Front view: the athlete's right side is on the viewer's left. Back view: the athlete's left is on the viewer's left.
import { useState } from "react";

type Levels = Record<string, number>;

const FILL = ["#dfe4ec", "#ffd9a8", "#ffa94d", "#e11d48"];
const LABEL = ["none", "mild", "moderate", "severe"];
const W = 200;
const H = 432;

// Shapes are drawn for the viewer's-left half of the body and mirrored for the other half.
// `c` is where the hover label points (centre of the shape).
interface Shape { key: string; name: string; d: string; side?: boolean }

const HALF = {
  shoulder: "M88 64 C74 64 61 69 55 81 C52 89 52 97 53 104 L70 99 C70 87 77 78 88 75 Z",
  upperArm: "M53 104 L70 99 C71 116 70 132 68 147 L51 149 C49 133 50 118 53 104 Z",
  elbow: "M51 149 L68 147 L66 164 L49 166 Z",
  forearm: "M49 166 L66 164 C66 180 64 196 61 210 L47 210 C46 195 47 180 49 166 Z",
  hand: "M47 210 L61 210 C63 220 63 230 59 238 C55 243 48 242 45 236 C43 228 45 218 47 210 Z",
  pelvis: "M74 170 Q87 176 100 176 L100 212 Q84 208 67 208 C67 194 69 181 74 170 Z",
  thigh: "M67 208 Q84 208 99 212 C99 240 98 266 96 292 L74 292 C68 264 66 236 67 208 Z",
  knee: "M74 292 L96 292 C97 301 96 310 95 318 L75 318 C73 310 73 301 74 292 Z",
  lowerLeg: "M75 318 L95 318 C96 342 95 364 92 386 L79 386 C74 364 73 342 75 318 Z",
  ankle: "M79 386 L92 386 L92 401 L79 401 Z",
  foot: "M79 401 L92 401 C94 407 95 413 94 418 C88 424 78 424 71 420 C70 412 74 406 79 401 Z",
};
const MID = {
  neck: "M90 50 L110 50 L112 64 Q100 69 88 64 Z",
  upperTorso: "M88 75 C77 78 70 87 70 99 L72 128 Q100 138 128 128 L130 99 C130 87 123 78 112 75 Q100 70 88 75 Z",
  lowerTorso: "M72 128 Q100 138 128 128 C128 143 127 157 126 170 Q113 176 100 176 Q87 176 74 170 C73 157 72 143 72 128 Z",
};

/** viewerLeft is the athlete's side shown on the left of this view ("r" on the front, "l" on the back). */
function build(view: "front" | "back"): Shape[] {
  const [a, b] = view === "front" ? (["r", "l"] as const) : (["l", "r"] as const);
  const word = { l: "Left", r: "Right" };
  const pair = (key: string, name: string, d: string): Shape[] => [
    { key: `${key}_${a}`, name: `${word[a]} ${name}`, d },
    { key: `${key}_${b}`, name: `${word[b]} ${name}`, d, side: true },
  ];
  const front = view === "front";
  return [
    { key: "neck", name: "Neck", d: MID.neck },
    { key: front ? "chest" : "upper_back", name: front ? "Chest" : "Upper back", d: MID.upperTorso },
    { key: front ? "core" : "lower_back", name: front ? "Core / abs" : "Lower back", d: MID.lowerTorso },
    ...pair("shoulder", "shoulder", HALF.shoulder),
    ...pair("upper_arm", "upper arm", HALF.upperArm),
    ...pair("elbow", "elbow", HALF.elbow),
    ...pair("forearm", "forearm", HALF.forearm),
    ...pair("wrist", "wrist / hand", HALF.hand),
    ...pair(front ? "hip" : "glute", front ? "hip" : "glute", HALF.pelvis),
    ...pair(front ? "quad" : "hamstring", front ? "quad" : "hamstring", HALF.thigh),
    ...pair("knee", "knee", HALF.knee),
    ...pair(front ? "shin" : "calf", front ? "shin" : "calf", HALF.lowerLeg),
    ...pair("ankle", "ankle", HALF.ankle),
    ...pair("foot", "foot", HALF.foot),
  ];
}
const FRONT = build("front");
const BACK = build("back");
const NAMES: Record<string, string> = Object.fromEntries([...FRONT, ...BACK].map((s) => [s.key, s.name]));
const MIRROR = `translate(${W} 0) scale(-1 1)`;

function Figure({ title, shapes, value, onTap, onHover }: { title: string; shapes: Shape[]; value: Levels; onTap?: (area: string) => void; onHover: (name: string | null) => void }) {
  return (
    <figure style={{ margin: 0, textAlign: "center", flex: 1, minWidth: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: onTap ? 230 : 170, height: "auto", margin: "0 auto", touchAction: "manipulation" }} role="group" aria-label={`${title} of the body`}>
        {/* Head: not a soreness area (head symptoms are asked separately). */}
        <ellipse cx="100" cy="28" rx="18" ry="22" fill="#eef1f6" stroke="#c3cad6" strokeWidth="1.2" />
        {shapes.map((s) => {
          const lvl = value[s.key] ?? 0;
          return (
            <path
              key={s.key}
              d={s.d}
              transform={s.side ? MIRROR : undefined}
              className={onTap ? "body-region" : undefined}
              fill={FILL[lvl]}
              stroke="#ffffff"
              strokeWidth={1.6}
              strokeLinejoin="round"
              role={onTap ? "button" : "img"}
              tabIndex={onTap ? 0 : undefined}
              aria-label={`${s.name}: ${LABEL[lvl]}${onTap ? ". Press to change." : ""}`}
              aria-pressed={onTap ? lvl > 0 : undefined}
              onClick={onTap ? () => onTap(s.key) : undefined}
              onKeyDown={onTap ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(s.key); } } : undefined}
              onPointerEnter={() => onHover(`${s.name}${lvl ? ` · ${LABEL[lvl]}` : ""}`)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(`${s.name}${lvl ? ` · ${LABEL[lvl]}` : ""}`)}
              onBlur={() => onHover(null)}
            >
              <title>{`${s.name}: ${LABEL[lvl]}`}</title>
            </path>
          );
        })}
      </svg>
      <figcaption className="tiny muted">{title}</figcaption>
    </figure>
  );
}

/** Readable name for any area key the map can produce (falls back to the key for areas that came from elsewhere). */
export function bodyAreaName(area: string): string {
  return NAMES[area] ?? area.replaceAll("_", " ");
}

export function BodyMap({ value, onChange }: { value: Levels; onChange?: (next: Levels) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const set = (area: string, level: number) => {
    if (!onChange) return;
    const next = { ...value };
    if (level <= 0) delete next[area];
    else next[area] = level;
    onChange(next);
  };
  const tap = onChange ? (area: string) => set(area, ((value[area] ?? 0) + 1) % 4) : undefined;
  const marked = Object.entries(value).filter(([, l]) => l > 0);

  return (
    <div>
      {onChange && (
        <div className="body-readout" aria-live="polite">{hover ?? "Point at a body part to see its name, then tap it"}</div>
      )}
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        <Figure title="Front" shapes={FRONT} value={value} onTap={tap} onHover={setHover} />
        <Figure title="Back" shapes={BACK} value={value} onTap={tap} onHover={setHover} />
      </div>
      <div className="row wrap tiny muted" style={{ justifyContent: "center", gap: 10, marginTop: 6 }} aria-hidden="true">
        {[1, 2, 3].map((l) => (
          <span key={l} className="row" style={{ gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: FILL[l], display: "inline-block" }} /> {LABEL[l]}
          </span>
        ))}
      </div>
      {onChange && marked.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginTop: 10, justifyContent: "center" }}>
          {marked.map(([area, lvl]) => (
            <button key={area} type="button" className="body-chip" onClick={() => set(area, 0)} aria-label={`Clear ${bodyAreaName(area)}`}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: FILL[lvl], display: "inline-block" }} />
              {bodyAreaName(area)} · {LABEL[lvl]} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

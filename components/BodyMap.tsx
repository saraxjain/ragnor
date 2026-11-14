"use client";
// Tap-to-mark soreness body map (front + back), adapted from the team's "Daily check-in" mockup.
// Each tap cycles a region 0 -> 1 -> 2 -> 3 -> 0. Read-only when onChange is omitted.
// Front view: the athlete's right side is on the viewer's left. Back view: athlete's left is on the viewer's left.

type Levels = Record<string, number>;

const FILL = ["#e9edf3", "#ffd9a8", "#ffa94d", "#e11d48"];
const LABEL = ["none", "mild", "moderate", "severe"];

interface Region {
  area: string;
  label: string;
  shape: "ellipse" | "rect" | "circle";
  a: number[]; // ellipse: cx,cy,rx,ry · rect: x,y,w,h,rx · circle: cx,cy,r
}

const FRONT: Region[] = [
  { area: "shoulder_r", label: "Right shoulder", shape: "ellipse", a: [36, 60, 12, 9] },
  { area: "shoulder_l", label: "Left shoulder", shape: "ellipse", a: [84, 60, 12, 9] },
  { area: "hip_r", label: "Right hip", shape: "ellipse", a: [49, 128, 11, 9] },
  { area: "hip_l", label: "Left hip", shape: "ellipse", a: [71, 128, 11, 9] },
  { area: "quad_r", label: "Right quad", shape: "rect", a: [40, 138, 17, 50, 8] },
  { area: "quad_l", label: "Left quad", shape: "rect", a: [63, 138, 17, 50, 8] },
  { area: "knee_r", label: "Right knee", shape: "circle", a: [48.5, 197, 8] },
  { area: "knee_l", label: "Left knee", shape: "circle", a: [71.5, 197, 8] },
  { area: "ankle_r", label: "Right ankle", shape: "ellipse", a: [48.5, 250, 8, 5] },
  { area: "ankle_l", label: "Left ankle", shape: "ellipse", a: [71.5, 250, 8, 5] },
];

const BACK: Region[] = [
  { area: "neck", label: "Neck", shape: "rect", a: [53, 38, 14, 10, 4] },
  { area: "lower_back", label: "Lower back", shape: "rect", a: [44, 92, 32, 24, 8] },
  { area: "hamstring_l", label: "Left hamstring", shape: "rect", a: [40, 138, 17, 50, 8] },
  { area: "hamstring_r", label: "Right hamstring", shape: "rect", a: [63, 138, 17, 50, 8] },
  { area: "calf_l", label: "Left calf", shape: "rect", a: [41, 206, 15, 38, 7] },
  { area: "calf_r", label: "Right calf", shape: "rect", a: [64, 206, 15, 38, 7] },
];

function Silhouette() {
  return (
    <g fill="#f3f5f9" stroke="#d5dbe5" strokeWidth="1.2">
      <circle cx="60" cy="22" r="15" />
      <rect x="53" y="36" width="14" height="12" rx="4" />
      <rect x="38" y="48" width="44" height="76" rx="14" />
      <rect x="18" y="56" width="13" height="74" rx="6.5" />
      <rect x="89" y="56" width="13" height="74" rx="6.5" />
      <rect x="39" y="120" width="42" height="18" rx="8" />
      <rect x="40" y="136" width="17" height="112" rx="8" />
      <rect x="63" y="136" width="17" height="112" rx="8" />
    </g>
  );
}

function Figure({ title, regions, value, onTap }: { title: string; regions: Region[]; value: Levels; onTap?: (area: string) => void }) {
  return (
    <figure style={{ margin: 0, textAlign: "center", flex: 1, minWidth: 0 }}>
      <svg viewBox="0 0 120 262" style={{ width: "100%", maxWidth: 150, height: "auto", margin: "0 auto" }} role="group" aria-label={`${title} body map`}>
        <Silhouette />
        {regions.map((r) => {
          const lvl = value[r.area] ?? 0;
          const common = {
            className: onTap ? "body-region" : undefined,
            fill: FILL[lvl],
            stroke: lvl ? "#b45309" : "#cfd6e0",
            strokeWidth: lvl ? 1.4 : 1,
            role: onTap ? "button" : "img",
            tabIndex: onTap ? 0 : undefined,
            "aria-label": `${r.label}: ${LABEL[lvl]}${onTap ? ". Tap to change." : ""}`,
            onClick: onTap ? () => onTap(r.area) : undefined,
            onKeyDown: onTap ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(r.area); } } : undefined,
          };
          if (r.shape === "ellipse") return <ellipse key={r.area} cx={r.a[0]} cy={r.a[1]} rx={r.a[2]} ry={r.a[3]} {...common}><title>{`${r.label}: ${LABEL[lvl]}`}</title></ellipse>;
          if (r.shape === "circle") return <circle key={r.area} cx={r.a[0]} cy={r.a[1]} r={r.a[2]} {...common}><title>{`${r.label}: ${LABEL[lvl]}`}</title></circle>;
          return <rect key={r.area} x={r.a[0]} y={r.a[1]} width={r.a[2]} height={r.a[3]} rx={r.a[4]} {...common}><title>{`${r.label}: ${LABEL[lvl]}`}</title></rect>;
        })}
      </svg>
      <figcaption className="tiny muted">{title}</figcaption>
    </figure>
  );
}

export function BodyMap({ value, onChange }: { value: Levels; onChange?: (next: Levels) => void }) {
  const tap = onChange
    ? (area: string) => {
        const next = { ...value, [area]: ((value[area] ?? 0) + 1) % 4 };
        if (next[area] === 0) delete next[area];
        onChange(next);
      }
    : undefined;
  return (
    <div>
      <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
        <Figure title="Front" regions={FRONT} value={value} onTap={tap} />
        <Figure title="Back" regions={BACK} value={value} onTap={tap} />
      </div>
      <div className="row wrap tiny muted" style={{ justifyContent: "center", gap: 10, marginTop: 6 }} aria-hidden="true">
        {[1, 2, 3].map((l) => (
          <span key={l} className="row" style={{ gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: FILL[l], display: "inline-block" }} /> {LABEL[l]}
          </span>
        ))}
      </div>
    </div>
  );
}

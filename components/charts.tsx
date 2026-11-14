// Hand-rolled SVG charts in the Fitbit spirit: rings and trend lines against a personal baseline band.
"use client";
import { useId } from "react";

export function Ring({
  value,
  max = 100,
  size = 168,
  stroke = 14,
  color = "var(--teal)",
  track = "var(--surface-3)",
  children,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ position: "relative", width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

export interface Point {
  date: string;
  value: number | null;
}

/** Trend line with the athlete's personal baseline drawn as a band (baseline ± tolerance). */
export function TrendChart({
  points,
  baseline,
  tolerance,
  color,
  unit,
  height = 150,
  label,
  lowerIsWorse = true,
  markers = [],
}: {
  points: Point[];
  baseline: number | null;
  tolerance: number;
  color: string;
  unit: string;
  height?: number;
  label: string;
  lowerIsWorse?: boolean;
  markers?: { date: string; label: string }[];
}) {
  const id = useId();
  const w = 400;
  const padL = 34, padR = 12, padT = 12, padB = 26;
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (!vals.length) {
    return <div className="muted small" style={{ height, display: "grid", placeItems: "center" }}>No wearable data yet</div>;
  }
  const lo = Math.min(...vals, baseline != null ? baseline - tolerance * 1.6 : Infinity);
  const hi = Math.max(...vals, baseline != null ? baseline + tolerance * 1.6 : -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (height - padT - padB);
  const path = points
    .map((p, i) => (p.value == null ? null : `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`))
    .filter(Boolean)
    .join(" L ");
  const area = `M ${x(0)},${height - padB} L ${path} L ${x(points.length - 1)},${height - padB} Z`;
  const ticks = [lo, (lo + hi) / 2, hi];
  const outOfBand = (v: number) => baseline != null && (lowerIsWorse ? v < baseline - tolerance : v > baseline + tolerance);
  const summary = `${label}. Latest ${vals[vals.length - 1]} ${unit}${baseline != null ? `, personal baseline ${baseline} ${unit}` : ""}.`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" role="img" aria-label={summary} style={{ overflow: "visible", height: "auto" }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--outline-soft)" strokeDasharray="3 4" />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--ink-3)">{Math.round(t)}</text>
        </g>
      ))}
      {baseline != null && (
        <>
          <rect x={padL} width={w - padL - padR} y={y(baseline + tolerance)} height={Math.max(2, y(baseline - tolerance) - y(baseline + tolerance))} fill="var(--low-container)" opacity="0.55" />
          <line x1={padL} x2={w - padR} y1={y(baseline)} y2={y(baseline)} stroke="var(--low)" strokeWidth="1.2" strokeDasharray="5 4" />
          <text x={padL + 4} y={y(baseline + tolerance) - 4} textAnchor="start" fontSize="10.5" fill="var(--low)">Your normal</text>
        </>
      )}
      {markers.map((m) => {
        const i = points.findIndex((p) => p.date === m.date);
        if (i < 0) return null;
        return (
          <g key={m.date}>
            <line x1={x(i)} x2={x(i)} y1={padT} y2={height - padB} stroke="var(--high)" strokeDasharray="2 3" />
            <text x={x(i) - 4} y={padT + 10} textAnchor="end" fontSize="10.5" fill="var(--high)" fontWeight="600">{m.label}</text>
          </g>
        );
      })}
      <path d={area} fill={`url(#g${id})`} />
      <path d={`M ${path}`} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) =>
        p.value == null ? null : (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={outOfBand(p.value) ? 4.2 : 3} fill={outOfBand(p.value) ? "var(--high)" : "var(--surface)"} stroke={outOfBand(p.value) ? "var(--high)" : color} strokeWidth="2">
            <title>{`${p.date}: ${p.value} ${unit}`}</title>
          </circle>
        ),
      )}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 7) === 0 || i === points.length - 1 ? (
          <text key={`l${i}`} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)">
            {new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function Sparkline({ values, color, width = 96, height = 30 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = values
    .map((val, i) => (val == null ? null : `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 3 - ((val - lo) / span) * (height - 6)).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ maxWidth: width }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";
// The risk model with the lid off: the full forward pass for one athlete (every number is the real one),
// the exact arithmetic, and the validation plots. Technical on purpose, with one plain sentence per step.
import type { ModelScore } from "@/lib/risk.ts";

export interface ModelInfo {
  version: string;
  features: { name: string; label: string; weight: number; mean: number; std: number }[];
  bias: number;
  wPos: number;
  prevalence: number;
  threshold: number;
  auroc: number;
  auprc: number;
  brier: number;
  sensitivity: number;
  specificity: number;
  ppv: number;
  npv: number;
  baselineSensitivity: number;
  baselineSpecificity: number;
  roc: { fpr: number; tpr: number }[];
  calibration: { predicted: number; observed: number; n: number }[];
  data: { n_train: number; n_test: number; athletes_train: number; athletes_test: number };
  source: string;
}

const SOURCE: Record<string, string> = {
  acwr: "check-in", monotony: "check-in", sleep_avg_7d: "check-in", sleep_debt_3d: "check-in", hrv_z: "watch", rhr_delta: "watch",
  soreness_max: "check-in", soreness_days_3d: "check-in", landing_errors: "video", under_fueled: "check-in",
};
const UP = "var(--high)";
const DOWN = "var(--low-fill)";
const FLAT = "var(--outline)";
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}`;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function ModelAnatomy({ model, score, first }: { model: ModelInfo; score: ModelScore; first: string }) {
  const rows = model.features.map((f) => {
    const x = (score.features as unknown as Record<string, number>)[f.name] ?? 0;
    const z = (x - f.mean) / (f.std || 1);
    return { ...f, x, z, c: z * f.weight };
  });
  const logit = rows.reduce((s, r) => s + r.c, model.bias);
  const raw = sigmoid(logit);
  const flagged = score.risk_7d >= model.threshold;
  const d = model.data;

  return (
    <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
      <div className="ma-chips">
        {[
          ["Model", "L2-regularised logistic regression"],
          ["Parameters", `${model.features.length} weights + 1 bias`],
          ["Training", "gradient descent, 900 epochs, learning rate 0.2, λ 0.001"],
          ["Class weighting", `injuries weighted ×${model.wPos.toFixed(1)} (they are rare)`],
          ["Data split", `by athlete: ${d.athletes_train} train / ${d.athletes_test} test`],
          ["Version", model.version],
        ].map(([k, v]) => <span key={k} className="ma-chip"><b>{k}</b>{v}</span>)}
      </div>

      <div className="card">
        <div className="row spread wrap" style={{ gap: 8 }}>
          <h4>Forward pass: {first}&apos;s numbers, today</h4>
          <span className="tiny muted">Every value below is computed live. Point at a row for its arithmetic.</span>
        </div>
        <div className="ma-scroll"><Graph model={model} rows={rows} logit={logit} raw={raw} p={score.risk_7d} flagged={flagged} /></div>
        <div className="row wrap tiny" style={{ gap: 16, marginTop: 6 }}>
          <span className="row" style={{ gap: 6 }}><i className="hw-key" style={{ background: UP }} /> pushes risk up</span>
          <span className="row" style={{ gap: 6 }}><i className="hw-key" style={{ background: DOWN }} /> pulls risk down</span>
          <span className="row" style={{ gap: 6 }}><i className="hw-key" style={{ background: FLAT }} /> near typical, little effect</span>
          <span className="muted">σ = standard deviations from a typical athlete</span>
        </div>
        <ol className="ma-steps">
          <li><b>Input.</b> Ten numbers per athlete, built from check-ins, trusted watch readings and the landing video.</li>
          <li><b>Standardise.</b> Each number becomes &quot;how far from a typical athlete&quot;, so hours and heartbeats are comparable.</li>
          <li><b>Weight.</b> The model learned how much each input matters. Positive weights raise risk, negative lower it.</li>
          <li><b>Contribution.</b> Distance × weight. This is that input&apos;s push on today&apos;s score.</li>
          <li><b>Sum.</b> Add the ten pushes and a starting offset (the bias).</li>
          <li><b>Squash.</b> An S-shaped curve turns the sum into a score between 0 and 1.</li>
          <li><b>Calibrate.</b> Training over-counted injuries to learn from them; this step undoes that so the output is a real-world probability.</li>
          <li><b>Decide.</b> At {pct(model.threshold)} or above the athlete is flagged for review. The model can never lower the rules&apos; risk level.</li>
        </ol>
      </div>

      <div className="card flat">
        <h4>The exact arithmetic</h4>
        <pre className="ma-math">{[
          `z      = b + Σ wᵢ · (xᵢ − μᵢ) / σᵢ`,
          `       = ${signed(model.bias)} ${rows.map((r) => `${r.c >= 0 ? "+" : "−"} ${Math.abs(r.c).toFixed(2)}`).join(" ")}`,
          `       = ${signed(logit, 3)}`,
          `raw    = 1 / (1 + e^(−z))                     = ${raw.toFixed(3)}`,
          `p      = odds(raw) / ${model.wPos}  →  probability   = ${pct(score.risk_7d)}`,
          `flag   = p ≥ ${pct(model.threshold)}                            = ${flagged ? "YES, review" : "no"}`,
        ].join("\n")}</pre>
        <p className="tiny muted" style={{ marginTop: 6 }}>odds(r) = r / (1 − r). Dividing the odds by the class weight is a prior correction, back to the {Math.round(model.prevalence * 100)}% base rate in the training data.</p>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h4>Does it separate injured from healthy? (ROC curve)</h4>
          <p className="small muted" style={{ marginTop: 4 }}>The further the curve bows towards the top-left, the better. The dashed line is a coin flip.</p>
          <Roc model={model} />
        </div>
        <div className="card">
          <h4>Can you believe the percentage? (calibration)</h4>
          <p className="small muted" style={{ marginTop: 4 }}>When the model says 20%, about 20% should get injured. Dots on the diagonal mean it is honest.</p>
          <Calibration model={model} />
        </div>
        <div className="card">
          <h4>What the model learned (weights)</h4>
          <p className="small muted" style={{ marginTop: 4 }}>The same for every athlete. Longer bar = that input matters more.</p>
          <Weights model={model} />
        </div>
        <div className="card">
          <h4>Scorecard on {d.athletes_test} athletes it never saw</h4>
          <table className="ma-table">
            <tbody>
              <Metric k="AUROC" v={model.auroc.toFixed(3)} plain="Chance it ranks an injured athlete-day above a healthy one. 0.5 is a coin flip, 1.0 is perfect." />
              <Metric k="Sensitivity" v={pct(model.sensitivity)} plain={`Share of injuries it flags. The rules alone catch ${pct(model.baselineSensitivity)}.`} />
              <Metric k="Specificity" v={pct(model.specificity)} plain={`Share of healthy days it leaves alone (rules: ${pct(model.baselineSpecificity)}). Tuned to miss fewer injuries, so it over-flags.`} />
              <Metric k="PPV" v={pct(model.ppv)} plain="Of the athletes it flags, how many are injured within 7 days. Low, because injuries are rare." />
              <Metric k="NPV" v={pct(model.npv)} plain="Of the athletes it does not flag, how many stay healthy." />
              <Metric k="Brier score" v={model.brier.toFixed(3)} plain="Average squared error of the probability. Lower is better; 0 is perfect." />
              <Metric k="AUPRC" v={model.auprc.toFixed(3)} plain={`Precision across all thresholds. Always guessing would score ${model.prevalence.toFixed(2)}.`} />
            </tbody>
          </table>
          <p className="tiny muted" style={{ marginTop: 8 }}>{d.n_train.toLocaleString()} training and {d.n_test.toLocaleString()} test athlete-days. Split by athlete, so no one appears in both.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card flat">
          <h4>Why not a deep neural network?</h4>
          <p className="small mt-8" style={{ color: "var(--ink-2)" }}>On purpose. With one layer, every prediction traces back to named inputs a coach or clinician understands, and the whole model is the eleven numbers on this page. A deeper network would need far more real data than a school has, and nobody could audit it.</p>
        </div>
        <div className="card flat" style={{ background: "var(--mod-container)", borderColor: "transparent" }}>
          <h4>What it was trained on</h4>
          <p className="small mt-8" style={{ color: "#6b4000" }}>A simulated season of {d.athletes_train + d.athletes_test} athletes, not real injury records. These results show the method works end to end; real pilot data is needed before anyone should trust the numbers.</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ k, v, plain }: { k: string; v: string; plain: string }) {
  return <tr><th scope="row">{k}</th><td className="ma-num">{v}</td><td>{plain}</td></tr>;
}

type Row = ModelInfo["features"][number] & { x: number; z: number; c: number };

/** The computation graph. Columns left to right are the eight steps listed under it. */
function Graph({ model, rows, logit, raw, p, flagged }: { model: ModelInfo; rows: Row[]; logit: number; raw: number; p: number; flagged: boolean }) {
  const W = 1280, rowH = 36, top = 74, H = top + rowH * (rows.length - 1) + 44;
  const mid = top + (rowH * (rows.length - 1)) / 2;
  const cx = 600, half = 60, sumX = 840;
  const maxC = Math.max(0.25, ...rows.map((r) => Math.abs(r.c)));
  const col = (r: Row) => (Math.abs(r.c) < 0.05 ? FLAT : r.c > 0 ? UP : DOWN);
  const heads: [number, string, string, "end" | "middle"][] = [
    [316, "1 · INPUT", "xᵢ", "end"], [377, "2 · STANDARDISE", "(x − μ) / σ", "middle"], [469, "3 · WEIGHT", "wᵢ", "middle"], [cx, "4 · CONTRIBUTION", "wᵢ · zᵢ", "middle"],
    [sumX, "5 · SUM", "b + Σ", "middle"], [960, "6 · SQUASH", "sigmoid", "middle"], [1098, "7 · CALIBRATE", "prior correction", "middle"], [1222, "8 · DECIDE", `flag at ≥ ${pct(model.threshold)}`, "middle"],
  ];
  // mini sigmoid curve inside its box
  const bx = 900, bw = 120, bh = 84, by = mid - bh / 2;
  const sx = (z: number) => bx + 8 + ((Math.max(-6, Math.min(6, z)) + 6) / 12) * (bw - 16);
  const sy = (v: number) => by + bh - 8 - v * (bh - 16);
  const curve = Array.from({ length: 41 }, (_, i) => -6 + i * 0.3).map((z, i) => `${i ? "L" : "M"}${sx(z).toFixed(1)} ${sy(sigmoid(z)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ma-svg" role="img" aria-label={`Forward pass of the risk model. Sum ${logit.toFixed(2)}, raw score ${raw.toFixed(3)}, calibrated probability ${pct(p)}, ${flagged ? "flagged" : "not flagged"}.`}>
      <defs>
        <marker id="ma-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)" /></marker>
      </defs>
      {heads.map(([x, a, b, anchor]) => (
        <g key={a}>
          <text x={x} y={18} textAnchor={anchor} fontSize="10.5" fontWeight="700" fill="var(--ink-2)" letterSpacing=".05em">{a}</text>
          <text x={x} y={34} textAnchor={anchor} fontSize="11.5" fill="var(--ink-3)" fontFamily="var(--mono)">{b}</text>
        </g>
      ))}
      <line x1={cx} y1={top - 18} x2={cx} y2={top + rowH * (rows.length - 1) + 18} stroke="var(--outline)" strokeWidth="1" />
      {rows.map((r, i) => {
        const y = top + i * rowH, c = col(r), len = (r.c / maxC) * half;
        return (
          <g key={r.name} className="ma-row">
            <title>{`${r.label}: (${f2(r.x)} − ${r.mean}) / ${r.std} = ${signed(r.z)}σ;  × ${r.weight} = ${signed(r.c, 3)}`}</title>
            <rect x="4" y={y - rowH / 2 + 2} width="726" height={rowH - 4} rx="8" className="ma-row-bg" />
            <text x="12" y={y + 3.5} fontSize="9.5" fill="var(--ink-3)" fontFamily="var(--mono)">{SOURCE[r.name] ?? ""}</text>
            <text x="264" y={y + 4} textAnchor="end" fontSize="12.5" fill="var(--ink)">{r.label}</text>
            <text x="316" y={y + 4.5} textAnchor="end" fontSize="13" fontWeight="700" fill="var(--ink)" fontFamily="var(--mono)">{f2(r.x)}</text>
            <line x1="322" y1={y} x2="338" y2={y} stroke="var(--ink-3)" strokeWidth="1.2" markerEnd="url(#ma-arrow)" />
            <rect x="340" y={y - 12} width="74" height="24" rx="7" fill="var(--surface-2)" stroke="var(--outline-soft)" />
            <text x="377" y={y + 4.5} textAnchor="middle" fontSize="12" fill="var(--ink)" fontFamily="var(--mono)">{signed(r.z)}σ</text>
            <line x1="416" y1={y} x2="430" y2={y} stroke="var(--ink-3)" strokeWidth="1.2" markerEnd="url(#ma-arrow)" />
            <rect x="432" y={y - 12} width="74" height="24" rx="7" fill="var(--surface)" stroke="var(--outline)" />
            <text x="469" y={y + 4.5} textAnchor="middle" fontSize="12" fill="var(--ink)" fontFamily="var(--mono)">× {signed(r.weight, 3)}</text>
            <line x1="508" y1={y} x2="526" y2={y} stroke="var(--ink-3)" strokeWidth="1.2" markerEnd="url(#ma-arrow)" />
            <rect x={Math.min(cx, cx + len)} y={y - 8} width={Math.max(2, Math.abs(len))} height="16" rx="4" fill={c} />
            <text x="684" y={y + 4.5} fontSize="12.5" fontWeight="700" fill="var(--ink)" fontFamily="var(--mono)">{signed(r.c)}</text>
            <path d={`M734 ${y} C ${780} ${y}, ${780} ${mid}, ${sumX - 34} ${mid}`} fill="none" stroke={c} strokeWidth={1 + Math.min(8, (Math.abs(r.c) / maxC) * 8)} strokeLinecap="round" opacity={c === FLAT ? 0.6 : 0.8} className="ma-wire" />
          </g>
        );
      })}

      {/* 5. sum */}
      <text x={sumX} y={mid - 76} textAnchor="middle" fontSize="11.5" fill="var(--ink-2)" fontFamily="var(--mono)">bias {signed(model.bias)}</text>
      <line x1={sumX} y1={mid - 70} x2={sumX} y2={mid - 38} stroke="var(--ink-3)" strokeWidth="1.2" markerEnd="url(#ma-arrow)" />
      <circle cx={sumX} cy={mid} r="34" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
      <text x={sumX} y={mid + 9} textAnchor="middle" fontSize="27" fontWeight="700" fill="var(--ink)">Σ</text>
      <text x={sumX} y={mid + 54} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)" fontFamily="var(--mono)">z = {signed(logit)}</text>
      <line x1={sumX + 34} y1={mid} x2={bx - 4} y2={mid} stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="url(#ma-arrow)" />

      {/* 6. sigmoid */}
      <rect x={bx} y={by} width={bw} height={bh} rx="12" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1={bx + 8} y1={sy(0.5)} x2={bx + bw - 8} y2={sy(0.5)} stroke="var(--outline-soft)" strokeWidth="1" />
      <path d={curve} fill="none" stroke="var(--primary)" strokeWidth="2" />
      <line x1={sx(logit)} y1={by + bh - 8} x2={sx(logit)} y2={sy(raw)} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 2" />
      <circle cx={sx(logit)} cy={sy(raw)} r="5" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />
      <text x={bx + bw / 2} y={by + bh + 18} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)" fontFamily="var(--mono)">raw = {raw.toFixed(3)}</text>
      <line x1={bx + bw} y1={mid} x2={1042} y2={mid} stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="url(#ma-arrow)" />

      {/* 7. calibrate */}
      <rect x="1046" y={mid - 32} width="104" height="64" rx="12" fill="var(--surface-2)" stroke="var(--teal)" strokeWidth="1.5" />
      <text x="1098" y={mid - 6} textAnchor="middle" fontSize="12" fill="var(--ink)" fontFamily="var(--mono)">odds ÷ {model.wPos.toFixed(2)}</text>
      <text x="1098" y={mid + 12} textAnchor="middle" fontSize="10.5" fill="var(--ink-2)">undo class weight</text>
      <text x="1098" y={mid + 50} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)" fontFamily="var(--mono)">p = {pct(p)}</text>
      <line x1="1150" y1={mid} x2="1172" y2={mid} stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="url(#ma-arrow)" />

      {/* 8. decide */}
      <circle cx="1222" cy={mid} r="44" fill={flagged ? "var(--high-container)" : "var(--low-container)"} stroke={flagged ? "var(--high)" : "var(--low-fill)"} strokeWidth="3" />
      <text x="1222" y={mid + 3} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--ink)">{pct(p)}</text>
      <text x="1222" y={mid + 19} textAnchor="middle" fontSize="10" fill="var(--ink-2)">in 7 days</text>
      <text x="1222" y={mid + 66} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)">{flagged ? "Flagged for review" : "Not flagged"}</text>
    </svg>
  );
}

function Frame({ children, xLabel, yLabel, max, label }: { children: (sx: (v: number) => number, sy: (v: number) => number) => React.ReactNode; xLabel: string; yLabel: string; max: number; label: string }) {
  const W = 420, H = 330, l = 46, r = 14, t = 12, b = 44;
  const sx = (v: number) => l + (v / max) * (W - l - r);
  const sy = (v: number) => H - b - (v / max) * (H - t - b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 460, height: "auto", display: "block", margin: "8px auto 0" }} role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={sx(0)} x2={sx(max)} y1={sy(v)} y2={sy(v)} stroke="var(--outline-soft)" strokeWidth="1" />
          <line y1={sy(0)} y2={sy(max)} x1={sx(v)} x2={sx(v)} stroke="var(--outline-soft)" strokeWidth="1" />
          <text x={l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--ink-3)">{Math.round(v * 100)}%</text>
          <text x={sx(v)} y={H - b + 14} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)">{Math.round(v * 100)}%</text>
        </g>
      ))}
      <line x1={sx(0)} y1={sy(0)} x2={sx(max)} y2={sy(max)} stroke="var(--ink-3)" strokeWidth="1.2" strokeDasharray="4 4" />
      <text x={(sx(0) + sx(max)) / 2} y={H - 8} textAnchor="middle" fontSize="11.5" fill="var(--ink-2)">{xLabel}</text>
      <text transform={`translate(12 ${(sy(0) + sy(max)) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11.5" fill="var(--ink-2)">{yLabel}</text>
      {children(sx, sy)}
    </svg>
  );
}

function Roc({ model }: { model: ModelInfo }) {
  const op = { x: 1 - model.specificity, y: model.sensitivity };
  const rules = { x: 1 - model.baselineSpecificity, y: model.baselineSensitivity };
  return (
    <Frame max={1} xLabel="False alarms (healthy days flagged)" yLabel="Injuries caught" label={`ROC curve. Area under the curve ${model.auroc}.`}>
      {(sx, sy) => {
        const line = model.roc.map((q, i) => `${i ? "L" : "M"}${sx(q.fpr).toFixed(1)} ${sy(q.tpr).toFixed(1)}`).join(" ");
        return (
          <>
            <path d={`${line} L${sx(1)} ${sy(0)} L${sx(0)} ${sy(0)} Z`} fill="var(--primary)" opacity=".08" />
            <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
            <text x={sx(0.62)} y={sy(0.3)} fontSize="12" fontWeight="700" fill="var(--ink)">Area under curve = {model.auroc}</text>
            <text x={sx(0.62)} y={sy(0.3) + 15} fontSize="10.5" fill="var(--ink-3)">coin flip = 0.5</text>
            <circle cx={sx(rules.x)} cy={sy(rules.y)} r="6" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2"><title>{`Rules alone: catches ${pct(rules.y)} with ${pct(rules.x)} false alarms`}</title></circle>
            <text x={sx(rules.x) + 10} y={sy(rules.y) + 16} fontSize="11" fill="var(--ink)">Rules alone: {Math.round(rules.y * 100)}% caught</text>
            <circle cx={sx(op.x)} cy={sy(op.y)} r="6" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2"><title>{`Model at the flag line: catches ${pct(op.y)} with ${pct(op.x)} false alarms`}</title></circle>
            <text x={sx(op.x) - 10} y={sy(op.y) - 10} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--ink)">Model at flag line: {Math.round(op.y * 100)}% caught</text>
          </>
        );
      }}
    </Frame>
  );
}

function Calibration({ model }: { model: ModelInfo }) {
  const max = 0.8;
  const big = Math.max(...model.calibration.map((c) => c.n));
  return (
    <Frame max={max} xLabel="Model said (predicted risk)" yLabel="Actually happened" label="Calibration plot: predicted risk against observed injury rate in ten bins.">
      {(sx, sy) => (
        <>
          <text x={sx(0.5)} y={sy(0.44)} fontSize="10.5" fill="var(--ink-3)">perfect</text>
          <polyline points={model.calibration.map((c) => `${sx(c.predicted).toFixed(1)},${sy(c.observed).toFixed(1)}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity=".5" />
          {model.calibration.map((c, i) => (
            <circle key={i} cx={sx(c.predicted)} cy={sy(c.observed)} r={4 + Math.sqrt(c.n / big) * 8} fill="var(--primary)" fillOpacity=".75" stroke="var(--surface)" strokeWidth="2">
              <title>{`Model said ${pct(c.predicted)}; ${pct(c.observed)} were injured (${c.n.toLocaleString()} athlete-days)`}</title>
            </circle>
          ))}
          <text x={sx(0.03)} y={sy(0.72)} fontSize="10.5" fill="var(--ink-3)">Bigger dot = more athlete-days.</text>
          <text x={sx(0.03)} y={sy(0.72) + 14} fontSize="10.5" fill="var(--ink-3)">High-risk bins are small, so they wobble.</text>
        </>
      )}
    </Frame>
  );
}

function Weights({ model }: { model: ModelInfo }) {
  const fs = [...model.features].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const max = Math.max(...fs.map((f) => Math.abs(f.weight)));
  return (
    <div className="ma-weights">
      {fs.map((f) => (
        <div key={f.name} className="ma-w" title={`${f.label}: weight ${signed(f.weight, 3)} per standard deviation`}>
          <span className="small">{f.label}</span>
          <span className="ma-w-track" aria-hidden="true">
            <span className="ma-w-bar" style={{ width: `${(Math.abs(f.weight) / max) * 50}%`, [f.weight >= 0 ? "left" : "right"]: "50%", background: f.weight >= 0 ? UP : DOWN }} />
          </span>
          <span className="ma-num">{signed(f.weight, 3)}</span>
        </div>
      ))}
      <p className="tiny muted" style={{ marginTop: 6 }}>Right of centre raises risk as the input goes up; left lowers it (more sleep and higher HRV are protective). &quot;Days sore&quot; comes out negative most likely because it moves together with &quot;Worst soreness&quot;, which already carries that signal.</p>
    </div>
  );
}

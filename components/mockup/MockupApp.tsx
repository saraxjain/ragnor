"use client";

import { useState } from "react";

type Screen = "checkin" | "readiness" | "flag" | "trainer";

const SCREENS: { id: Screen; label: string }[] = [
  { id: "checkin", label: "1. Daily check-in" },
  { id: "readiness", label: "2. Today's readiness" },
  { id: "flag", label: "3. Flag detail" },
  { id: "trainer", label: "Trainer view" },
];

const card = { background: "#1C1C1C", borderRadius: 14, padding: 14 } as const;
const label = { fontWeight: 700, fontSize: 14 } as const;
const pill = (bg: string, fg: string) =>
  ({ background: bg, color: fg, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }) as const;

export function MockupApp() {
  const [screen, setScreen] = useState<Screen>("checkin");

  return (
    <div style={{ background: "#000", color: "#fff", minHeight: "100vh", padding: 24, fontFamily: "Roboto, system-ui, sans-serif" }}>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#BBBBBB" }}>
        Rough draft mockup. Sample data only. Rules and wording are placeholders pending clinical review.
      </p>
      <nav aria-label="Mockup screens" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScreen(s.id)}
            aria-pressed={screen === s.id}
            style={{
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 12,
              border: screen === s.id ? "1px solid #A855F7" : "1px solid #fff",
              background: screen === s.id ? "#A855F7" : "#000",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {screen === "checkin" && <CheckIn />}
      {screen === "readiness" && <Readiness onOpenFlag={() => setScreen("flag")} />}
      {screen === "flag" && <FlagDetail onTrainerReport={() => setScreen("trainer")} />}
      {screen === "trainer" && <TrainerView />}
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 390,
        height: 844,
        boxSizing: "border-box",
        padding: "56px 24px 24px",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        border: "1px solid #2C2C2E",
        borderRadius: 32,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function CheckIn() {
  return (
    <PhoneFrame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "Merriweather, serif", fontWeight: 700, fontSize: 22 }}>Daily check-in</span>
        <span style={pill("#0E2A18", "#9BF0B8")}>Takes 60 seconds</span>
      </div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", ...label }}>
          <span>Sleep last night</span>
          <span>7.5 hrs</span>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={0.5}
          defaultValue={7.5}
          aria-label="Hours of sleep last night"
          style={{ width: "100%", accentColor: "#22C55E" }}
        />
      </div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={label}>Soreness by body area (0 to 3)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" aria-label="Lower back soreness, level 2 of 3" style={areaBtn("#2B2410")}>
            Lower back <b>2 / 3</b>
          </button>
          <button type="button" aria-label="Knee soreness, level 0 of 3" style={areaBtn("#000")}>
            Knee <b>0 / 3</b>
          </button>
          <button type="button" aria-label="Calf soreness, level 1 of 3" style={areaBtn("#000")}>
            Calf <b>1 / 3</b>
          </button>
          <button type="button" aria-label="Add body area" style={{ ...areaBtn("transparent"), border: "1px dashed #BBBBBB" }}>
            + Add area
          </button>
        </div>
      </div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={label}>Practice today</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Sprints", "Lower body lift", "Tumbling"].map((t) => (
            <span key={t} style={{ background: "#000", borderRadius: 999, padding: "6px 10px", fontSize: 13 }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 13 }}>
          Minutes: <b>90</b> &nbsp; Effort: <b>8 / 10</b>
        </div>
      </div>
      <div style={{ background: "#2A0A12", border: "1px solid #FF2D55", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...label, color: "#FFD6DE" }}>Any hit to the head, or symptoms?</div>
        <div style={{ fontSize: 12, color: "#DDDDDD" }}>If yes, the next screen starts the post-impact steps.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={{ ...actionBtn("#FF2D55", "#fff"), flex: 1 }}>
            Yes, report it
          </button>
          <button type="button" style={{ ...actionBtn("#000", "#fff"), flex: 1, border: "1px solid #fff" }}>
            No
          </button>
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" style={{ ...actionBtn("#22C55E", "#06210F"), minHeight: 52, fontSize: 16 }}>
          Submit check-in
        </button>
        <div style={{ fontSize: 11, color: "#BBBBBB", textAlign: "center" }}>
          Ragnor flags risk and explains why. It never clears an athlete.
        </div>
      </div>
    </PhoneFrame>
  );
}

function Readiness({ onOpenFlag }: { onOpenFlag: () => void }) {
  return (
    <PhoneFrame>
      <div style={{ fontFamily: "Merriweather, serif", fontWeight: 700, fontSize: 22 }}>Today&apos;s readiness</div>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Moderate risk ring">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#2A2A2A" strokeWidth="14" />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="#F5B301"
            strokeWidth="14"
            strokeDasharray="190 314"
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
          <text x="60" y="58" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">
            Moderate
          </text>
          <text x="60" y="76" textAnchor="middle" fontSize="12" fill="#BBBBBB">
            risk
          </text>
        </svg>
        <div style={{ fontSize: 13, color: "#DDDDDD" }}>
          <b style={{ color: "#fff" }}>1 flag</b> this week
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenFlag}
        aria-label="Open flag detail: lower back, moderate risk"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          textAlign: "left",
          background: "#2B2410",
          border: "1px solid #F5B301",
          borderRadius: 14,
          padding: 14,
          color: "#fff",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "#F5B301" }}>MODERATE RISK</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Flag: Lower back</span>
        <span style={{ fontSize: 12, color: "#BBBBBB" }}>Tap to see the flag detail</span>
      </button>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={label}>Training load, last 7 days</div>
        <svg viewBox="0 0 300 80" width="100%" height="80" role="img" aria-label="Line chart of training load rising over the last week">
          <polyline points="0,60 45,55 90,58 135,50 180,46 225,40 270,22 300,14" fill="none" stroke="#A855F7" strokeWidth="3" />
          <circle cx="270" cy="22" r="5" fill="#FF2D55" />
        </svg>
        <div style={{ fontSize: 12, color: "#BBBBBB" }}>Load went up about 30% this week. Hypothesis, not a verdict.</div>
      </div>
      <div style={{ ...card, fontSize: 13 }}>
        <b>Flags today: 2</b> &nbsp; <span style={pill("#FF2D55", "#fff")}>Lower back</span>
      </div>
      <div style={{ marginTop: "auto" }}>
        <button type="button" onClick={onOpenFlag} style={{ ...actionBtn("#A855F7", "#fff"), width: "100%", minHeight: 52, fontSize: 16 }}>
          See the flag
        </button>
      </div>
    </PhoneFrame>
  );
}

function FlagDetail({ onTrainerReport }: { onTrainerReport: () => void }) {
  return (
    <PhoneFrame>
      <div style={{ fontFamily: "Merriweather, serif", fontWeight: 700, fontSize: 22 }}>Flag detail</div>
      <div style={{ background: "#2B2410", border: "1px solid #F5B301", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ ...pill("#F5B301", "#111"), alignSelf: "flex-start", borderRadius: 999 }}>Moderate risk</span>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Lower back: moderate risk</div>
        <div style={{ fontSize: 13, color: "#DDDDDD" }}>Rule v1.2 fired: sleep under 6 hours on 3 or more nights, plus load up over 25%.</div>
      </div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#BBBBBB" }}>LIKELY CONTRIBUTORS (strongest first)</div>
        <div style={{ fontSize: 14 }}>1. Sleep dropped to 5.5 hrs for 3 nights</div>
        <div style={{ fontSize: 14 }}>2. Training load up 30% over 7 days</div>
        <div style={{ fontSize: 14 }}>3. Lower back soreness rising for 2 days</div>
      </div>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#BBBBBB" }}>SUGGESTED, LOW RISK, REVERSIBLE</div>
        <div style={{ fontSize: 14 }}>Cut sprints for 2 days. Add a 10 minute mobility session.</div>
        <button type="button" style={{ ...actionBtn("#22C55E", "#06210F"), marginTop: 6 }}>
          Got it
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onTrainerReport} style={{ ...actionBtn("#A855F7", "#fff"), flex: 1, minHeight: 48 }}>
          Trainer report
        </button>
        <button type="button" style={{ ...actionBtn("#000", "#fff"), flex: 1, minHeight: 48, border: "1px solid #fff" }}>
          Not useful
        </button>
      </div>
      <div style={{ marginTop: "auto", background: "#2A0A12", border: "1px solid #FF2D55", borderRadius: 14, padding: 12, fontSize: 12, color: "#FFD6DE" }}>
        <b>Red flags: numbness, weakness, swelling, a pop, or any head hit with symptoms.</b> If you see one, stop and tell a
        clinician now. Ragnor never clears an athlete.
      </div>
    </PhoneFrame>
  );
}

const ROSTER = [
  { name: "J.M.", band: "High", area: "Head", reason: "Post-hit symptoms rising on day 2 (red flag, v1.0)", status: "Day 2 of 7", action: "Escalated to clinician" },
  { name: "A.R.", band: "Moderate", area: "Lower back", reason: "Sleep under 6 hrs for 3 nights, load up 30% (v1.2)", status: "No", action: "Review briefing" },
  { name: "D.P.", band: "Moderate", area: "Calf", reason: "Soreness 2 of 3 for 3 days (v1.1)", status: "No", action: "Review briefing" },
  { name: "S.L.", band: "Low", area: "Knee", reason: "No rule fired", status: "No", action: "Open" },
  { name: "M.C.", band: "No check-in", area: "n/a", reason: "Missed check-in 2 days in a row (v1.0)", status: "No", action: "Send reminder" },
];

function TrainerView() {
  const bandStyle: Record<string, React.CSSProperties> = {
    High: pill("#FF2D55", "#fff") as React.CSSProperties,
    Moderate: pill("#F5B301", "#111") as React.CSSProperties,
    Low: pill("#22C55E", "#06210F") as React.CSSProperties,
    "No check-in": pill("#1C1C1C", "#fff") as React.CSSProperties,
  };
  return (
    <div style={{ width: "100%", maxWidth: 1280, boxSizing: "border-box", padding: "36px 44px", background: "#000", display: "flex", flexDirection: "column", gap: 18, border: "1px solid #2C2C2E", borderRadius: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "Merriweather, serif", fontWeight: 700, fontSize: 28 }}>Today&apos;s roster</div>
          <div style={{ fontSize: 14, color: "#BBBBBB" }}>Tue, 14 Nov. Ranked by risk. Nothing is sent until you approve it.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" style={{ ...actionBtn("#000", "#fff"), border: "1px solid #fff", minHeight: 44 }}>
            Weekly report
          </button>
          <button type="button" style={{ ...actionBtn("#A855F7", "#fff"), minHeight: 44 }}>
            Approve briefing
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Tile title="HIGH" value="1" bg="#2A0A12" fg="#FFD6DE" />
        <Tile title="MODERATE" value="2" bg="#2B2410" fg="#FFD26B" />
        <Tile title="LOW" value="9" bg="#0E2A18" fg="#9BF0B8" />
        <Tile title="NO CHECK-IN" value="1" bg="#1C1C1C" fg="#BBBBBB" />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead>
            <tr>
              {["Athlete", "Risk", "Body area", "Reason (rule version)", "Post-hit status", "Action"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "12px 14px", fontSize: 12, color: "#BBBBBB", textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid #2C2C2E" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROSTER.map((r) => (
              <tr key={r.name} style={{ background: r.band === "High" ? "#2A0A12" : "transparent" }}>
                <td style={cell}>
                  <b>{r.name}</b>
                </td>
                <td style={cell}>
                  <span style={bandStyle[r.band]}>{r.band}</span>
                </td>
                <td style={cell}>{r.area}</td>
                <td style={cell}>{r.reason}</td>
                <td style={cell}>{r.status}</td>
                <td style={cell}>
                  <button type="button" style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, border: "1px solid #fff", background: "#000", color: "#fff", fontWeight: 700 }}>
                    {r.action}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "#BBBBBB" }}>
        Audit log on every flag: rule version, inputs used, action taken. Escalations always go to a human; no message goes to a
        parent or clinician without approval.
      </div>
    </div>
  );
}

function Tile({ title, value, bg, fg }: { title: string; value: string; bg: string; fg: string }) {
  return (
    <div style={{ flex: "1 1 160px", background: bg, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: fg }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const cell = { textAlign: "left", padding: "12px 14px", fontSize: 14, borderBottom: "1px solid #2C2C2E", color: "#fff" } as const;

function areaBtn(bg: string): React.CSSProperties {
  return { border: 0, borderRadius: 10, padding: 10, background: bg, color: "#fff", font: "inherit", fontSize: 13, textAlign: "left", cursor: "pointer" };
}

function actionBtn(bg: string, fg: string): React.CSSProperties {
  return { minHeight: 44, border: 0, borderRadius: 10, background: bg, color: fg, font: "inherit", fontWeight: 700, cursor: "pointer", padding: "0 12px" };
}

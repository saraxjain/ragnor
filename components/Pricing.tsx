"use client";
// Pricing cards you can actually pick: choosing one highlights it and carries the choice into the pilot sign-up form.
import { useState } from "react";

export const PLAN_EVENT = "ragnor:plan";

const PLANS = [
  { id: "high_school", name: "High schools", price: "$20", sub: "per athlete, per season", tag: "First pilots", items: ["Free for athletes", "Coach and trainer view, weekly report", "LandingCheck + FixPlan", "Fitbit / Pixel Watch baselines"] },
  { id: "university", name: "Universities & park districts", price: "$40", sub: "per athlete, per season", tag: null, items: ["Everything in High schools", "Multi-team admin view", "Compliance reporting"] },
  { id: "pro", name: "Pro teams", price: "Custom", sub: "custom contract", tag: null, items: ["Integrations with existing staff tools", "Custom risk rules with your medical staff", "Priority support"] },
] as const;

export function Pricing() {
  const [picked, setPicked] = useState<string>(PLANS[0].id);

  function choose(id: string, name: string) {
    setPicked(id);
    window.dispatchEvent(new CustomEvent(PLAN_EVENT, { detail: { id, name } }));
    document.getElementById("pilot")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="grid grid-3" role="radiogroup" aria-label="Plans">
      {PLANS.map((p) => {
        const on = picked === p.id;
        return (
          <div
            key={p.id}
            className={`card plan ${on ? "selected" : ""}`}
            role="radio"
            aria-checked={on}
            tabIndex={0}
            onClick={() => setPicked(p.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(p.id); } }}
          >
            <div className="row spread">
              <h3>{p.name}</h3>
              {p.tag && <span className="pill teal">{p.tag}</span>}
            </div>
            <div className="price mt-16">{p.price}</div>
            <div className="small muted">{p.sub}</div>
            <ul className="check-list">{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            <button className={`btn ${on ? "btn-filled" : "btn-outlined"} btn-block mt-16`} onClick={(e) => { e.stopPropagation(); choose(p.id, p.name); }}>
              {p.id === "pro" ? "Talk to us" : on ? "Continue with this plan" : "Choose this plan"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

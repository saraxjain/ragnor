"use client";
import { useEffect, useState } from "react";
import { postJson } from "./ui.tsx";
import { IconCheck } from "./icons.tsx";
import { PLAN_EVENT } from "./Pricing.tsx";

export function SignupForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ id: string; name: string }>({ id: "high_school", name: "High schools" });

  // The pricing cards above announce which plan was chosen.
  useEffect(() => {
    const on = (e: Event) => setPlan((e as CustomEvent<{ id: string; name: string }>).detail);
    window.addEventListener(PLAN_EVENT, on);
    return () => window.removeEventListener(PLAN_EVENT, on);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setStatus("sending");
    setError(null);
    try {
      await postJson("/api/signup", Object.fromEntries(f.entries()));
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="banner banner-success" role="status">
        <IconCheck size={20} />
        <div>
          <strong>You're on the pilot list.</strong> We'll reach out before the spring 2027 season.
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-describedby={error ? "signup-error" : undefined}>
      <input type="hidden" name="plan" value={plan.id} />
      <div className="row small" style={{ gap: 8 }} aria-live="polite"><span className="muted">Plan:</span><span className="pill teal">{plan.name}</span><a href="#pricing" className="small">Change</a></div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="su-name">Your name</label>
          <input id="su-name" name="name" className="input" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="su-email">Work email</label>
          <input id="su-email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="su-school">School or club</label>
          <input id="su-school" name="school" className="input" autoComplete="organization" required />
        </div>
        <div className="field">
          <label htmlFor="su-role">Your role</label>
          <select id="su-role" name="role" className="select" defaultValue="athletic_director">
            <option value="athletic_director">Athletic director</option>
            <option value="coach">Coach</option>
            <option value="athletic_trainer">Athletic trainer</option>
            <option value="clinician">Clinician / sports medicine</option>
            <option value="parent">Parent / booster club</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      {error && <div id="signup-error" className="banner banner-error" role="alert">{error}</div>}
      <div className="row wrap">
        <button className="btn btn-filled btn-lg" disabled={status === "sending"}>
          {status === "sending" ? <span className="spinner" aria-hidden="true" /> : null}
          Join the free pilot
        </button>
        <span className="small muted">Free for the first season. No athlete data until consent is in place.</span>
      </div>
    </form>
  );
}

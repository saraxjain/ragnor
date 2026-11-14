import { decideAlertAction, markCheckedAction, setAvailabilityAction, simulateHitwatchAction, simulateImpactAction } from "../actions";
import { getDueToday, getTimelines } from "@/lib/hitwatch/service";
import { HitwatchTimeline } from "@/components/hitwatch/Timeline";
import { requireRole } from "@/components/Gate";
import { LevelBadge } from "@/components/Flags";
import { getDataAccess } from "@/lib/data";
import { getRoster } from "@/lib/services";
import { AVAILABILITY_VALUES, BODY_AREA_LABELS, type BodyArea } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TrainerPage() {
  const g = await requireRole("trainer");
  if (!g.ok) return g.blocked;
  const da = await getDataAccess();
  const roster = await getRoster(da, g.session.actor, new Date());
  const pending = await da.listAlerts(g.session.actor, { status: "pending" });
  const label = new Map(roster.map((r) => [r.athlete.id, r.athlete.displayLabel]));
  const due = await getDueToday(da, g.session.actor, new Date());
  const timelines = new Map(await Promise.all(roster.map(async (r) => [r.athlete.id, await getTimelines(da, g.session.actor, r.athlete.id, new Date())] as const)));

  return (
    <>
      <h1>Reviewer: alert queue and roster</h1>
      <section aria-labelledby="queue">
        <h2 id="queue">Alerts waiting for your review ({pending.length})</h2>
        <p className="muted">
          Rules create these alerts. Nothing reaches a coach or parent until you approve it. The athlete already sees their own guidance. Every decision is logged.
        </p>
        {pending.length === 0 && <p className="card">Nothing waiting.</p>}
        {pending.map((a) => (
          <article key={a.id} className={`card lvl-${a.level}`} aria-label={`Alert for ${label.get(a.athleteId)}`}>
            <p style={{ margin: 0 }}>
              <strong>{label.get(a.athleteId)}</strong> <LevelBadge level={a.level} />{" "}
              {a.confidence === "low" && <span className="badge note">Low confidence</span>} <span className="badge">priority {a.priority}</span>
            </p>
            <p style={{ margin: "0.3rem 0" }}>{a.reason}</p>
            <p className="small muted" style={{ margin: 0 }}>
              Source: rule <span className="mono">{a.ruleId}</span> v<span className="mono">{a.rulesVersion}</span> · for {a.localDate}
            </p>
            <details>
              <summary className="small">Inputs the rule used</summary>
              <pre className="brief-pre mono" tabIndex={0}>{JSON.stringify(a.inputs, null, 2).slice(0, 4000)}</pre>
            </details>
            <form action={decideAlertAction} className="btn-row">
              <input type="hidden" name="alertId" value={a.id} />
              <button className="btn" type="submit" name="decision" value="approved">Approve and send to coach/parent</button>
              <button className="btn secondary" type="submit" name="decision" value="dismissed">Dismiss</button>
            </form>
          </article>
        ))}
      </section>
      <section aria-labelledby="due">
        <h2 id="due">HitWatch calls due today ({due.length})</h2>
        {due.length === 0 ? <p className="card">No follow-up calls due.</p> : (
          <ul>{due.map((d) => <li key={d.impactId}>{d.athleteLabel}: day {d.day} of 7, no answer yet</li>)}</ul>
        )}
        <p className="muted small">Missed days are marked automatically and create a prompt for the athlete. Placing real phone calls is a separate, deliberate step (docs/HITWATCH_SETUP.md).</p>
      </section>
      <h2>Morning roster</h2>
      <p className="muted">Ranked urgent, high, moderate, then lower risk. Flags come from transparent rules; each shows its reason.</p>
      {roster.map((r) => (
        <article key={r.athlete.id} className={`card lvl-${r.level}`} aria-label={`${r.athlete.displayLabel}, ${r.level}`}>
          <h2 style={{ margin: 0 }}>
            {r.athlete.displayLabel} <LevelBadge level={r.level} />{" "}
            {r.trainerAlert && <span className="badge alert">Trainer alert</span>}{" "}
            {r.lowConfidence && <span className="badge note">Low confidence</span>}
          </h2>
          {r.consent.required && !r.consent.active && (
            <p className="error">Under 18 with no active parent/guardian consent: health data submissions are blocked.</p>
          )}
          {r.evaluation ? (
            <>
              <p className="muted small">Evaluated for {r.evaluation.localDate}</p>
              <ul>
                {r.evaluation.flags.map((f) => (
                  <li key={f.id}>
                    <strong>{f.bodyArea ? BODY_AREA_LABELS[f.bodyArea as BodyArea] : "General"}:</strong> {f.reason}{" "}
                    <span className="muted small">
                      (rule {f.ruleId}, {f.confidence} confidence)
                    </span>
                  </li>
                ))}
                {r.evaluation.flags.length === 0 && <li>No flags from the latest evaluation.</li>}
              </ul>
            </>
          ) : (
            <p className="muted">No evaluation yet.</p>
          )}
          {r.followUps.map((f) => (
            <p key={f.impact.id} className="small">
              <strong>Head-impact follow-up:</strong> day {f.day} of 7, {f.loggedDays.length} logged
              {f.missedDays.length > 0 && <span className="error"> Missed day{f.missedDays.length > 1 ? "s" : ""}: {f.missedDays.join(", ")}</span>}
            </p>
          ))}
          <div className="btn-row">
            <form action={markCheckedAction} className="inline-form">
              <input type="hidden" name="athleteId" value={r.athlete.id} />
              <button className="btn" type="submit" disabled={!r.evaluation || r.evaluation.flags.length === 0}>
                {r.checkedAt ? "Checked (mark again)" : "Mark checked"}
              </button>
            </form>
            <form action={setAvailabilityAction} className="inline-form" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input type="hidden" name="athleteId" value={r.athlete.id} />
              <label htmlFor={`av-${r.athlete.id}`} className="hint" style={{ fontWeight: 700 }}>
                Availability
              </label>
              <select id={`av-${r.athlete.id}`} name="status" defaultValue={r.availability === "not_set" ? "available" : r.availability} style={{ width: "auto" }}>
                {AVAILABILITY_VALUES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <button className="btn secondary" type="submit">
                Set
              </button>
            </form>
          </div>
          <HitwatchTimeline timelines={timelines.get(r.athlete.id) ?? []} />
          <div className="btn-row">
            <form action={simulateImpactAction}>
              <input type="hidden" name="athleteId" value={r.athlete.id} />
              <button className="btn secondary" type="submit">Simulate mouthguard impact</button>
            </form>
            <form action={simulateHitwatchAction} className="inline-form" style={{ display: "flex", gap: "0.5rem" }}>
              <input type="hidden" name="athleteId" value={r.athlete.id} />
              <input type="hidden" name="day" value="3" />
              <input type="hidden" name="scenario" value="typical" />
              <button className="btn secondary" type="submit">Scripted HitWatch demo (day 3)</button>
            </form>
          </div>
          {r.checkedAt && <p className="muted small">Last checked {r.checkedAt.slice(0, 16).replace("T", " ")} UTC</p>}
        </article>
      ))}
    </>
  );
}

import { logSymptomsAction, reportImpactAction } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { SymptomChecklist } from "@/components/Fields";
import { UrgentNotice } from "@/components/Flags";
import { requireRole } from "@/components/Gate";
import { getDataAccess } from "@/lib/data";
import { getFollowUps } from "@/lib/services";
import { getTimelines } from "@/lib/hitwatch/service";
import { HitwatchTimeline } from "@/components/hitwatch/Timeline";
import { TalkToHitwatch } from "@/components/hitwatch/TalkToHitwatch";
import { simulateHitwatchAction, simulateImpactAction } from "../actions";
import { FOLLOWUP_DAYS, localDateOf } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const g = await requireRole("athlete");
  if (!g.ok) return g.blocked;
  const { actor, profile } = g.session;
  const da = await getDataAccess();
  const now = new Date();
  const [followUps, evaluation, consent] = await Promise.all([
    getFollowUps(da, actor, actor.id, now),
    da.getLatestEvaluation(actor, actor.id),
    da.getConsentStatus(actor, actor.id, localDateOf(now, profile.timezone)),
  ]);
  const urgent = evaluation?.flags.some((f) => f.level === "urgent");
  const timelines = await getTimelines(da, actor, actor.id, now);
  const voiceReady = Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_AGENT_ID?.trim());

  return (
    <>
      <h1>Report a hit</h1>
      {urgent && <UrgentNotice />}
      {consent.required && !consent.active && (
        <div className="error-summary" role="alert">
          A parent or guardian must give consent before you can submit health information.
        </div>
      )}

      {followUps.map((f) => (
        <section key={f.impact.id} className="card" aria-labelledby={`fu-${f.impact.id}`}>
          <h2 id={`fu-${f.impact.id}`} style={{ marginTop: 0 }}>
            {FOLLOWUP_DAYS}-day follow-up: day {f.day} of {FOLLOWUP_DAYS}
          </h2>
          {f.missedDays.length > 0 && (
            <p className="error">
              No symptom log yet for day{f.missedDays.length > 1 ? "s" : ""} {f.missedDays.join(", ")}. Please log today.
            </p>
          )}
          <p className="muted small">
            {f.todayLogged ? "Today is logged. Logging again replaces today's entry." : "Log today's symptoms. Tick nothing if you have none."}
          </p>
          <ActionForm action={logSymptomsAction} submitLabel={f.todayLogged ? "Update today's log" : "Save today's log"}>
            <input type="hidden" name="impactId" value={f.impact.id} />
            <SymptomChecklist />
            <div className="field">
              <label htmlFor={`sev-${f.impact.id}`}>Severity if you ticked any symptoms</label>
              <select id={`sev-${f.impact.id}`} name="severity" defaultValue="">
                <option value="">Not applicable</option>
                <option value="0">0 None</option>
                <option value="1">1 Mild</option>
                <option value="2">2 Moderate</option>
                <option value="3">3 Severe</option>
              </select>
            </div>
          </ActionForm>
        </section>
      ))}

      <h2>HitWatch: 7-day follow-up calls</h2>
      <p className="muted small">After a hit or a mouthguard impact, HitWatch checks in every day for a week and compares your symptoms with your own baseline. A human reviewer approves any alert.</p>
      <HitwatchTimeline timelines={timelines} />
      {followUps[0] && voiceReady && <TalkToHitwatch impactId={followUps[0].impact.id} day={followUps[0].day} />}
      {followUps[0] && !voiceReady && <p className="card small">Voice agent not set up (needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID). Use the scripted demo below.</p>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Scripted demo: simulate day N answers</h3>
        <p className="small muted">Scripted example, no voice agent and no phone call. It creates a demo impact N-1 days ago and plays the answers for days 1 to N through the same code the real agent uses.</p>
        <form action={simulateHitwatchAction} className="btn-row" style={{ alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="sim-day">Through day</label>
            <select id="sim-day" name="day" defaultValue="3" style={{ width: "auto" }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="sim-scn">Scenario</label>
            <select id="sim-scn" name="scenario" defaultValue="typical" style={{ width: "auto" }}>
              <option value="typical">Typical: symptoms rise then settle</option>
              <option value="danger">A danger sign on day 3</option>
              <option value="missed">A missed day (day 2)</option>
            </select>
          </div>
          <button className="btn secondary" type="submit">Simulate</button>
        </form>
        <form action={simulateImpactAction} className="btn-row">
          <button className="btn secondary" type="submit">Simulate mouthguard impact now</button>
        </form>
      </div>

      <h2>New impact</h2>
      <p className="muted">Report a hit to the head, face or neck that just happened. A 7-day symptom follow-up starts today.</p>
      <ActionForm action={reportImpactAction} submitLabel="Report a hit and start follow-up">
        <div className="field">
          <label htmlFor="context">
            What happened <span className="hint">(optional, up to 500 characters)</span>
          </label>
          <textarea id="context" name="context" maxLength={500} />
        </div>
      </ActionForm>
    </>
  );
}

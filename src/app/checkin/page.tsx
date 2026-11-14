import { submitCheckinAction } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { SymptomChecklist } from "@/components/Fields";
import { requireRole } from "@/components/Gate";
import { getDataAccess } from "@/lib/data";
import { localDateOf } from "@/lib/time";
import { BODY_AREAS, BODY_AREA_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

const SORENESS_OPTIONS = ["0 None", "1 Mild", "2 Moderate", "3 Severe"];

export default async function CheckinPage() {
  const g = await requireRole("athlete");
  if (!g.ok) return g.blocked;
  const { actor, profile } = g.session;
  const da = await getDataAccess();
  const consent = await da.getConsentStatus(actor, actor.id, localDateOf(new Date(), profile.timezone));
  const blocked = consent.required && !consent.active;

  return (
    <>
      <h1>Daily check-in</h1>
      <p className="muted">Under a minute. Skip anything you do not know; missing answers are never guessed.</p>
      {blocked && (
        <div className="error-summary" role="alert">
          A parent or guardian must give consent before you can submit health information. Ask them to open the parent screen.
        </div>
      )}
      <ActionForm action={submitCheckinAction} submitLabel="Save check-in">
        <fieldset>
          <legend>Sleep and training</legend>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="sleepHours">Sleep last night (hours)</label>
              <input id="sleepHours" name="sleepHours" type="number" inputMode="decimal" min={0} max={24} step={0.25} aria-describedby="sleep-hint" />
              <span id="sleep-hint" className="hint">0 to 24</span>
            </div>
            <div className="field">
              <label htmlFor="workloadMinutes">Practice minutes today</label>
              <input id="workloadMinutes" name="workloadMinutes" type="number" inputMode="numeric" min={0} max={600} step={1} aria-describedby="min-hint" />
              <span id="min-hint" className="hint">0 to 600</span>
            </div>
            <div className="field">
              <label htmlFor="workloadIntensity">Intensity (1 easy to 10 hardest)</label>
              <input id="workloadIntensity" name="workloadIntensity" type="number" inputMode="numeric" min={1} max={10} step={1} />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Soreness (leave at 0 if none)</legend>
          <div className="sore-grid">
            {BODY_AREAS.map((a) => (
              <div className="field" key={a}>
                <label htmlFor={`soreness_${a}`}>{BODY_AREA_LABELS[a]}</label>
                <select id={`soreness_${a}`} name={`soreness_${a}`} defaultValue="0">
                  {SORENESS_OPTIONS.map((o, i) => (
                    <option key={o} value={i}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </fieldset>

        <SymptomChecklist />

        <div className="field">
          <label htmlFor="note">
            Note <span className="hint">(optional, up to 500 characters)</span>
          </label>
          <textarea id="note" name="note" maxLength={500} />
        </div>
      </ActionForm>
    </>
  );
}

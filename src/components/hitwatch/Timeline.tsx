import { symptomLabel } from "@/lib/rules/symptoms";
import type { Timeline } from "@/lib/hitwatch/service";

const STATUS_LABEL: Record<string, string> = { answered: "Answered", missed: "Missed", due: "Due today", upcoming: "Upcoming" };

/** HitWatch 7-day timeline: called/answered/missed, symptom totals against the athlete's own baseline, wearable deltas, escalations. */
export function HitwatchTimeline({ timelines }: { timelines: Timeline[] }) {
  if (timelines.length === 0) return <p className="muted small">No HitWatch follow-up yet.</p>;
  return (
    <>
      {timelines.map((t) => (
        <section key={t.impact.id} className="card" aria-label="HitWatch timeline">
          <p style={{ margin: 0 }}>
            <strong>HitWatch follow-up</strong> <span className="badge">{t.active ? `day ${t.currentDay} of 7` : "window ended"}</span>{" "}
            {t.impact.source === "demo" && <span className="badge note">scripted demo</span>}
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="HitWatch days (scrolls sideways on small screens)">
            <table className="wide-table">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Call</th>
                  <th scope="col">Symptoms (total)</th>
                  <th scope="col">Own baseline</th>
                  <th scope="col">Wearable vs baseline</th>
                  <th scope="col">Escalated?</th>
                </tr>
              </thead>
              <tbody>
                {t.days.map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{d.day}</th>
                    <td>
                      {STATUS_LABEL[d.status]}
                      {d.channel && <span className="muted small"> ({d.channel})</span>}
                    </td>
                    <td>{d.symptomsTotal ?? "-"}</td>
                    <td>{d.symptomsTotal === null ? "-" : d.baselineTotal}</td>
                    <td className="small">
                      {d.hrvDeltaPercent !== null ? `HRV ${d.hrvDeltaPercent > 0 ? "+" : ""}${d.hrvDeltaPercent}%` : "no wearable data"}
                      {d.restingHrDeltaBpm !== null ? `, resting HR ${d.restingHrDeltaBpm > 0 ? "+" : ""}${d.restingHrDeltaBpm}` : ""}
                    </td>
                    <td>
                      {d.escalate === null ? "-" : d.escalate ? <strong>Yes, queued for review</strong> : "No"}
                      {d.keywordFlags.length > 0 && <div className="error small">Keyword check: {d.keywordFlags.map(symptomLabel).join(", ")} not confirmed</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

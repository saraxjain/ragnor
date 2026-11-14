import { requireRole } from "@/components/Gate";
import { LevelBadge } from "@/components/Flags";
import { getDataAccess } from "@/lib/data";
import { getCoachView } from "@/lib/services";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { available: "Available", limited: "Limited", out: "Out", not_set: "Availability not set" };

export default async function CoachPage() {
  const g = await requireRole("coach");
  if (!g.ok) return g.blocked;
  const da = await getDataAccess();
  const rows = await getCoachView(da, g.session.actor, new Date(), g.session.profile.timezone);
  return (
    <>
      <h1>Who to look at today</h1>
      <p className="muted">
        You see only alerts that a human reviewer has approved, each with its reason and source. You never see check-ins, symptoms or alerts that are still waiting for review.
        This is a risk flag, not a medical evaluation. A clinician decides.
      </p>
      {rows.length === 0 && <p className="card">No approved alerts today.</p>}
      {rows.map((r) => (
        <article key={r.alertId} className={`card lvl-${r.level}`} aria-label={`${r.athleteLabel}, ${r.level}`}>
          <h2 style={{ margin: 0 }}>
            {r.athleteLabel} <LevelBadge level={r.level} /> <span className="badge">{LABEL[r.availability]}</span>
          </h2>
          <p style={{ margin: "0.4rem 0 0" }}>
            <strong>Reason:</strong> {r.reason}
          </p>
          <p className="small muted" style={{ margin: "0.3rem 0 0" }}>
            <strong>Source:</strong> rule <span className="mono">{r.source.ruleId}</span>, version <span className="mono">{r.source.rulesVersion}</span>, approved by a reviewer
            {r.source.grounding ? (
              <>
                {" "}
                · cited source: <a href={r.source.grounding.url}>{r.source.grounding.title}</a>
              </>
            ) : null}
          </p>
        </article>
      ))}
    </>
  );
}

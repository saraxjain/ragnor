import { consentAction } from "../actions";
import { requireRole } from "@/components/Gate";
import { getDataAccess } from "@/lib/data";
import { localDateOf } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ParentPage() {
  const g = await requireRole("parent");
  if (!g.ok) return g.blocked;
  const { actor } = g.session;
  const da = await getDataAccess();
  const minors = await da.listLinkedMinors(actor);
  const rows = await Promise.all(
    minors.map(async (m) => ({
      m,
      status: await da.getConsentStatus(actor, m.id, localDateOf(new Date(), m.timezone)),
      alerts: await da.listParentAlerts(actor, m.id),
    })),
  );
  return (
    <>
      <h1>Consent for your athlete</h1>
      <p className="muted">
        An athlete under 18 cannot submit health information until a parent or guardian gives consent. You can withdraw it at any time;
        submissions stop immediately.
      </p>
      {rows.length === 0 && <p>No linked athletes.</p>}
      {rows.map(({ m, status, alerts }) => (
        <section key={m.id} className="card" aria-labelledby={`c-${m.id}`}>
          <h2 id={`c-${m.id}`} style={{ marginTop: 0 }}>
            {m.displayLabel}
          </h2>
          <p>
            Status:{" "}
            <strong>
              {!status.required ? "Over 18, consent not required" : status.active ? "Consent given" : status.withdrawnAt ? "Consent withdrawn" : "No consent yet"}
            </strong>
            {status.grantedAt && status.active && <span className="muted small"> (since {status.grantedAt.slice(0, 10)})</span>}
            {status.withdrawnAt && !status.active && <span className="muted small"> (withdrawn {status.withdrawnAt.slice(0, 10)})</span>}
          </p>
          <h3 style={{ marginBottom: "0.25rem" }}>Alerts approved by a reviewer</h3>
          {alerts.length === 0 ? (
            <p className="muted small">None. You only see alerts a human reviewer has approved.</p>
          ) : (
            <ul>
              {alerts.map((a) => (
                <li key={a.alertId}>
                  {a.reason} <span className="muted small">(rule {a.source.ruleId}; {a.action})</span>
                </li>
              ))}
            </ul>
          )}
          {status.required && (
            <form action={consentAction}>
              <input type="hidden" name="athleteId" value={m.id} />
              <div className="btn-row">
                {status.active ? (
                  <button className="btn danger" type="submit" name="intent" value="withdraw">
                    Withdraw consent
                  </button>
                ) : (
                  <button className="btn" type="submit" name="intent" value="grant">
                    Give consent
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      ))}
    </>
  );
}

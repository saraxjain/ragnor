import Link from "next/link";
import { athleteOutcomeAction } from "../actions";
import { requireRole } from "@/components/Gate";
import { FlagCard, LevelBadge, UrgentNotice } from "@/components/Flags";
import { DISCLAIMER } from "@/lib/copy";
import { getDataAccess } from "@/lib/data";
import { getFollowUps, topLevel } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function AthletePage() {
  const g = await requireRole("athlete");
  if (!g.ok) return g.blocked;
  const { actor, profile } = g.session;
  const da = await getDataAccess();
  const now = new Date();
  const [evaluation, outcomes, followUps] = await Promise.all([
    da.getLatestEvaluation(actor, actor.id),
    da.listOutcomes(actor, actor.id),
    getFollowUps(da, actor, actor.id, now),
  ]);
  const flags = evaluation?.flags ?? [];
  const level = topLevel(flags);
  const lowConfidence = flags.some((f) => f.confidence === "low");

  return (
    <>
      <h1>My status ({profile.displayLabel})</h1>
      {!evaluation ? (
        <p>
          Nothing evaluated yet. <Link href="/checkin">Do today&apos;s check-in</Link>.
        </p>
      ) : (
        <>
          <p>
            <LevelBadge level={level} /> <span className="muted small">as of {evaluation.localDate}</span>
            {level === "low" && lowConfidence && <span className="muted small"> (some data is missing, see below)</span>}
          </p>
          {level === "urgent" && <UrgentNotice />}
          {flags.length === 0 && <p>No rule produced a flag from your recent check-ins.</p>}
          {flags.map((f) => {
            const mine = outcomes.filter((o) => o.flagId === f.id);
            return (
              <FlagCard key={f.id} flag={f}>
                <div className="btn-row">
                  {(["did_this", "tell_trainer"] as const).map((kind) => (
                    <form key={kind} action={athleteOutcomeAction} className="inline-form">
                      <input type="hidden" name="flagId" value={f.id} />
                      <input type="hidden" name="kind" value={kind} />
                      <button className="btn secondary" type="submit" disabled={mine.some((o) => o.kind === kind)}>
                        {kind === "did_this" ? (mine.some((o) => o.kind === kind) ? "Marked: I did this" : "I did this") : mine.some((o) => o.kind === kind) ? "Trainer told" : "Tell my trainer"}
                      </button>
                    </form>
                  ))}
                </div>
              </FlagCard>
            );
          })}
        </>
      )}
      {followUps.length > 0 && (
        <p className="card">
          You have an active 7-day follow-up after a reported head impact (day {followUps[0].day}).{" "}
          <Link href="/impact">Open follow-up</Link>
        </p>
      )}
      <p>
        <Link className="btn" href="/checkin">
          Daily check-in
        </Link>{" "}
        <Link className="btn secondary" href="/impact">
          Report a hit
        </Link>
      </p>
      <p className="card small">
        Wearables: demo mock data is in use. {" "}
        <a href="/api/wearables/google/connect">Connect Google Health</a> (needs a Google Cloud OAuth client; see docs/APP_NOTES.md).
      </p>
      <p className="muted">{DISCLAIMER}</p>
    </>
  );
}

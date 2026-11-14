import { LEVEL_LABEL, URGENT_MESSAGE } from "@/lib/copy";
import { BODY_AREA_LABELS, type BodyArea, type Level } from "@/lib/types";

export interface FlagLike {
  id: string;
  level: Level;
  bodyArea: string | null;
  reason: string;
  action: string;
  confidence: "normal" | "low";
  trainerAlert: boolean;
}

export function LevelBadge({ level }: { level: Level }) {
  return <span className={`badge lvl-${level}`}>{LEVEL_LABEL[level]}</span>;
}

export function UrgentNotice() {
  return (
    <div className="card lvl-urgent" role="alert">
      <h2 style={{ marginTop: 0 }}>Urgent: see a clinician now</h2>
      <p>{URGENT_MESSAGE}</p>
    </div>
  );
}

export function FlagCard({ flag, children }: { flag: FlagLike; children?: React.ReactNode }) {
  const area = flag.bodyArea ? (BODY_AREA_LABELS[flag.bodyArea as BodyArea] ?? flag.bodyArea) : "General";
  return (
    <article className={`card lvl-${flag.level}`} aria-label={`${LEVEL_LABEL[flag.level]}, ${area}`}>
      <p style={{ margin: "0 0 0.4rem" }}>
        <LevelBadge level={flag.level} /> <span className="badge">{area}</span>{" "}
        {flag.confidence === "low" && <span className="badge note">Low confidence</span>}{" "}
        {flag.trainerAlert && <span className="badge alert">Queued for trainer review</span>}
      </p>
      <p style={{ margin: "0 0 0.4rem" }}>
        <strong>Why:</strong> {flag.reason}
      </p>
      <p style={{ margin: 0 }}>
        <strong>Suggested action:</strong> {flag.action}
      </p>
      {children}
    </article>
  );
}

export function FlagList({ flags }: { flags: FlagLike[] }) {
  if (flags.length === 0) {
    return (
      <p className="card">
        <LevelBadge level="low" /> No rule produced a flag from your latest check-ins. A clinician decides about training and play.
      </p>
    );
  }
  return (
    <>
      {flags.map((f) => (
        <FlagCard key={f.id} flag={f} />
      ))}
    </>
  );
}

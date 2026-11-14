import Link from "next/link";
import { pickDemoProfile } from "./actions";
import { DEMO_NOTE } from "@/lib/copy";
import { isDemoMode, getDataAccess } from "@/lib/data";
import { DEMO_DESCRIPTIONS } from "@/lib/data/seed";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_BLURB: Record<(typeof ROLES)[number], string> = {
  athlete: "Daily check-in, your status, report a hit",
  trainer: "Morning roster ranked by risk",
  coach: "Availability and training load only",
  parent: "Consent for a linked minor",
};

export default async function Home() {
  if (!isDemoMode()) {
    return (
      <>
        <h1>Ragnor</h1>
        <p>Connected to Firestore. Sign-in screens are not built yet (see the README, &quot;Not done yet&quot;).</p>
      </>
    );
  }
  const da = await getDataAccess();
  const profiles = await da.listDemoProfiles();
  const session = await getSession();
  return (
    <>
      <h1>Ragnor</h1>
      <p>
        Daily athlete check-ins and transparent risk flags that an athletic trainer can read. Every flag shows its reason and one
        suggested action.
      </p>
      <p className="muted">{DEMO_NOTE} Pick who you want to be in this demo.</p>
      <p>
        <Link href="/judges">For judges: behind the scenes</Link>
      </p>
      {session && <p>Currently viewing as {session.profile.role} {session.profile.displayLabel}.</p>}
      {ROLES.map((role) => (
        <section key={role} aria-labelledby={`role-${role}`}>
          <h2 id={`role-${role}`} style={{ textTransform: "capitalize" }}>
            {role}
          </h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            {ROLE_BLURB[role]}
          </p>
          <ul className="role-list">
            {profiles
              .filter((p) => p.role === role)
              .map((p) => (
                <li key={p.id} className="card">
                  <span>
                    <strong>{p.displayLabel}</strong>
                    {DEMO_DESCRIPTIONS[p.id] && <span className="muted small"> ({DEMO_DESCRIPTIONS[p.id]})</span>}
                  </span>
                  <form action={pickDemoProfile}>
                    <input type="hidden" name="profileId" value={p.id} />
                    <button className="btn" type="submit">
                      Continue as {role} {p.displayLabel}
                    </button>
                  </form>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

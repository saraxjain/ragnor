import Link from "next/link";
import { isDemoMode } from "@/lib/data";
import { getSession, type Session } from "@/lib/session";
import type { Role } from "@/lib/types";

/** Returns the session if the user has the right role, otherwise a message to render instead. */
export async function requireRole(role: Role): Promise<{ ok: true; session: Session } | { ok: false; blocked: React.ReactNode }> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      blocked: (
        <>
          <h1>Choose a role first</h1>
          <p>
            {isDemoMode() ? (
              <>
                Pick a demo role on the <Link href="/">home page</Link>.
              </>
            ) : (
              "Sign-in is not built yet. See the README."
            )}
          </p>
        </>
      ),
    };
  }
  if (session.actor.role !== role) {
    return {
      ok: false,
      blocked: (
        <>
          <h1>This page is for the {role} role</h1>
          <p>
            You are signed in as {session.actor.role}. <Link href="/">Switch role</Link>.
          </p>
        </>
      ),
    };
  }
  return { ok: true, session };
}

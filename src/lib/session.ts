import { cookies } from "next/headers";
import { getDataAccess, isDemoMode } from "./data";
import type { Actor, Profile, Role } from "./types";

export const DEMO_COOKIE = "ragnor_demo_actor";

export interface Session {
  actor: Actor;
  profile: Profile;
}

/**
 * Who is using the app. Demo mode: the profile picked on the home page (a cookie holding a demo profile id).
 * Firestore mode: real sign-in is NOT built yet (see README "Not done yet"), so there is no session.
 */
export async function getSession(): Promise<Session | null> {
  if (!isDemoMode()) return null;
  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!id) return null;
  const da = await getDataAccess();
  const profile = (await da.listDemoProfiles()).find((p) => p.id === id);
  return profile ? { actor: { id: profile.id, role: profile.role }, profile } : null;
}

export const homeFor = (role: Role): string => ({ athlete: "/athlete", trainer: "/trainer", coach: "/coach", parent: "/parent" })[role];

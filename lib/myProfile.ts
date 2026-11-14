// The athlete profile this browser created, remembered in localStorage (there are no accounts in the demo).
export interface MyProfile {
  id: string;
  name: string;
  sport: string;
  grade: number;
  device: string;
}

const KEY = "ragnor.myProfile";

export function readMyProfile(): MyProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as MyProfile | null;
    return p && typeof p.id === "string" && typeof p.name === "string" ? p : null;
  } catch {
    return null; // private window or blocked storage: the app still works with the demo athletes
  }
}

export function saveMyProfile(p: MyProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function forgetMyProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The demo store is in memory, so a server restart drops self-created profiles. Returns true if the profile had to be put back. */
export async function restoreIfMissing(p: MyProfile): Promise<boolean> {
  const check = await fetch(`/api/athletes/${p.id}`, { cache: "no-store" });
  if (check.status !== 404) return false;
  const res = await fetch("/api/athletes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
  return res.ok;
}

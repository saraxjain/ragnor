import { ok, fail, readJson } from "@/lib/http.ts";
import { createAthlete, listAthletes, parseNewAthlete, state, USER_ID_RE } from "@/lib/store.ts";

export const dynamic = "force-dynamic";
const MAX_USER_PROFILES = 200; // the demo store is in memory; keep it bounded

export async function GET() {
  return ok({ athletes: listAthletes().map((a) => ({ id: a.id, name: a.name, sport: a.sport, grade: a.grade, self_created: USER_ID_RE.test(a.id) })) });
}

/** Create your own athlete profile. Send `id` (one this browser was given before) to restore it after a server restart. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await readJson<unknown>(req);
  } catch {
    return fail("Request body must be JSON.");
  }
  const parsed = parseNewAthlete(body);
  if ("error" in parsed) return fail(parsed.error);
  const rawId = (body as { id?: unknown })?.id;
  const id = typeof rawId === "string" && USER_ID_RE.test(rawId) ? rawId : undefined;
  const count = [...state().athletes.keys()].filter((k) => USER_ID_RE.test(k)).length;
  if (count >= MAX_USER_PROFILES && !(id && state().athletes.has(id))) return fail("The demo is full. Ask the team to reset it.", 429);
  const a = createAthlete(parsed.value, id);
  return ok({ athlete: { id: a.id, name: a.name, sport: a.sport, grade: a.grade, device: a.device } }, 201);
}

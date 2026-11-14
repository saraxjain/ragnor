import { ok, fail, readJson } from "@/lib/http.ts";
import { addSignup } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await readJson<{ name?: string; email?: string; school?: string; role?: string; athletes?: number; plan?: string }>(req);
  const email = (b.email ?? "").trim();
  if (!b.name?.trim() || !b.school?.trim()) return fail("Please add your name and school.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Please enter a valid email.");
  const s = addSignup({ name: b.name.trim(), email, school: b.school.trim(), role: b.role ?? "coach", athletes: b.athletes, plan: ["high_school", "university", "pro"].includes(String(b.plan)) ? String(b.plan) : undefined });
  return ok({ ok: true, id: s.id });
}

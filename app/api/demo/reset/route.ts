import { ok } from "@/lib/http.ts";
import { resetDemo } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export async function POST() {
  resetDemo();
  return ok({ reset: true });
}

// Engine API keys (per tenant). Demo key works out of the box; set RAGNOR_API_KEYS="key1:Tenant A,key2:Tenant B".
import { NextResponse } from "next/server";
import { audit } from "./store.ts";

export const DEMO_KEY = "rg_demo_westbrook_2026";

function keys(): Map<string, string> {
  const m = new Map<string, string>([[DEMO_KEY, "Westbrook High (demo tenant)"]]);
  for (const pair of (process.env.RAGNOR_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [k, name] = pair.split(":");
    if (k) m.set(k, name ?? "tenant");
  }
  return m;
}

export function requireKey(req: Request, scope: string): { tenant: string } | NextResponse {
  const key = req.headers.get("x-api-key") ?? new URL(req.url).searchParams.get("api_key") ?? "";
  const tenant = keys().get(key);
  if (!tenant) return NextResponse.json({ error: "invalid_api_key", hint: "Send x-api-key. Demo key: " + DEMO_KEY }, { status: 401 });
  audit(`api:${tenant}`, "api_call", scope);
  return { tenant };
}

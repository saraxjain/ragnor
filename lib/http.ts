import { NextResponse } from "next/server";
import { config } from "./config.ts";

export const ok = (data: unknown, init?: number) => NextResponse.json(data, { status: init ?? 200 });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Agent tool webhooks: if RAGNOR_TOOL_SECRET is set, require it in the x-ragnor-secret header. */
export function toolAuthorized(req: Request): boolean {
  if (!config.toolSecret) return true;
  return req.headers.get("x-ragnor-secret") === config.toolSecret;
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Request body must be JSON");
  }
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

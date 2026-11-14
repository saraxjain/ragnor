import { getDataAccess, isDemoMode } from "@/lib/data";
import { DEMO_IDS } from "@/lib/data/seed";
import { createGeminiClient } from "@/lib/panel/gemini-client";
import { buildCaseBrief } from "@/lib/panel/brief";
import { gatherExtras } from "@/lib/services";
import { runPanelSession } from "@/lib/panel/orchestrator";
import type { PanelEvent } from "@/lib/panel/types";
import { addDays, localDateOf } from "@/lib/time";
import type { Actor } from "@/lib/types";
import { THRESHOLDS } from "@/lib/rules/thresholds";

// Server-side only: GEMINI_API_KEY is read here (via the client factory) and never reaches the browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as typeof globalThis & { __ragnorLivePanelRunning?: boolean };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(request: Request): Promise<Response> {
  // Real athlete data must never reach a judges page: demo mode only.
  if (!isDemoMode()) {
    return json(403, { error: "The behind-the-scenes panel is available in demo mode only. It is switched off when Firestore is configured." });
  }
  let athleteId = "";
  try {
    const body = (await request.json()) as { athleteId?: unknown };
    athleteId = typeof body.athleteId === "string" ? body.athleteId : "";
  } catch {
    return json(400, { error: "Send JSON like {\"athleteId\": \"...\"}." });
  }

  const da = await getDataAccess();
  const athlete = (await da.listDemoProfiles()).find((p) => p.id === athleteId && p.role === "athlete");
  if (!athlete) return json(404, { error: "Unknown demo athlete." });

  // Read through the guarded data layer as the demo trainer. Nothing is written: no flags, no audit rows.
  const actor: Actor = { id: DEMO_IDS.trainer, role: "trainer" };
  const now = new Date();
  const today = localDateOf(now, athlete.timezone);
  const [checkins, impacts, logs] = await Promise.all([
    da.listCheckins(actor, athlete.id, addDays(today, -(THRESHOLDS.LOOKBACK_DAYS - 1)), today),
    da.listImpacts(actor, athlete.id),
    da.listSymptomLogs(actor, athlete.id),
  ]);
  const extras = await gatherExtras(da, actor, athlete.id, athlete.timezone, now);
  const { brief, flags } = buildCaseBrief({ profile: athlete, checkins, impacts, logs, now, extras });

  const client = createGeminiClient();
  if (client && g.__ragnorLivePanelRunning) {
    return json(429, { error: "A live panel run is already in progress. Try again when it finishes." });
  }
  if (client) g.__ragnorLivePanelRunning = true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: PanelEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* the client went away */
        }
      };
      try {
        await runPanelSession({
          brief,
          flags,
          client,
          noClientReason: "No GEMINI_API_KEY is configured on the server, so no AI model was called.",
          emit,
          signal: request.signal,
        });
      } finally {
        if (client) g.__ragnorLivePanelRunning = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

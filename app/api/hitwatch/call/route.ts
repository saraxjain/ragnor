import { ok, fail, readJson, errorMessage } from "@/lib/http.ts";
import { getAthlete } from "@/lib/store.ts";
import { config, live } from "@/lib/config.ts";
import { startOutboundCall, getSignedUrl } from "@/lib/elevenlabs.ts";

export const dynamic = "force-dynamic";

/**
 * Start today's HitWatch call. Picks the best available mode:
 *  - "phone": ElevenLabs outbound call to a real phone (needs agent, phone number id and a destination number)
 *  - "web":   ElevenLabs voice call in the browser (needs agent id)
 *  - "simulated": scripted demo call processed by Gemini function calling (or the rules engine without a key)
 */
export async function POST(req: Request) {
  try {
    const { athlete_id, prefer, to } = await readJson<{ athlete_id: string; prefer?: "phone" | "web" | "simulated"; to?: string }>(req);
    const a = getAthlete(athlete_id);
    if (!a?.hitwatch) return fail("This athlete has no active HitWatch case.", 400);
    const day = Math.max(...a.hitwatch.calls.map((c) => c.day), -1) + 1;
    const vars = {
      athlete_first_name: a.name.split(" ")[0],
      athlete_id: a.id,
      hit_id: a.hitwatch.hit_id,
      day,
      hit_description: a.hitwatch.hit_description,
      coach_name: "Coach",
    };
    const toNumber = to || a.phone || config.demoCallToNumber;

    if ((prefer ?? "phone") === "phone" && live.elevenPhone() && toNumber) {
      const r = await startOutboundCall({ to: toNumber, dynamicVariables: vars });
      return ok({ mode: "phone", day, conversation_id: r.conversation_id, to: toNumber.replace(/.(?=.{4})/g, "•") });
    }
    if (prefer !== "simulated" && live.elevenWeb()) {
      return ok({ mode: "web", day, agent_id: config.elevenAgentId, signed_url: await getSignedUrl(), dynamic_variables: vars });
    }
    return ok({ mode: "simulated", day, dynamic_variables: vars });
  } catch (e) {
    return fail(`Couldn't start the call: ${errorMessage(e)}`, 500);
  }
}

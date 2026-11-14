// ElevenLabs conversational agent: outbound phone calls (Twilio-backed number) and signed URLs for web calls.
import { config, live } from "./config.ts";

const API = "https://api.elevenlabs.io/v1";

export async function startOutboundCall(opts: { to: string; dynamicVariables: Record<string, string | number> }) {
  if (!live.elevenPhone()) throw new Error("ElevenLabs phone calling not configured");
  const res = await fetch(`${API}/convai/twilio/outbound-call`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: config.elevenAgentId,
      agent_phone_number_id: config.elevenPhoneNumberId,
      to_number: opts.to,
      conversation_initiation_client_data: { dynamic_variables: opts.dynamicVariables },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ElevenLabs outbound call failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  return body as { success?: boolean; conversation_id?: string; callSid?: string };
}

/** Signed URL for a private agent (web call). Public agents can connect with the agent id alone. */
export async function getSignedUrl(): Promise<string | null> {
  if (!config.elevenKey || !config.elevenAgentId) return null;
  const res = await fetch(`${API}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(config.elevenAgentId)}`, {
    headers: { "xi-api-key": config.elevenKey },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { signed_url?: string };
  return body.signed_url ?? null;
}

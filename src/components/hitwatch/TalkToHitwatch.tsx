"use client";

import { useConversation } from "@elevenlabs/react";
import { useState } from "react";

/**
 * In-browser "Talk to HitWatch" using the ElevenLabs React SDK (@elevenlabs/react, useConversation / startSession with a signed URL).
 * Needs ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID on the server. Audio goes to ElevenLabs; this app stores no audio.
 */
export function TalkToHitwatch({ impactId, day }: { impactId: string; day: number }) {
  const conversation = useConversation();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const connected = conversation.status === "connected";

  async function start() {
    setError(null);
    setStarting(true);
    try {
      // Explain first, then ask the browser for the microphone.
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await fetch(`/api/hitwatch/signed-url?impact_id=${encodeURIComponent(impactId)}`);
      const j = (await res.json()) as { signed_url?: string; dynamic_variables?: Record<string, string>; error?: string };
      if (!res.ok || !j.signed_url) throw new Error(j.error ?? "Could not start a voice session.");
      await conversation.startSession({ signedUrl: j.signed_url, dynamicVariables: j.dynamic_variables });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a voice session.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Talk to HitWatch (day {day})</h3>
      <p className="small muted">
        Your browser will ask for the microphone. Your voice goes to ElevenLabs for this conversation. This app does not store the audio. If you have a danger sign, get medical help now instead of using the app.
      </p>
      <div className="btn-row">
        {!connected ? (
          <button className="btn" type="button" onClick={start} disabled={starting}>
            {starting ? "Connecting..." : "Start talking"}
          </button>
        ) : (
          <button className="btn danger" type="button" onClick={() => conversation.endSession()}>
            End conversation
          </button>
        )}
      </div>
      <p role="status" className="small">
        {connected ? (conversation.isSpeaking ? "HitWatch is speaking..." : "Listening...") : "Not connected."}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

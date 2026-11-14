"use client";
// Records a short clip from the device camera in the browser (works on laptops, where the file input cannot open a camera).
import { useEffect, useRef, useState } from "react";
import { IconStop, IconVideo } from "@/components/icons.tsx";

const MIME_CHOICES = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const COUNTDOWN_S = 3;

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

type Phase = "starting" | "ready" | "countdown" | "recording" | "error";

export function CameraRecorder({ onDone, onCancel, maxSeconds = 10 }: { onDone: (file: File) => void; onCancel: () => void; maxSeconds?: number }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [count, setCount] = useState(COUNTDOWN_S);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const keep = useRef(true); // false when the athlete cancels mid-recording
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Open the camera (again when the athlete flips between back and front).
  useEffect(() => {
    let cancelled = false;
    setPhase("starting");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setMessage(
          name === "NotAllowedError" ? "Camera access is blocked. Allow the camera for this site in your browser, or upload a video instead."
            : name === "NotFoundError" ? "We couldn't find a camera on this device. Upload a video instead."
              : "We couldn't open the camera. Close other apps that are using it, or upload a video instead.",
        );
        setPhase("error");
      });
    return () => {
      cancelled = true;
      clearTimer();
      keep.current = false;
      if (recRef.current?.state === "recording") recRef.current.stop();
      stopStream();
    };
  }, [facing]);

  function startCountdown() {
    keep.current = true;
    setCount(COUNTDOWN_S);
    setPhase("countdown");
    let n = COUNTDOWN_S;
    timer.current = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearTimer();
        startRecording();
      }
    }, 1000);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = MIME_CHOICES.find((m) => MediaRecorder.isTypeSupported(m));
    let rec: MediaRecorder;
    try {
      // ~2.5 Mbps keeps a 10-second clip near 3 MB, well under the 18 MB upload limit.
      rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000 });
    } catch {
      setMessage("This browser can't record video. Upload a video instead.");
      setPhase("error");
      return;
    }
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      clearTimer();
      if (!keep.current || chunks.current.length === 0) return;
      const type = (rec.mimeType || mimeType || "video/webm").split(";")[0];
      stopStream();
      doneRef.current(new File(chunks.current, `landing.${type === "video/mp4" ? "mp4" : "webm"}`, { type }));
    };
    rec.start();
    recRef.current = rec;
    setSeconds(0);
    setPhase("recording");
    let s = 0;
    timer.current = setInterval(() => {
      s += 1;
      setSeconds(s);
      if (s >= maxSeconds) stopRecording();
    }, 1000);
  }

  function stopRecording() {
    clearTimer();
    if (recRef.current?.state === "recording") recRef.current.stop();
  }

  function cancel() {
    keep.current = false;
    clearTimer();
    if (recRef.current?.state === "recording") recRef.current.stop();
    stopStream();
    onCancel();
  }

  if (phase === "error") {
    return (
      <div className="stack" style={{ alignItems: "center", textAlign: "center" }}>
        <div className="banner banner-warn" role="alert"><div>{message}</div></div>
        <button className="btn btn-tonal" onClick={cancel}>Back</button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
      <div className="video-wrap" style={{ position: "relative" }}>
        <video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" style={facing === "user" ? { transform: "scaleX(-1)" } : undefined} />
        {phase === "countdown" && (
          <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 96, fontWeight: 800 }}>{count}</div>
        )}
        {phase === "recording" && (
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 14, fontWeight: 700 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: "#ff4d4f" }} /> REC 0:{String(seconds).padStart(2, "0")} / 0:{String(maxSeconds).padStart(2, "0")}
          </div>
        )}
      </div>
      <div className="small muted center" role="status" aria-live="polite">
        {phase === "starting" ? "Opening the camera…"
          : phase === "ready" ? `Prop the device up so your whole body is in frame. You get a ${COUNTDOWN_S}-second countdown, then up to ${maxSeconds} seconds.`
            : phase === "countdown" ? `Recording starts in ${count}…`
              : "Recording. Step off, land, jump straight up."}
      </div>
      <div className="row wrap" style={{ justifyContent: "center" }}>
        {phase === "recording" ? (
          <button className="btn btn-filled" style={{ background: "var(--high)" }} onClick={stopRecording}><IconStop size={18} /> Stop and use this clip</button>
        ) : (
          <button className="btn btn-filled" onClick={startCountdown} disabled={phase !== "ready"}><IconVideo size={18} /> Start recording</button>
        )}
        {phase === "ready" && <button className="btn btn-text" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>Flip camera</button>}
        <button className="btn btn-text" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}

"use client";
// Takes one still picture with the device camera, in the page (works on laptops and phones).
import { useEffect, useRef, useState } from "react";
import { IconCamera } from "@/components/icons.tsx";

export function photoCameraSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function PhotoCamera({ onDone, onCancel }: { onDone: (file: File) => void; onCancel: () => void }) {
  const [phase, setPhase] = useState<"starting" | "ready" | "error">("starting");
  const [message, setMessage] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Open the camera (again when the athlete flips between back and front), and always release it on the way out.
  useEffect(() => {
    let cancelled = false;
    setPhase("starting");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
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
          name === "NotAllowedError" ? "Camera access is blocked. Allow the camera for this site in your browser, or upload a photo instead."
            : name === "NotFoundError" ? "We couldn't find a camera on this device. Upload a photo instead."
              : "We couldn't open the camera. Close other apps that are using it, or upload a photo instead.",
        );
        setPhase("error");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob((blob) => { if (blob) onDone(new File([blob], "checkin.jpg", { type: "image/jpeg" })); }, "image/jpeg", 0.9);
  }

  return (
    <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
      {phase === "error" ? <div className="banner banner-error" role="alert">{message}</div> : (
        <div className="ci-cam">
          <video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" style={facing === "user" ? { transform: "scaleX(-1)" } : undefined} />
          {phase === "starting" && <div className="ci-cam-wait"><span className="spinner" /> Opening the camera…</div>}
        </div>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        {phase !== "error" && <button className="btn btn-filled" onClick={snap} disabled={phase !== "ready"}><IconCamera size={18} /> Take the picture</button>}
        {phase !== "error" && <button className="btn btn-outlined" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} disabled={phase !== "ready"}>Flip camera</button>}
        <button className="btn btn-text" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export default function InterviewCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setError("");
        setReady(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });

        if (cancelled) return;

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;

        await video.play();
        if (cancelled) return;

        setReady(true);
      } catch (e: any) {
        setError(e?.message || "Camera init failed");
      }
    }

    init();

    return () => {
      cancelled = true;

      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {!ready && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.75)",
            fontSize: 12,
            zIndex: 2,
          }}
        >
          loading camera…
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#ff6b6b",
            fontSize: 12,
            padding: 12,
            textAlign: "center",
            zIndex: 2,
          }}
        >
          {error}
        </div>
      )}

      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)", // mirror
          display: "block",
          background: "#111",
        }}
      />
    </div>
  );
}

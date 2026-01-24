"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

type Rect = { minX: number; minY: number; maxX: number; maxY: number };

function pointInRect(x: number, y: number, r: Rect) {
  return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
}

export default function InterviewCamera({
  onHandOverFaceChange,
  onHandOverFaceCountChange,
}: {
  onHandOverFaceChange?: (over: boolean) => void;
  onHandOverFaceCountChange?: (count: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const faceRef = useRef<FaceLandmarker | null>(null);
  const handRef = useRef<HandLandmarker | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const lastInferRef = useRef(0);

  // stability + event counting
  const overCountRef = useRef(0);
  const lastStableRef = useRef(false);
  const eventCountRef = useRef(0);

  const cbOverRef = useRef(onHandOverFaceChange);
  const cbCountRef = useRef(onHandOverFaceCountChange);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  // ✅ ADD: state used only for UI render (refs don't re-render)
  const [handOverFace, setHandOverFace] = useState(false);

  useEffect(() => {
    cbOverRef.current = onHandOverFaceChange;
  }, [onHandOverFaceChange]);

  useEffect(() => {
    cbCountRef.current = onHandOverFaceCountChange;
  }, [onHandOverFaceCountChange]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setError("");
        setReady(false);

        // 1) camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
          audio: false,
        });
        if (cancelled) return;
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        // 2) models
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
        );

        faceRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });

        handRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });

        runningRef.current = true;
        setReady(true);
        loop();
      } catch (e: any) {
        setError(e?.message || "Camera/MediaPipe init failed");
      }
    }

    function loop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const face = faceRef.current;
      const hand = handRef.current;

      if (!runningRef.current || !video || !canvas || !face || !hand) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // draw clean mirrored frame (no overlay)
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      // throttle inference
      const now = performance.now();
      const INFER_EVERY_MS = 80;
      if (now - lastInferRef.current < INFER_EVERY_MS) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastInferRef.current = now;

      // inference
      const faceRes = face.detectForVideo(video, now);
      const handRes = hand.detectForVideo(video, now);

      const faceLandmarks = faceRes.faceLandmarks?.[0] ?? null;
      const handsLm = handRes.landmarks ?? [];

      // face bounding rect in pixel coords (mirrored X)
      let faceRect: Rect | null = null;
      if (faceLandmarks && faceLandmarks.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const lm of faceLandmarks) {
          const x = (1 - lm.x) * w;
          const y = lm.y * h;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }

        const padX = (maxX - minX) * 0.25;
        const padY = (maxY - minY) * 0.25;

        faceRect = {
          minX: Math.max(0, minX - padX),
          minY: Math.max(0, minY - padY),
          maxX: Math.min(w, maxX + padX),
          maxY: Math.min(h, maxY + padY),
        };
      }

      // fingertip overlap test
      const tipIdx = [4, 8, 12, 16, 20];
      let overRaw = false;

      if (faceRect && handsLm.length) {
        for (const oneHand of handsLm) {
          for (const idx of tipIdx) {
            const lm = oneHand[idx];
            if (!lm) continue;

            const x = (1 - lm.x) * w;
            const y = lm.y * h;

            if (pointInRect(x, y, faceRect)) {
              overRaw = true;
              break;
            }
          }
          if (overRaw) break;
        }
      }

      // stable detection (anti flicker)
      if (overRaw) overCountRef.current += 1;
      else overCountRef.current = 0;

      const stableOver = overCountRef.current >= 3;

      // state change + count rising edge
      if (stableOver !== lastStableRef.current) {
        // rising edge: false -> true
        if (!lastStableRef.current && stableOver) {
          eventCountRef.current += 1;
          cbCountRef.current?.(eventCountRef.current);
        }

        lastStableRef.current = stableOver;
        cbOverRef.current?.(stableOver);

        // ✅ ADD: trigger UI update for alert
        setHandOverFace(stableOver);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    init();

    return () => {
      cancelled = true;
      runningRef.current = false;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      faceRef.current?.close();
      handRef.current?.close();
      faceRef.current = null;
      handRef.current = null;

      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: 320 }}>
      {/* optional tiny status (not on frame) */}
      {!ready && !error && <div style={{ opacity: 0.7, marginBottom: 6 }}>loading…</div>}
      {error && <div style={{ color: "red", marginBottom: 6 }}>{error}</div>}

      {/* Hidden video; we display the mirrored canvas */}
      <video ref={videoRef} playsInline muted style={{ display: "none" }} />

      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 12,
          border: "1px solid #333",
          background: "#111",
          display: "block",
        }}
      />

      {/* ✅ FIX: render from state (not ref), so it actually updates */}
      {handOverFace && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(255, 0, 0, 0.12)",
            border: "1px solid rgba(255, 0, 0, 0.5)",
            color: "#ff4d4d",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Please keep your hands away from your face
        </div>
      )}
    </div>
  );
}

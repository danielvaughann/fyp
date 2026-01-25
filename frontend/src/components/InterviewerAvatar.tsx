"use client";

import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Center, useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Props = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isSpeaking: boolean;
};

export default function InterviewerAvatar({ audioRef, isSpeaking }: Props) {
  const [ready, setReady] = useState(false);

  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", position: "relative" }}>
      {!ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "#fff",
            zIndex: 5,
            fontSize: 14,
            color: "#555",
          }}
        >
          Loading interviewer...
        </div>
      )}

      <div style={{ width: "100%", height: "100%", opacity: ready ? 1 : 0 }}>
        <Canvas
          frameloop="demand"
          dpr={1}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{ fov: 22, position: [0, 1.6, 0.6] }}
          onCreated={({ gl }) => {
            gl.setClearColor("#ffffff", 1);
          }}
        >
          <InvalidateLoop active={isSpeaking} />

          {/* More realistic lighting (key + fill + rim) */}
          <ambientLight intensity={0.32} />
          <directionalLight position={[2.5, 3.5, 2.2]} intensity={1.25} />
          <directionalLight position={[-2.5, 2.0, 1.0]} intensity={0.55} />
          <directionalLight position={[-3.5, 2.2, -2.5]} intensity={0.55} />

          <Suspense fallback={null}>
            <Center>
              <AvatarModel audioRef={audioRef} isSpeaking={isSpeaking} onReady={() => setReady(true)} />
            </Center>
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

// Only redraw while speaking (~30fps). Also do a tiny idle redraw (~6fps) so blink/head idle still happens.
function InvalidateLoop({ active }: { active: boolean }) {
  const { invalidate } = useThree();

  useEffect(() => {
    invalidate();

    const fps = active ? 30 : 6;
    const ms = Math.round(1000 / fps);
    const id = window.setInterval(() => invalidate(), ms);

    return () => window.clearInterval(id);
  }, [invalidate, active]);

  return null;
}

function AvatarModel({ audioRef, isSpeaking, onReady }: Props & { onReady: () => void }) {
  const gltf = useGLTF("/avatars/interviewer.glb");
  const scene = gltf.scene;

  const { camera, invalidate } = useThree();
  const cam = camera as THREE.PerspectiveCamera;

  // Mesh + morph refs
  const mouthMesh = useRef<any>(null);
  const mouthIdxRef = useRef<number | null>(null);

  const blinkMesh = useRef<any>(null);
  const blinkIdxRef = useRef<number | null>(null);

  // Visemes (optional)
  const visemeMesh = useRef<any>(null);
  const visemeAA = useRef<number | null>(null);
  const visemeOH = useRef<number | null>(null);
  const visemeFF = useRef<number | null>(null);

  // Head sway
  const headObjRef = useRef<THREE.Object3D | null>(null);

  // Audio analysis
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const attachedAudioElRef = useRef<HTMLAudioElement | null>(null);

  const bufRef = useRef<Uint8Array | null>(null);

  // Mouth smoothing
  const mouthValue = useRef(0);

  // Blink timing
  const blinkValue = useRef(0);
  const nextBlinkAt = useRef(performance.now() + 900 + Math.random() * 2500);

  // Debug
  const loggedMorphsRef = useRef(false);
  const loggedSelectionsRef = useRef(false);
  const lastAudioLogRef = useRef(0);

  // Tuning (you can tweak later)
  const NOISE_GATE = 0.02;         // RMS gate
  const MOUTH_SCALE = 6.5;         // RMS -> mouth open
  const MOUTH_MULT = 2.2;          // morph influence multiplier (lower is less cartoony)
  const ATTACK = 0.32;
  const RELEASE = 0.18;

  useLayoutEffect(() => {
    scene.updateMatrixWorld(true);

    // Center model at origin
    const rawBox = new THREE.Box3().setFromObject(scene);
    const rawCenter = rawBox.getCenter(new THREE.Vector3());
    scene.position.sub(rawCenter);
    scene.updateMatrixWorld(true);

    // Frame head
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const headY = box.max.y - size.y * 0.08;
    const dist = Math.max(0.55, maxDim * 0.58);

    cam.fov = 22;
    cam.position.set(0, headY, dist);
    cam.near = 0.01;
    cam.far = 100;
    cam.lookAt(0, headY, 0);
    cam.updateProjectionMatrix();

    // Find best morph mesh (usually face)
    mouthMesh.current = pickBestMouthMesh(scene);

    if (!mouthMesh.current) {
      console.log("[AVATAR] No morph-target mesh found. Mouth/viseme/blink won't work.");
    } else {
      console.log("[AVATAR] Mouth candidate mesh:", mouthMesh.current.name || "(unnamed)");
    }

    // Log morph target names once (to see what your GLB has)
    if (mouthMesh.current && mouthMesh.current.morphTargetDictionary && !loggedMorphsRef.current) {
      const keys = Object.keys(mouthMesh.current.morphTargetDictionary);
      console.log("[AVATAR] Morph targets found:", keys);
      loggedMorphsRef.current = true;
    }

    // Setup mouth morph index (jaw open / mouth open / any viseme)
    mouthIdxRef.current = findMorphIndex(mouthMesh.current, [
      "mouthopen",
      "jawopen",
      "jaw_open",
      "mouth_open",
      "viseme_aa",
      "visemeaa",
      "viseme",
      "mouth",
      "jaw",
    ]);

    // Setup blink (try common names)
    blinkMesh.current = mouthMesh.current;
    blinkIdxRef.current = findMorphIndex(blinkMesh.current, [
      "blink",
      "eyeblink",
      "eye_blink",
      "eyeclose",
      "eye_close",
      "eyesclosed",
      "lid",
    ]);

    // Setup visemes if present
    visemeMesh.current = mouthMesh.current;
    visemeAA.current = findMorphIndex(visemeMesh.current, ["viseme_aa", "visemeaa", "aa"]);
    visemeOH.current = findMorphIndex(visemeMesh.current, ["viseme_oh", "visemeoh", "oh"]);
    visemeFF.current = findMorphIndex(visemeMesh.current, ["viseme_ff", "visemeff", "ff", "f", "v"]);

    // Head object / bone search (logs what it picked)
    headObjRef.current = findHeadObject(scene);
    if (headObjRef.current) {
      console.log("[AVATAR] Head object for sway:", headObjRef.current.name || headObjRef.current.type);
    } else {
      console.log("[AVATAR] No head object/bone found for sway (fine, sway will be skipped).");
    }

    // Log what we selected
    if (!loggedSelectionsRef.current) {
      console.log("[AVATAR] Selected mouth idx:", mouthIdxRef.current);
      console.log("[AVATAR] Selected blink idx:", blinkIdxRef.current);
      console.log("[AVATAR] Selected viseme idxs:", {
        aa: visemeAA.current,
        oh: visemeOH.current,
        ff: visemeFF.current,
      });

      if (mouthIdxRef.current === null) {
        console.log("[AVATAR] ⚠️ No mouth/jaw morph found. Mouth movement won't work.");
      }
      if (blinkIdxRef.current === null) {
        console.log("[AVATAR] ℹ️ No blink morph found. Blinking won't work (your GLB may not include it).");
      }
      if (visemeAA.current === null && visemeOH.current === null && visemeFF.current === null) {
        console.log("[AVATAR] ℹ️ No viseme morphs found. Viseme blending will be skipped.");
      }

      loggedSelectionsRef.current = true;
    }

    invalidate();
    onReady();
  }, [scene, cam, invalidate, onReady]);

  // Attach analyser to persistent <audio>
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (attachedAudioElRef.current === audioEl && analyserRef.current && audioCtxRef.current) {
      return;
    }

    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = audioCtxRef.current ?? new Ctx();
    const analyser = analyserRef.current ?? ctx.createAnalyser();
    analyser.fftSize = 1024;

    try {
      sourceRef.current?.disconnect();
    } catch {}

    try {
      const src = ctx.createMediaElementSource(audioEl);
      src.connect(analyser);
      analyser.connect(ctx.destination);

      sourceRef.current = src;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      attachedAudioElRef.current = audioEl;

      if (!bufRef.current) bufRef.current = new Uint8Array(analyser.fftSize);

      const resume = () => {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
      };

      audioEl.addEventListener("play", resume);
      resume();

      console.log("[AVATAR][AUDIO] analyser attached. fftSize:", analyser.fftSize);

      return () => {
        audioEl.removeEventListener("play", resume);
      };
    } catch (e) {
      console.log("[AVATAR][AUDIO] Failed to attach analyser:", e);
      attachedAudioElRef.current = audioEl;
    }
  }, [audioRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.disconnect();
      } catch {}
      try {
        analyserRef.current?.disconnect();
      } catch {}
      audioCtxRef.current?.close().catch(() => {});
      sourceRef.current = null;
      analyserRef.current = null;
      audioCtxRef.current = null;
      bufRef.current = null;
      attachedAudioElRef.current = null;
    };
  }, []);

  useFrame(() => {
    // Head sway (cheap "alive" factor)
    if (headObjRef.current) {
      const t = performance.now() * 0.001;
      const intensity = isSpeaking ? 1.0 : 0.35;
      headObjRef.current.rotation.y = Math.sin(t * 1.25) * 0.04 * intensity;
      headObjRef.current.rotation.x = Math.sin(t * 0.9) * 0.02 * intensity;
    }

    // Blink (if available)
    if (blinkMesh.current && blinkIdxRef.current !== null && blinkMesh.current.morphTargetInfluences) {
      const now = performance.now();

      // Start blink at scheduled time
      if (now >= nextBlinkAt.current) {
        const dt = now - nextBlinkAt.current; // ms since blink start
        const dur = 220; // ms total blink duration
        const t = dt / dur;

        if (t < 1) {
          // triangle: 0->1->0
          blinkValue.current = t < 0.5 ? t * 2 : (1 - t) * 2;
        } else {
          blinkValue.current = 0;
          nextBlinkAt.current = now + 1200 + Math.random() * 3500;
        }

        blinkMesh.current.morphTargetInfluences[blinkIdxRef.current] = blinkValue.current;
      }
    }

    // Mouth / visemes
    const mesh: any = mouthMesh.current;
    const idx = mouthIdxRef.current;
    if (!mesh || idx === null || !mesh.morphTargetInfluences) return;

    let target = 0;
    let rms = 0;

    if (isSpeaking && analyserRef.current && bufRef.current) {
      const buf = bufRef.current;
      analyserRef.current.getByteTimeDomainData(buf);

      // RMS (more natural than peak-to-peak)
      let sum = 0;
      for (let i = 0; i < buf.length; i += 2) {
        const v = (buf[i] - 128) / 128; // -1..1
        sum += v * v;
      }
      rms = Math.sqrt(sum / (buf.length / 2)); // ~0..1

      const amp = Math.max(0, rms - NOISE_GATE);
      target = Math.min(1, amp * MOUTH_SCALE);

      // Curve (natural response)
      target = target * target;

      // Micro variation
      const wobble =
        (Math.sin(performance.now() * 0.03) + Math.sin(performance.now() * 0.017)) * 0.02;
      target = Math.min(1, Math.max(0, target + wobble));
    } else if (isSpeaking) {
      // fallback if analyser not available
      target = (Math.sin(performance.now() * 0.02) * 0.5 + 0.5) * 0.22;
    } else {
      target = 0;
    }

    // Log RMS sometimes to verify audio analysis is working
    const now = performance.now();
    if (isSpeaking && now - lastAudioLogRef.current > 800) {
      lastAudioLogRef.current = now;
      console.log("[AVATAR][AUDIO] speaking rms:", rms.toFixed(4), "target:", target.toFixed(3));
    }

    // Smooth open/close
    const current = mouthValue.current;
    const k = target > current ? ATTACK : RELEASE;
    mouthValue.current = current + (target - current) * k;

    // Apply jaw/mouth open
    mesh.morphTargetInfluences[idx] = Math.min(1, mouthValue.current * MOUTH_MULT);

    // Optional viseme blending if present
    // This is a cheap approximation: quiet->FF, medium->AA, loud->OH
    if (
      visemeMesh.current &&
      visemeMesh.current.morphTargetInfluences &&
      (visemeAA.current !== null || visemeOH.current !== null || visemeFF.current !== null)
    ) {
      const v = mouthValue.current; // 0..1
      const ff = clamp01(1 - v * 2);                  // strongest when small mouth
      const aa = clamp01(1 - Math.abs(v - 0.45) * 3); // mid
      const oh = clamp01((v - 0.35) * 1.8);           // stronger when more open

      if (visemeFF.current !== null) visemeMesh.current.morphTargetInfluences[visemeFF.current] = ff * 0.6;
      if (visemeAA.current !== null) visemeMesh.current.morphTargetInfluences[visemeAA.current] = aa * 0.75;
      if (visemeOH.current !== null) visemeMesh.current.morphTargetInfluences[visemeOH.current] = oh * 0.65;
    }
  });

  return <primitive object={scene} />;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// Finds first morph target index whose name contains any needle
function findMorphIndex(mesh: any, needles: string[]) {
  if (!mesh?.morphTargetDictionary) return null;
  const dict = mesh.morphTargetDictionary as Record<string, number>;
  const keys = Object.keys(dict);

  const hit = keys.find((k) => {
    const s = k.toLowerCase();
    return needles.some((n) => s.includes(n.toLowerCase()));
  });

  return hit ? dict[hit] : null;
}

function pickBestMouthMesh(root: THREE.Object3D) {
  const candidates: any[] = [];
  root.traverse((obj: any) => {
    if ((obj.isMesh || obj.isSkinnedMesh) && obj.morphTargetDictionary) candidates.push(obj);
  });

  const score = (m: any) => {
    const name = (m.name || "").toLowerCase();
    const keys = Object.keys(m.morphTargetDictionary || {}).map((k) => k.toLowerCase());

    let s = 0;
    if (name.includes("eye")) s -= 100;
    if (name.includes("head") || name.includes("face") || name.includes("mouth")) s += 50;

    if (keys.includes("mouthopen") || keys.includes("jawopen") || keys.includes("jaw_open") || keys.includes("mouth_open")) s += 250;
    if (keys.some((k) => k.includes("viseme"))) s += 80;
    if (keys.some((k) => k.includes("mouth") || k.includes("jaw"))) s += 25;

    return s;
  };

  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] ?? null;
}

function findHeadObject(root: THREE.Object3D): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;

  root.traverse((obj) => {
    const n = (obj.name || "").toLowerCase();
    // Prefer obvious head bones/objects
    if (n.includes("head")) best = obj;
    if (!best && (obj as any).isBone && (n.includes("neck") || n.includes("spine"))) best = obj;
  });

  // If we found something named head, return that
  if (best) return best;

  // fallback: first bone (not ideal but gives motion sometimes)
  let firstBone: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (!firstBone && (obj as any).isBone) firstBone = obj;
  });

  return firstBone;
}

useGLTF.preload("/avatars/interviewer.glb");

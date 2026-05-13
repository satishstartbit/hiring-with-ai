"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceDetector } from "@mediapipe/tasks-vision";

export type ProctoringViolation =
  | "camera_denied"
  | "camera_lost"
  | "tab_switch"
  | "window_blur"
  | "multi_face"
  | "no_face";

export type ProctoringStatus = "idle" | "requesting" | "ready" | "terminated";

// MediaPipe WASM + model files are pulled from public CDNs the first time the
// quiz is entered. This avoids shipping ~3MB of WASM in our own bundle.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

// Sustained-violation thresholds. Brief hiccups (face occluded for a moment,
// someone walking past behind the candidate) shouldn't fail the quiz.
const MULTI_FACE_MS = 2000;
const NO_FACE_MS = 5000;
const DETECT_INTERVAL_MS = 400;

interface UseProctoringArgs {
  enabled: boolean;
  onTerminate: (reason: ProctoringViolation) => void;
}

export function useProctoring({ enabled, onTerminate }: UseProctoringArgs) {
  const [status, setStatus] = useState<ProctoringStatus>("idle");
  const [faceCount, setFaceCount] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef(0);
  const multiFaceSinceRef = useRef<number | null>(null);
  const noFaceSinceRef = useRef<number | null>(null);
  const terminatedRef = useRef(false);
  const onTerminateRef = useRef(onTerminate);

  useEffect(() => {
    onTerminateRef.current = onTerminate;
  }, [onTerminate]);

  useEffect(() => {
    if (!enabled) return;
    terminatedRef.current = false;
    let cancelled = false;

    function teardown() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
      if (detectorRef.current) {
        try {
          detectorRef.current.close();
        } catch {
          // detector close is best-effort
        }
        detectorRef.current = null;
      }
    }

    function emit(reason: ProctoringViolation) {
      if (terminatedRef.current) return;
      terminatedRef.current = true;
      setStatus("terminated");
      teardown();
      onTerminateRef.current(reason);
    }

    async function start() {
      setStatus("requesting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play().catch(() => {});
        }
        // If the OS / user kills the device track (e.g. unplugs the camera),
        // treat it as a fail-closed event so candidates can't bypass by
        // disabling the camera mid-quiz.
        for (const track of stream.getTracks()) {
          track.addEventListener("ended", () => emit("camera_lost"));
        }
        setStatus("ready");
        await initDetector();
        runDetectionLoop();
      } catch {
        if (cancelled) return;
        emit("camera_denied");
      }
    }

    async function initDetector() {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      detectorRef.current = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
    }

    function runDetectionLoop() {
      const tick = () => {
        if (terminatedRef.current) return;
        const video = videoRef.current;
        const detector = detectorRef.current;
        if (!video || !detector || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const now = performance.now();
        if (now - lastDetectAtRef.current >= DETECT_INTERVAL_MS) {
          lastDetectAtRef.current = now;
          try {
            const result = detector.detectForVideo(video, now);
            const count = result.detections?.length ?? 0;
            setFaceCount(count);
            const wall = Date.now();
            if (count > 1) {
              if (multiFaceSinceRef.current === null) {
                multiFaceSinceRef.current = wall;
              } else if (wall - multiFaceSinceRef.current > MULTI_FACE_MS) {
                emit("multi_face");
                return;
              }
            } else {
              multiFaceSinceRef.current = null;
            }
            if (count === 0) {
              if (noFaceSinceRef.current === null) {
                noFaceSinceRef.current = wall;
              } else if (wall - noFaceSinceRef.current > NO_FACE_MS) {
                emit("no_face");
                return;
              }
            } else {
              noFaceSinceRef.current = null;
            }
          } catch {
            // Detection failures (occasional WASM hiccups) shouldn't terminate.
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    function onVisibility() {
      if (document.hidden) emit("tab_switch");
    }
    function onBlur() {
      emit("window_blur");
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    start();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      teardown();
    };
  }, [enabled]);

  return { videoRef, status, faceCount };
}

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

// Detection runs every ~400ms (2.5 fps). With a decaying score that gains +1
// per offending frame and decays -1 per clean frame, the thresholds below mean:
//   multi-face triggers after ~1.6s of sustained 2+ faces (4 hits, score = 4)
//   no-face triggers after ~5s of sustained 0 faces (12 hits)
// Brief flickers (1 face → 2 faces → 1 face) no longer reset the counter to
// zero — the score climbs slower but still climbs.
const DETECT_INTERVAL_MS = 400;
const MULTI_FACE_TRIGGER_SCORE = 4;
const NO_FACE_TRIGGER_SCORE = 12;

// Snapshot config: capture up to 7 JPEGs spread across the quiz so the
// recruiter has visual evidence of who took the test.
const SNAPSHOT_FIRST_AT_MS = 30 * 1000;
const SNAPSHOT_INTERVAL_MS = 3 * 60 * 1000;
const MAX_SNAPSHOTS = 7;
const SNAPSHOT_WIDTH = 320;
const SNAPSHOT_HEIGHT = 240;
const SNAPSHOT_JPEG_QUALITY = 0.55;

interface UseProctoringArgs {
  enabled: boolean;
  onTerminate: (reason: ProctoringViolation) => void;
  onSnapshot?: (dataUrl: string) => void;
}

export function useProctoring({ enabled, onTerminate, onSnapshot }: UseProctoringArgs) {
  const [status, setStatus] = useState<ProctoringStatus>("idle");
  const [faceCount, setFaceCount] = useState<number | null>(null);
  const [detectorReady, setDetectorReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectAtRef = useRef(0);
  const snapshotTimeoutRef = useRef<number | null>(null);
  const snapshotIntervalRef = useRef<number | null>(null);
  const snapshotCountRef = useRef(0);

  // Decaying scores: incremented on a violating frame, decremented (floored at
  // 0) on a clean frame. Trigger when score crosses the threshold.
  const multiFaceScoreRef = useRef(0);
  const noFaceScoreRef = useRef(0);
  const terminatedRef = useRef(false);

  const onTerminateRef = useRef(onTerminate);
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => {
    onTerminateRef.current = onTerminate;
  }, [onTerminate]);
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    if (!enabled) return;
    terminatedRef.current = false;
    multiFaceScoreRef.current = 0;
    noFaceScoreRef.current = 0;
    snapshotCountRef.current = 0;
    setDetectorReady(false);
    let cancelled = false;

    function teardown() {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (snapshotTimeoutRef.current !== null) {
        clearTimeout(snapshotTimeoutRef.current);
        snapshotTimeoutRef.current = null;
      }
      if (snapshotIntervalRef.current !== null) {
        clearInterval(snapshotIntervalRef.current);
        snapshotIntervalRef.current = null;
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

    async function acquireStream(): Promise<MediaStream> {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
      } catch (firstErr) {
        if (firstErr instanceof DOMException && firstErr.name === "OverconstrainedError") {
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        throw firstErr;
      }
    }

    async function start() {
      setStatus("requesting");
      let stream: MediaStream;
      try {
        stream = await acquireStream();
      } catch (err) {
        if (cancelled) return;
        console.error("[proctoring] camera permission failed:", err);
        emit("camera_denied");
        return;
      }
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

      try {
        await initDetector();
        setDetectorReady(true);
      } catch (err) {
        // CDN unreachable, WASM blocked, etc. We still want the camera + tab
        // listeners to enforce, but multi-face checks are unavailable. Log
        // loudly so this is debuggable in DevTools.
        console.error("[proctoring] face detector init failed:", err);
      }

      scheduleSnapshots();
      runDetectionLoop();
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

    function captureSnapshot() {
      if (terminatedRef.current) return;
      if (snapshotCountRef.current >= MAX_SNAPSHOTS) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SNAPSHOT_WIDTH;
        canvas.height = SNAPSHOT_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT);
        const dataUrl = canvas.toDataURL("image/jpeg", SNAPSHOT_JPEG_QUALITY);
        snapshotCountRef.current += 1;
        onSnapshotRef.current?.(dataUrl);
      } catch (err) {
        console.warn("[proctoring] snapshot capture failed:", err);
      }
    }

    function scheduleSnapshots() {
      snapshotTimeoutRef.current = window.setTimeout(() => {
        captureSnapshot();
        snapshotIntervalRef.current = window.setInterval(captureSnapshot, SNAPSHOT_INTERVAL_MS);
      }, SNAPSHOT_FIRST_AT_MS);
    }

    function tickDetection() {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!detector || !video || video.readyState < 2) return;
      try {
        const result = detector.detectForVideo(video, performance.now());
        const count = result.detections?.length ?? 0;
        setFaceCount(count);

        if (count > 1) {
          multiFaceScoreRef.current = Math.min(MULTI_FACE_TRIGGER_SCORE + 2, multiFaceScoreRef.current + 1);
        } else if (multiFaceScoreRef.current > 0) {
          multiFaceScoreRef.current -= 1;
        }

        if (count === 0) {
          noFaceScoreRef.current = Math.min(NO_FACE_TRIGGER_SCORE + 4, noFaceScoreRef.current + 1);
        } else if (noFaceScoreRef.current > 0) {
          noFaceScoreRef.current -= 1;
        }

        if (multiFaceScoreRef.current >= MULTI_FACE_TRIGGER_SCORE) {
          emit("multi_face");
          return;
        }
        if (noFaceScoreRef.current >= NO_FACE_TRIGGER_SCORE) {
          emit("no_face");
          return;
        }
      } catch (err) {
        // Detection failures (occasional WASM hiccups) shouldn't terminate.
        console.warn("[proctoring] detection error:", err);
      }
    }

    function runDetectionLoop() {
      const tick = () => {
        if (terminatedRef.current) return;
        const now = performance.now();
        if (now - lastDetectAtRef.current >= DETECT_INTERVAL_MS) {
          lastDetectAtRef.current = now;
          tickDetection();
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

  return { videoRef, status, faceCount, detectorReady };
}

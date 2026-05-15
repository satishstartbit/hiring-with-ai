"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { FaceDetector } from "@mediapipe/tasks-vision";

export type ProctoringViolation =
  | "camera_denied"
  | "camera_lost"
  | "tab_switch"
  | "window_blur"
  | "multi_face"
  | "no_face"
  | "voice_detected"
  | "fullscreen_exit"
  | "copy_paste"
  | "face_mismatch";

export type ProctoringStatus = "idle" | "requesting" | "ready" | "terminated";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

// Detection runs every ~400ms (2.5 fps). With a decaying score that gains +1
// per offending frame and decays -1 per clean frame, the thresholds below mean:
//   multi-face triggers after ~1.6s of sustained 2+ faces (4 hits, score = 4)
//   no-face triggers after ~5s of sustained 0 faces (12 hits)
const DETECT_INTERVAL_MS = 400;
const MULTI_FACE_TRIGGER_SCORE = 4;
const NO_FACE_TRIGGER_SCORE = 12;

// Voice detection: RMS (0..1) above threshold for ~3.2s of sustained audio.
const VOICE_RMS_THRESHOLD = 0.08;
const VOICE_TRIGGER_SCORE = 8;
const VOICE_SAMPLE_INTERVAL_MS = 400;

// After a violation fires, suppress further emissions for this long so the
// caller has time to show a warning and the candidate has time to react.
// Without this a sustained violation (e.g. 2 faces still in frame) would
// re-fire on the next tick and instantly burn through the warning budget.
const VIOLATION_COOLDOWN_MS = 6000;

// Snapshot config: capture up to 7 JPEGs spread across the quiz so the
// recruiter has visual evidence of who took the test.
const SNAPSHOT_FIRST_AT_MS = 30 * 1000;
const SNAPSHOT_INTERVAL_MS = 3 * 60 * 1000;
const MAX_SNAPSHOTS = 7;
const SNAPSHOT_WIDTH = 320;
const SNAPSHOT_HEIGHT = 240;
const SNAPSHOT_JPEG_QUALITY = 0.55;

export interface ProctoringConfig {
  /** Detect tab switch / window blur. */
  tabSwitchDetection: boolean;
  /** Block copy/paste/cut/context-menu; emit a copy_paste violation on attempts. */
  blockCopyPaste: boolean;
  /** Request fullscreen on start, emit fullscreen_exit if the user leaves. */
  fullscreenRequired: boolean;
  /**
   * Acquire the camera+mic stream and run face / voice detection + snapshots.
   * When false the hook skips getUserMedia entirely (no permission prompt, no
   * preview, no multi-face / no-face / voice_detected violations). Document-
   * level listeners (tab switch / copy-paste / fullscreen) still run.
   */
  webcamMonitoring: boolean;
}

interface UseProctoringArgs {
  enabled: boolean;
  config: ProctoringConfig;
  onViolation: (reason: ProctoringViolation) => void;
  onSnapshot?: (dataUrl: string) => void;
}

export interface UseProctoringReturn {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: ProctoringStatus;
  faceCount: number | null;
  detectorReady: boolean;
  stop: () => void;
}

export function useProctoring({
  enabled,
  config,
  onViolation,
  onSnapshot,
}: UseProctoringArgs): UseProctoringReturn {
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const audioIntervalRef = useRef<number | null>(null);

  const multiFaceScoreRef = useRef(0);
  const noFaceScoreRef = useRef(0);
  const voiceScoreRef = useRef(0);
  const lastEmitAtRef = useRef(0);
  const stoppedRef = useRef(false);

  const onViolationRef = useRef(onViolation);
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => {
    onViolationRef.current = onViolation;
  }, [onViolation]);
  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  const teardown = useCallback(() => {
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
    if (audioIntervalRef.current !== null) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
      audioAnalyserRef.current = null;
      audioBufferRef.current = null;
    }
    if (detectorRef.current) {
      try {
        detectorRef.current.close();
      } catch {
        // detector close is best-effort
      }
      detectorRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    setStatus("terminated");
    teardown();
  }, [teardown]);

  useEffect(() => {
    if (!enabled) return;
    stoppedRef.current = false;
    multiFaceScoreRef.current = 0;
    noFaceScoreRef.current = 0;
    voiceScoreRef.current = 0;
    snapshotCountRef.current = 0;
    lastEmitAtRef.current = 0;
    let cancelled = false;

    function emit(reason: ProctoringViolation) {
      if (stoppedRef.current) return;
      // Catastrophic events bypass cooldown — the caller needs to know
      // immediately that the camera isn't usable.
      const fatal = reason === "camera_denied" || reason === "camera_lost";
      const now = performance.now();
      if (!fatal && now - lastEmitAtRef.current < VIOLATION_COOLDOWN_MS) return;
      lastEmitAtRef.current = now;
      // Reset per-type scores so the same sustained signal needs to re-build
      // before triggering again.
      if (reason === "multi_face") multiFaceScoreRef.current = 0;
      if (reason === "no_face") noFaceScoreRef.current = 0;
      if (reason === "voice_detected") voiceScoreRef.current = 0;
      onViolationRef.current(reason);
    }

    async function acquireStream(): Promise<MediaStream> {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: true,
        });
      } catch (firstErr) {
        if (firstErr instanceof DOMException && firstErr.name === "OverconstrainedError") {
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        throw firstErr;
      }
    }

    async function start() {
      // HR disabled webcam monitoring on this assessment — skip camera
      // acquisition entirely. Document-level listeners (tab switch / copy
      // paste / fullscreen) still get wired below.
      if (!config.webcamMonitoring) {
        setStatus("ready");
        return;
      }

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
      for (const track of stream.getTracks()) {
        // Only video track loss is fatal — losing the mic is a separate signal
        // (handled as voice_unavailable would be over-engineering for now).
        if (track.kind === "video") {
          track.addEventListener("ended", () => emit("camera_lost"));
        }
      }
      setStatus("ready");

      try {
        await initDetector();
        setDetectorReady(true);
      } catch (err) {
        // CDN unreachable / WASM blocked — face checks unavailable but the
        // camera and tab listeners still enforce. Log for debuggability.
        console.error("[proctoring] face detector init failed:", err);
      }

      initAudioAnalyser(stream);
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

    function initAudioAnalyser(stream: MediaStream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;
      try {
        type WindowWithWebkit = Window & {
          webkitAudioContext?: typeof AudioContext;
        };
        const w = window as WindowWithWebkit;
        const AudioCtor = window.AudioContext ?? w.webkitAudioContext;
        if (!AudioCtor) return;
        const ctx = new AudioCtor();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioContextRef.current = ctx;
        audioAnalyserRef.current = analyser;
        audioBufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        audioIntervalRef.current = window.setInterval(sampleAudio, VOICE_SAMPLE_INTERVAL_MS);
      } catch (err) {
        console.warn("[proctoring] audio analyser init failed:", err);
      }
    }

    function sampleAudio() {
      const analyser = audioAnalyserRef.current;
      const buffer = audioBufferRef.current;
      if (!analyser || !buffer) return;
      analyser.getFloatTimeDomainData(buffer);
      let sumSq = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i];
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buffer.length);
      if (rms >= VOICE_RMS_THRESHOLD) {
        voiceScoreRef.current = Math.min(VOICE_TRIGGER_SCORE + 4, voiceScoreRef.current + 1);
        if (voiceScoreRef.current >= VOICE_TRIGGER_SCORE) {
          emit("voice_detected");
        }
      } else if (voiceScoreRef.current > 0) {
        voiceScoreRef.current -= 1;
      }
    }

    function captureSnapshot() {
      if (stoppedRef.current) return;
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
          multiFaceScoreRef.current = Math.min(
            MULTI_FACE_TRIGGER_SCORE + 2,
            multiFaceScoreRef.current + 1
          );
        } else if (multiFaceScoreRef.current > 0) {
          multiFaceScoreRef.current -= 1;
        }

        if (count === 0) {
          noFaceScoreRef.current = Math.min(
            NO_FACE_TRIGGER_SCORE + 4,
            noFaceScoreRef.current + 1
          );
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
        console.warn("[proctoring] detection error:", err);
      }
    }

    function runDetectionLoop() {
      const tick = () => {
        if (stoppedRef.current) return;
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
    function onFullscreenChange() {
      if (!document.fullscreenElement) emit("fullscreen_exit");
    }
    function onCopyPaste(e: ClipboardEvent | Event) {
      e.preventDefault();
      emit("copy_paste");
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    if (config.tabSwitchDetection) {
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("blur", onBlur);
    }
    if (config.fullscreenRequired) {
      document.addEventListener("fullscreenchange", onFullscreenChange);
      // Request fullscreen as soon as we mount. Browsers require this in a
      // user gesture, so it may reject silently if mount isn't from a click —
      // in that case the caller can request fullscreen on user interaction.
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    if (config.blockCopyPaste) {
      document.addEventListener("copy", onCopyPaste);
      document.addEventListener("paste", onCopyPaste);
      document.addEventListener("cut", onCopyPaste);
      document.addEventListener("contextmenu", onContextMenu);
    }
    start();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (config.tabSwitchDetection) {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("blur", onBlur);
      }
      if (config.fullscreenRequired) {
        document.removeEventListener("fullscreenchange", onFullscreenChange);
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => undefined);
        }
      }
      if (config.blockCopyPaste) {
        document.removeEventListener("copy", onCopyPaste);
        document.removeEventListener("paste", onCopyPaste);
        document.removeEventListener("cut", onCopyPaste);
        document.removeEventListener("contextmenu", onContextMenu);
      }
      teardown();
    };
  }, [
    enabled,
    teardown,
    config.tabSwitchDetection,
    config.blockCopyPaste,
    config.fullscreenRequired,
    config.webcamMonitoring,
  ]);

  return { videoRef, status, faceCount, detectorReady, stop };
}

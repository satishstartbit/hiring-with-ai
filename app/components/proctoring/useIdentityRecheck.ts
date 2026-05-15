"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  countFaces,
  extractDescriptor,
  loadFaceApi,
  matchDescriptors,
  type IdentityResult,
} from "@/app/lib/face/faceApi";

// Periodic identity recheck for an active quiz / interview round.
//
// Every `intervalMs` (default 30s) the hook:
//   1. Captures a JPEG frame from the shared <video> element
//   2. Runs face-api.js: counts faces + extracts a 128-d descriptor
//   3. Compares the descriptor against the candidate's stored profile
//      descriptor (loaded once from /api/candidate/identity)
//   4. Uploads the frame + match metadata to
//      /api/candidate/applications/[id]/proctoring/snapshot
//   5. Tracks consecutive mismatches and fires `onMismatch` once the
//      mismatchStreak threshold is exceeded so the caller can warn or
//      terminate the round.

export type RecheckVerdict =
  | "strong"
  | "match"
  | "suspicious"
  | "mismatch"
  | "no_face"
  | "multi_face";

export interface RecheckResult {
  verdict: RecheckVerdict;
  confidence: number;
  capturedAt: Date;
}

interface UseIdentityRecheckArgs {
  /** Live video element the proctoring stream is rendered to. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Toggle the loop on/off. Setting false stops scheduling new ticks. */
  enabled: boolean;
  /** Candidate (application) id used by the snapshot upload endpoint. */
  applicationId: string;
  /** Round identifier persisted alongside each uploaded snapshot. */
  round: "quiz" | "interview";
  /** Capture cadence — defaults to 30 seconds. */
  intervalMs?: number;
  /**
   * Fired once `mismatchStreak` consecutive checks return a mismatch verdict
   * (mismatch / no_face / multi_face). The caller decides whether to warn
   * or force-close.
   */
  onMismatch?: (result: RecheckResult) => void;
  /**
   * Optional callback fired for *every* check (match or mismatch). Useful
   * for showing a live "last verified ✓" indicator.
   */
  onCheck?: (result: RecheckResult) => void;
  /** Consecutive mismatches before onMismatch fires. Defaults to 2. */
  mismatchStreak?: number;
}

interface UseIdentityRecheckReturn {
  lastResult: RecheckResult | null;
  ready: boolean;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MISMATCH_STREAK = 2;
const SNAPSHOT_JPEG_QUALITY = 0.55;
const SNAPSHOT_WIDTH = 320;
const SNAPSHOT_HEIGHT = 240;

function isFailureVerdict(v: RecheckVerdict): boolean {
  return v === "mismatch" || v === "no_face" || v === "multi_face";
}

async function captureJpegBlob(
  video: HTMLVideoElement
): Promise<{ canvas: HTMLCanvasElement; blob: Blob } | null> {
  if (video.readyState < 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = SNAPSHOT_WIDTH;
  canvas.height = SNAPSHOT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", SNAPSHOT_JPEG_QUALITY);
  });
  if (!blob) return null;
  return { canvas, blob };
}

export function useIdentityRecheck({
  videoRef,
  enabled,
  applicationId,
  round,
  intervalMs = DEFAULT_INTERVAL_MS,
  onMismatch,
  onCheck,
  mismatchStreak = DEFAULT_MISMATCH_STREAK,
}: UseIdentityRecheckArgs): UseIdentityRecheckReturn {
  const [lastResult, setLastResult] = useState<RecheckResult | null>(null);
  const [ready, setReady] = useState(false);

  const storedDescriptorRef = useRef<number[] | null>(null);
  const mismatchCountRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  const onMismatchRef = useRef(onMismatch);
  const onCheckRef = useRef(onCheck);
  useEffect(() => {
    onMismatchRef.current = onMismatch;
  }, [onMismatch]);
  useEffect(() => {
    onCheckRef.current = onCheck;
  }, [onCheck]);

  const runCheck = useCallback(async () => {
    if (inFlightRef.current || stoppedRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    inFlightRef.current = true;
    try {
      const captured = await captureJpegBlob(video);
      if (!captured) return;
      const { canvas, blob } = captured;

      let verdict: RecheckVerdict = "match";
      let confidence = 0;
      const stored = storedDescriptorRef.current;

      // Always run a face count — even without a stored descriptor we want
      // to flag obvious anomalies (no face / multiple faces).
      let faces = 0;
      try {
        faces = await countFaces(canvas);
      } catch {
        // face-api unavailable — fall through and upload as-is.
      }

      if (faces === 0) {
        verdict = "no_face";
      } else if (faces > 1) {
        verdict = "multi_face";
      } else if (stored) {
        try {
          const live = await extractDescriptor(canvas);
          if (!live) {
            verdict = "no_face";
          } else {
            const result: IdentityResult = await matchDescriptors(stored, live);
            verdict = result.verdict;
            confidence = result.confidence;
          }
        } catch {
          // descriptor extraction failed — treat as neutral, skip mismatch logic
          verdict = "suspicious";
        }
      }

      const result: RecheckResult = {
        verdict,
        confidence,
        capturedAt: new Date(),
      };
      setLastResult(result);
      onCheckRef.current?.(result);

      const mismatch = isFailureVerdict(verdict);
      if (mismatch) {
        mismatchCountRef.current += 1;
      } else {
        mismatchCountRef.current = 0;
      }

      // Fire-and-forget upload — we don't block the loop on the response.
      const form = new FormData();
      form.append("photo", blob, "snapshot.jpg");
      form.append("round", round);
      if (Number.isFinite(confidence)) {
        form.append("matchScore", String(confidence));
      }
      form.append("matchVerdict", verdict);
      form.append("mismatch", mismatch ? "true" : "false");
      void fetch(
        `/api/candidate/applications/${applicationId}/proctoring/snapshot`,
        { method: "POST", body: form }
      ).catch(() => undefined);

      if (
        mismatch &&
        mismatchCountRef.current >= mismatchStreak &&
        onMismatchRef.current
      ) {
        onMismatchRef.current(result);
      }
    } catch {
      // Best-effort — never let a single check kill the loop.
    } finally {
      inFlightRef.current = false;
    }
  }, [applicationId, mismatchStreak, round, videoRef]);

  // ---- Load the stored descriptor + face-api models once. ----
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        await loadFaceApi();
      } catch {
        // Without face-api we still upload bare snapshots — match decisions
        // simply can't be made client-side.
      }
      try {
        const res = await fetch("/api/candidate/identity?include=descriptor", {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            descriptor: number[] | null;
          };
          if (!cancelled && Array.isArray(data.descriptor)) {
            storedDescriptorRef.current = data.descriptor;
          }
        }
      } catch {
        // proceed without a stored descriptor — bare upload only
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // ---- Schedule the recurring check. ----
  useEffect(() => {
    if (!enabled || !ready) return;
    stoppedRef.current = false;
    timerRef.current = window.setInterval(() => {
      void runCheck();
    }, intervalMs);
    // Kick off one immediate check so the candidate sees a fresh status
    // without waiting for the first interval to elapse.
    const firstTick = window.setTimeout(() => {
      void runCheck();
    }, 2000);
    return () => {
      stoppedRef.current = true;
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      clearTimeout(firstTick);
    };
  }, [enabled, ready, intervalMs, runCheck]);

  return { lastResult, ready };
}

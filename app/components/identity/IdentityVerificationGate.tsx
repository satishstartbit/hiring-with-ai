"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  countFaces,
  extractDescriptor,
  loadFaceApi,
  matchDescriptors,
  type IdentityResult,
} from "@/app/lib/face/faceApi";

// Identity gate that wraps the existing quiz / interview clients. Until the
// user clears every check, `children` is not rendered — so the existing
// proctoring code (useProctoring etc.) is never even mounted. That means we
// add identity verification without touching any of the existing flow.
//
// Sequence (all client-side):
//   1. Load face-api.js models from /models (eager).
//   2. Fetch the candidate's stored descriptor.
//   3. Request webcam + (optionally) microphone via getUserMedia.
//   4. Capture a live frame, extract its descriptor, count faces.
//   5. Match against the stored descriptor (euclidean distance).
//   6. If matched, request fullscreen — only then render children.
//
// Any failure leaves the gate visible with a recoverable error or a hard
// block (e.g. "no photo on file, go to /candidate/profile/identity").

interface Props {
  /** "interview" = requires mic too, "quiz" = video only. */
  mode: "quiz" | "interview";
  /**
   * Optional title shown above the gate. Defaults to a generic message.
   */
  title?: string;
  /** Rendered once the gate is cleared. */
  children: React.ReactNode;
}

type Phase =
  | "loading_models"
  | "loading_descriptor"
  | "needs_photo"
  | "requesting_camera"
  | "camera_ready"
  | "verifying"
  | "verification_failed"
  | "requesting_fullscreen"
  | "passed";

interface StoredIdentity {
  descriptor: number[];
  photoUrl: string | null;
}

const VERIFY_ATTEMPT_LIMIT = 3;

export default function IdentityVerificationGate({ mode, title, children }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<Phase>("loading_models");
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<StoredIdentity | null>(null);
  const [lastResult, setLastResult] = useState<IdentityResult | null>(null);
  const [attempts, setAttempts] = useState(0);

  // ---- Cleanup helper used in every error path & on unmount ----
  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    return () => releaseCamera();
  }, [releaseCamera]);

  // ---- Step 1: load face-api models ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFaceApi();
        if (!cancelled) setPhase("loading_descriptor");
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? `Face models failed to load: ${e.message}`
            : "Face models failed to load"
        );
        setPhase("verification_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Step 2: pull stored descriptor (only after models loaded) ----
  useEffect(() => {
    if (phase !== "loading_descriptor") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/candidate/identity?include=descriptor", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load identity");
        const data = (await res.json()) as {
          hasDescriptor: boolean;
          descriptor: number[] | null;
          photoUrl: string | null;
        };
        if (cancelled) return;
        if (!data.hasDescriptor || !data.descriptor) {
          setPhase("needs_photo");
          return;
        }
        setIdentity({ descriptor: data.descriptor, photoUrl: data.photoUrl });
        setPhase("requesting_camera");
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Couldn't load your stored identity descriptor"
        );
        setPhase("verification_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // ---- Step 3: request camera (+ mic for interview) ----
  const startCamera = useCallback(async () => {
    setError(null);
    setPhase("requesting_camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: mode === "interview",
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("camera_ready");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setError(
        denied
          ? "Camera and microphone access are required for identity verification " +
              "and anti-cheating monitoring during the assessment. Allow access in " +
              "your browser settings and try again."
          : "Couldn't open your webcam — make sure no other tab is using it."
      );
      setPhase("verification_failed");
      releaseCamera();
    }
  }, [mode, releaseCamera]);

  useEffect(() => {
    if (phase === "requesting_camera" && !streamRef.current) {
      void startCamera();
    }
  }, [phase, startCamera]);

  // ---- Step 4 + 5: capture, extract, count, match ----
  const runVerification = useCallback(async () => {
    if (!videoRef.current || !identity) return;
    if (videoRef.current.readyState < 2) return; // not enough data yet

    setPhase("verifying");
    setError(null);
    setLastResult(null);

    try {
      const detected = await countFaces(videoRef.current);
      if (detected === 0) {
        throw new Error(
          "No face detected. Center your face in the frame and check your lighting."
        );
      }
      if (detected > 1) {
        throw new Error(
          "Multiple people detected. You must be alone in front of the camera."
        );
      }
      const live = await extractDescriptor(videoRef.current);
      if (!live) {
        throw new Error(
          "Couldn't read your face clearly — try better lighting and face the camera."
        );
      }
      const result = await matchDescriptors(identity.descriptor, live);
      setLastResult(result);

      // At the initial gate we require "strong" or "match". "suspicious" is
      // treated as fail here because we have a still moment to retry —
      // periodic re-checks during the assessment are more lenient (they only
      // count repeated suspicious frames as a violation).
      if (result.verdict === "strong" || result.verdict === "match") {
        setPhase("requesting_fullscreen");
      } else {
        setAttempts((n) => n + 1);
        throw new Error(
          result.verdict === "mismatch"
            ? "Face mismatch — the person on camera doesn't appear to match your profile photo."
            : "We weren't fully confident this is you. Adjust your lighting and try again."
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
      setPhase("verification_failed");
    }
  }, [identity]);

  // ---- Step 6: enter fullscreen, then render children ----
  useEffect(() => {
    if (phase !== "requesting_fullscreen") return;
    let cancelled = false;
    (async () => {
      try {
        const el = containerRef.current ?? document.documentElement;
        if (!document.fullscreenElement) {
          await el.requestFullscreen({ navigationUI: "hide" });
        }
        if (cancelled) return;
        // Camera stream is owned by the existing useProctoring hook once the
        // assessment starts — release ours so we don't hold the device twice.
        releaseCamera();
        setPhase("passed");
      } catch {
        if (cancelled) return;
        setError(
          "Fullscreen mode is required for the assessment. Allow fullscreen and try again."
        );
        setPhase("verification_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, releaseCamera]);

  // Once passed, render children unmodified.
  if (phase === "passed") {
    return <>{children}</>;
  }

  // -------- UI --------
  const remainingAttempts = Math.max(0, VERIFY_ATTEMPT_LIMIT - attempts);
  const blockedHard = attempts >= VERIFY_ATTEMPT_LIMIT;

  return (
    <div ref={containerRef} className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Identity verification
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {title ?? "Before you start"}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          We need to confirm it&apos;s you, that you&apos;re alone, and that your camera and
          microphone work. This runs in your browser — only the match result is recorded.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Live preview</h3>
          <div className="mt-3 grid aspect-video place-items-center overflow-hidden rounded-xl bg-slate-900">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${
                streamRef.current ? "" : "opacity-0"
              }`}
            />
            {!streamRef.current && (
              <span className="absolute text-xs font-medium text-slate-300">
                {phase === "loading_models"
                  ? "Loading face models…"
                  : phase === "loading_descriptor"
                  ? "Loading your identity…"
                  : "Camera off"}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                blockedHard ||
                phase === "loading_models" ||
                phase === "loading_descriptor" ||
                phase === "needs_photo" ||
                phase === "requesting_camera" ||
                phase === "verifying" ||
                phase === "requesting_fullscreen" ||
                !streamRef.current
              }
              onClick={() => void runVerification()}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "verifying" ? "Verifying…" : "Verify and start"}
            </button>

            {phase === "verification_failed" && !blockedHard && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setLastResult(null);
                  if (!streamRef.current) {
                    setPhase("requesting_camera");
                  } else {
                    setPhase("camera_ready");
                  }
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Try again
              </button>
            )}

            {phase === "needs_photo" && (
              <Link
                href="/candidate/profile/identity"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Upload identity photo
              </Link>
            )}

            <p className="text-xs text-slate-500">
              Attempts remaining: {remainingAttempts}/{VERIFY_ATTEMPT_LIMIT}
            </p>
          </div>
        </section>

        <aside className="space-y-4">
          <ChecklistItem
            done={phase !== "loading_models"}
            label="Face models loaded"
          />
          <ChecklistItem
            done={
              phase !== "loading_models" &&
              phase !== "loading_descriptor" &&
              phase !== "needs_photo"
            }
            label="Identity photo on file"
          />
          <ChecklistItem
            done={Boolean(streamRef.current) && phase !== "verification_failed"}
            label={mode === "interview" ? "Camera + microphone" : "Camera"}
          />
          <ChecklistItem
            done={
              lastResult?.verdict === "strong" || lastResult?.verdict === "match"
            }
            label="Face match"
            detail={
              lastResult
                ? `${lastResult.verdict} · ${lastResult.confidence}% confidence`
                : undefined
            }
          />
          <ChecklistItem done={false} label="Fullscreen mode" />

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          {blockedHard && (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
              Too many failed verification attempts. Contact the recruiter.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${
        done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs ${
          done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
        }`}
        aria-hidden
      >
        {done ? "✓" : "·"}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

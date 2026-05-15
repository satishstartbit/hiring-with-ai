"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractDescriptor, loadFaceApi } from "@/app/lib/face/faceApi";

// Profile-photo uploader: client picks an image OR captures a frame from the
// webcam, we draw it to a canvas, run face-api.js to verify exactly one face
// is present + extract its 128-d descriptor, then POST both the JPEG and the
// descriptor to the server. The server never invokes face-api itself — see
// app/api/candidate/identity.
//
// Webcam capture is the recommended path for proctoring use because it's
// taken from the same camera the assessment runs against — so the descriptor
// is matched against a frame from the same device, in similar lighting.
// Uploading a prior photo is supported as a fallback.

const MAX_INPUT_BYTES = 8 * 1024 * 1024; // raw file upper bound before compression
const COMPRESS_MAX_DIM = 720; // longest side after re-encode
const COMPRESS_QUALITY = 0.85; // JPEG quality for the re-encoded upload

interface IdentityStatus {
  hasDescriptor: boolean;
  photoUrl: string | null;
  updatedAt: string | null;
}

type Phase =
  | "idle"
  | "loading_models"
  | "extracting"
  | "uploading"
  | "done"
  | "error";

type Mode = "choose" | "upload" | "webcam";

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draw any source to a max-720px canvas, returning canvas + a JPEG blob. */
async function sourceToCanvasAndBlob(
  source: HTMLImageElement | HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number
): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  const longest = Math.max(sourceWidth, sourceHeight);
  const scale = longest > COMPRESS_MAX_DIM ? COMPRESS_MAX_DIM / longest : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Encode failed"))),
      "image/jpeg",
      COMPRESS_QUALITY
    );
  });
  return { canvas, blob };
}

interface Props {
  /** Called once the upload has been accepted by the server. */
  onUploaded?: () => void;
}

export default function ProfilePhotoUploader({ onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>("choose");
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [webcamReady, setWebcamReady] = useState(false);

  // ---- Eagerly load face-api models so first capture/upload is snappy. ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFaceApi();
        if (!cancelled) setModelsReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? `Couldn't load face models: ${e.message}`
              : "Couldn't load face models"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Fetch existing status so we can show "you already uploaded". ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/candidate/identity", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as IdentityStatus;
        setStatus(data);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  // ---- Webcam lifecycle (only active while mode === "webcam") ----
  const releaseWebcam = useCallback(() => {
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    webcamStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWebcamReady(false);
  }, []);

  useEffect(() => {
    if (mode !== "webcam") {
      releaseWebcam();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        webcamStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setWebcamReady(true);
        }
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "";
        const denied = name === "NotAllowedError" || name === "SecurityError";
        setError(
          denied
            ? "Camera access was denied. Allow camera in your browser and try again."
            : "Couldn't open your webcam — make sure no other tab is using it."
        );
        setMode("choose");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, releaseWebcam]);

  useEffect(() => () => releaseWebcam(), [releaseWebcam]);

  // ---- Shared pipeline: descriptor + compress + upload. ----
  const submitCanvas = useCallback(
    async (
      source: HTMLImageElement | HTMLVideoElement,
      sourceWidth: number,
      sourceHeight: number
    ) => {
      setError(null);
      setPhase("extracting");

      let descriptor: Float32Array | null;
      try {
        descriptor = await extractDescriptor(source);
      } catch (e) {
        setError(
          e instanceof Error
            ? `Face detection failed: ${e.message}`
            : "Face detection failed"
        );
        setPhase("error");
        return;
      }
      if (!descriptor) {
        setError(
          "No face detected, or more than one face was visible. Make sure you're " +
            "alone, well-lit, and looking at the camera."
        );
        setPhase("error");
        return;
      }

      setPhase("uploading");
      let blob: Blob;
      let preview: string;
      try {
        const out = await sourceToCanvasAndBlob(source, sourceWidth, sourceHeight);
        blob = out.blob;
        preview = out.canvas.toDataURL("image/jpeg", 0.7);
      } catch {
        setError("Couldn't prepare the photo for upload.");
        setPhase("error");
        return;
      }
      setPreviewUrl(preview);

      const formData = new FormData();
      formData.append("photo", blob, "profile.jpg");
      formData.append("descriptor", JSON.stringify(Array.from(descriptor)));

      try {
        const res = await fetch("/api/candidate/identity", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          updatedAt?: string;
          photoUrl?: string;
        };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Upload failed");
          setPhase("error");
          return;
        }
        setStatus({
          hasDescriptor: true,
          photoUrl: data.photoUrl ?? "/api/candidate/identity/photo",
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        });
        setPhase("done");
        setMode("choose");
        releaseWebcam();
        onUploaded?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error during upload");
        setPhase("error");
      }
    },
    [onUploaded, releaseWebcam]
  );

  // ---- Entry point A: file upload ----
  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_INPUT_BYTES) {
        setError("Photo is too large. Use one under 8MB.");
        setPhase("error");
        return;
      }
      if (!file.type.startsWith("image/")) {
        setError("Pick an image file (JPEG, PNG, WebP).");
        setPhase("error");
        return;
      }

      setPhase("loading_models");
      let img: HTMLImageElement;
      try {
        img = await fileToImage(file);
      } catch {
        setError("Couldn't read the image — try a different file.");
        setPhase("error");
        return;
      }
      await submitCanvas(img, img.naturalWidth, img.naturalHeight);
    },
    [submitCanvas]
  );

  // ---- Entry point B: webcam capture ----
  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setError("Camera isn't ready yet — wait a moment.");
      return;
    }
    await submitCanvas(video, video.videoWidth, video.videoHeight);
  }, [submitCanvas]);

  const busy = phase === "extracting" || phase === "uploading";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Identity photo</h2>
          <p className="mt-1 text-sm text-slate-600">
            A clear, front-facing solo photo. We use it to verify it&apos;s you at the start
            of every quiz and AI interview. Stored on your account; only the match result
            is shared with recruiters.
          </p>
        </div>
        {status?.hasDescriptor && (
          <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Verified setup
          </span>
        )}
      </header>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row">
        {/* ---- Preview / camera column ---- */}
        <div className="flex-none">
          {mode === "webcam" ? (
            <div className="relative h-40 w-40 overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              {!webcamReady && (
                <span className="absolute inset-0 grid place-items-center text-xs text-slate-300">
                  Starting camera…
                </span>
              )}
            </div>
          ) : (
            <div className="grid h-40 w-40 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Selected photo preview"
                  className="h-full w-full object-cover"
                />
              ) : status?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${status.photoUrl}?t=${status.updatedAt ?? ""}`}
                  alt="Your current identity photo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-slate-400">No photo yet</span>
              )}
            </div>
          )}
        </div>

        {/* ---- Action column ---- */}
        <div className="min-w-0 flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />

          {mode === "choose" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!modelsReady || busy}
                onClick={() => setMode("webcam")}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CameraIcon /> Take photo with webcam
              </button>
              <button
                type="button"
                disabled={!modelsReady || busy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadIcon /> Upload from device
              </button>
            </div>
          )}

          {mode === "webcam" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!modelsReady || !webcamReady || busy}
                onClick={() => void handleCapture()}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Working…" : "Capture & save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("choose");
                  setError(null);
                }}
                disabled={busy}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}

          {!modelsReady && !error && (
            <p className="mt-3 text-xs text-slate-500">Preparing face models…</p>
          )}
          {phase === "extracting" && (
            <p className="mt-3 text-xs text-slate-500">
              Detecting your face and generating the identity descriptor…
            </p>
          )}
          {phase === "uploading" && (
            <p className="mt-3 text-xs text-slate-500">Saving to your account…</p>
          )}
          {phase === "done" && (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              Photo saved. You can now start a quiz or AI interview.
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-slate-500">
            <li>Single face, looking at the camera.</li>
            <li>Even lighting — no strong backlight or heavy shadow.</li>
            <li>No mask, sunglasses, or hat covering the face.</li>
            <li>
              {status?.hasDescriptor
                ? "Replacing your photo overwrites the previous one for all jobs."
                : "Webcam capture is preferred — it uses the same camera the proctor will."}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"
      />
      <circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16"
      />
    </svg>
  );
}

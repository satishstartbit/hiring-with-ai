"use client";

// face-api.js bootstrap for browser-only identity verification.
//
// We use the maintained `@vladmandic/face-api` fork (same API as the original
// justadudewhohacks/face-api.js, but actively maintained and using a modern
// tfjs). All face work — descriptor extraction, euclidean distance, threshold
// gating — happens client-side; the server only stores the resulting 128-d
// embedding. That keeps the server stateless w.r.t. faces and avoids shipping
// node-canvas + tfjs to the server bundle.

import type * as FaceApiNS from "@vladmandic/face-api";

const MODELS_URL = "/models";

/** face-api re-exports tfjs; bundled typings omit setBackend/ready. */
interface TfRuntime {
  setBackend(name: string): Promise<boolean>;
  ready(): Promise<void>;
}

async function initTfBackend(tf: TfRuntime): Promise<void> {
  try {
    await tf.setBackend("webgl");
    await tf.ready();
  } catch {
    await tf.setBackend("cpu");
    await tf.ready();
  }
}

let _faceapi: typeof FaceApiNS | null = null;
let _loadPromise: Promise<typeof FaceApiNS> | null = null;

/**
 * Lazily load face-api.js and the three nets we need (TinyFaceDetector +
 * Landmark68 + Recognition). The first call kicks off model download from
 * `/models/*` (see `public/models/README.md`); subsequent calls return the
 * cached module immediately. Loader is idempotent and concurrent-safe via
 * a shared promise.
 */
export async function loadFaceApi(): Promise<typeof FaceApiNS> {
  if (_faceapi) return _faceapi;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const faceapi = await import("@vladmandic/face-api");
    // Tensorflow backend selection — webgl is fastest on modern browsers;
    // the lib falls back to cpu if webgl init fails (older devices).
    await initTfBackend(faceapi.tf as unknown as TfRuntime);
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]);
    _faceapi = faceapi;
    return faceapi;
  })();

  try {
    return await _loadPromise;
  } catch (err) {
    // Reset so the next call retries instead of returning a rejected promise.
    _loadPromise = null;
    throw err;
  }
}

/**
 * Extract a 128-d face descriptor from an image or video element. Returns
 * null when no face (or no clear single face) is detected — the caller
 * decides how to surface that to the user.
 */
export async function extractDescriptor(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  const faceapi = await loadFaceApi();
  const detection = await faceapi
    .detectSingleFace(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor ?? null;
}

/**
 * Count detected faces in a frame. Used for the "multiple people" check.
 * Lightweight — no landmark/descriptor pass.
 */
export async function countFaces(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<number> {
  const faceapi = await loadFaceApi();
  const detections = await faceapi.detectAllFaces(
    source,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
  );
  return detections.length;
}

// ----- Matching --------------------------------------------------------

/**
 * Verdicts from comparing a live descriptor against the stored profile
 * descriptor. The thresholds match the spec:
 *
 *   distance < 0.4  → strong match (high confidence)
 *   distance < 0.5  → match (acceptable)
 *   distance < 0.6  → unsure (treat as suspicious for live recheck;
 *                              block at initial gate)
 *   distance >= 0.6 → mismatch (different person)
 */
export type IdentityVerdict = "strong" | "match" | "suspicious" | "mismatch";

export interface IdentityResult {
  verdict: IdentityVerdict;
  distance: number;
  /** 0-100 confidence — purely for UI display. */
  confidence: number;
}

export function verdictForDistance(distance: number): IdentityVerdict {
  if (distance < 0.4) return "strong";
  if (distance < 0.5) return "match";
  if (distance < 0.6) return "suspicious";
  return "mismatch";
}

/**
 * Compare a live descriptor against the stored one and return the verdict
 * plus a 0-100 confidence the UI can render. Confidence maps roughly:
 *   distance 0.0 → 100, distance 0.6 → 50, distance 1.0 → 0.
 */
export async function matchDescriptors(
  stored: number[] | Float32Array,
  live: number[] | Float32Array
): Promise<IdentityResult> {
  const faceapi = await loadFaceApi();
  const a = stored instanceof Float32Array ? stored : new Float32Array(stored);
  const b = live instanceof Float32Array ? live : new Float32Array(live);
  const distance = faceapi.euclideanDistance(a, b);
  return {
    verdict: verdictForDistance(distance),
    distance,
    confidence: Math.max(0, Math.min(100, Math.round((1 - distance) * 100))),
  };
}

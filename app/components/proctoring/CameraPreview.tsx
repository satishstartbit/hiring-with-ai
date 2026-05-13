"use client";

import type { RefObject } from "react";
import type { ProctoringStatus } from "./useProctoring";

export default function CameraPreview({
  videoRef,
  status,
  faceCount,
}: Readonly<{
  videoRef: RefObject<HTMLVideoElement | null>;
  status: ProctoringStatus;
  faceCount: number | null;
}>) {
  const indicator = (() => {
    if (status === "requesting") return { color: "bg-amber-400", label: "Waiting for camera…" };
    if (status === "terminated") return { color: "bg-red-500", label: "Camera stopped" };
    if (faceCount === null) return { color: "bg-slate-300", label: "Initializing…" };
    if (faceCount === 0) return { color: "bg-amber-400", label: "Stay in frame" };
    if (faceCount > 1) return { color: "bg-red-500", label: "Multiple faces detected" };
    return { color: "bg-emerald-500", label: "Monitored" };
  })();

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-900 p-2 shadow-sm">
      <div className="relative overflow-hidden rounded-md bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="block h-24 w-32 -scale-x-100 object-cover sm:h-28 sm:w-40"
        />
        <span
          className={`absolute right-1.5 top-1.5 inline-block h-2.5 w-2.5 rounded-full ${indicator.color}`}
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-200">
        {indicator.label}
      </p>
    </div>
  );
}

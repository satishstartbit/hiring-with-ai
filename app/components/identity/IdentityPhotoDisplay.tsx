"use client";

import { useEffect, useState } from "react";

/** Loads the auth-gated profile photo via fetch + blob URL for reliable display. */
export default function IdentityPhotoDisplay({
  photoUrl,
  updatedAt,
  alt,
  className,
  mirrored,
}: Readonly<{
  photoUrl: string;
  updatedAt?: string | null;
  alt: string;
  className?: string;
  /** Mirror horizontally (matches live webcam preview). */
  mirrored?: boolean;
}>) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setSrc(null);

    (async () => {
      try {
        const cacheKey = updatedAt ? `?t=${encodeURIComponent(updatedAt)}` : "";
        const res = await fetch(`${photoUrl}${cacheKey}`, { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const blob = await res.blob();
        if (!blob.size) {
          if (!cancelled) setFailed(true);
          return;
        }
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl, updatedAt]);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-slate-100 text-center text-xs text-slate-500 ${className ?? ""}`}
      >
        <span>Could not load photo</span>
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className ?? ""}`}
      >
        Loading photo…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`h-full w-full object-cover object-center ${mirrored ? "-scale-x-100" : ""} ${className ?? ""}`}
    />
  );
}

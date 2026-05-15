"use client";

import { useEffect, useState } from "react";

export default function ProctoringSnapshotImage({
  candidateId,
  index,
  alt,
}: Readonly<{
  candidateId: string;
  index: number;
  alt: string;
}>) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/candidates/${candidateId}/snapshots/${index}`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const blob = await res.blob();
        if (blob.size === 0) {
          if (!cancelled) setFailed(true);
          return;
        }
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidateId, index]);

  if (failed) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-xs text-slate-500">
        <span>Could not load image</span>
        <span className="text-[10px] text-slate-400">#{index + 1}</span>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-xs text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="aspect-[4/3] w-full object-cover" />
  );
}

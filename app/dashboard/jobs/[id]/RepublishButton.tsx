"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from "@/app/lib/constants/integrations";

const LABELS: Record<IntegrationProvider, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  naukri: "Naukri",
  monster: "Monster",
  glassdoor: "Glassdoor",
};

export default function RepublishButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<IntegrationProvider[]>(["linkedin"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: IntegrationProvider) {
    setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: selected }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message ?? "Publish failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
      >
        + Publish / Re-publish
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium text-slate-600">Select platforms</p>
          <div className="space-y-1">
            {INTEGRATION_PROVIDERS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(p)}
                  onChange={() => toggle(p)}
                />
                {LABELS[p]}
              </label>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={publish}
              disabled={busy || selected.length === 0}
              className="rounded-md bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-60"
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

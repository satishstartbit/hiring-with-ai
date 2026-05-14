"use client";

import { useState } from "react";

type Branding = {
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  emailHeader: string;
  emailFooter: string;
  careerPageTagline: string;
};

export default function SettingsClient({ initial }: { initial: Branding }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message ?? "Failed to save");
        return;
      }
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Branding>(k: K, v: Branding[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-base font-semibold">Branding</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Logo URL" value={form.logoUrl} onChange={(v) => update("logoUrl", v)} />
        {/* <TextField
          label="Favicon URL"
          value={form.faviconUrl}
          onChange={(v) => update("faviconUrl", v)}
        />
        <ColorField
          label="Primary color"
          value={form.primaryColor}
          onChange={(v) => update("primaryColor", v)}
        />
        <ColorField
          label="Accent color"
          value={form.accentColor}
          onChange={(v) => update("accentColor", v)}
        />
        <TextField
          label="Email header"
          value={form.emailHeader}
          onChange={(v) => update("emailHeader", v)}
          className="sm:col-span-2"
        />
        <TextField
          label="Email footer"
          value={form.emailFooter}
          onChange={(v) => update("emailFooter", v)}
          className="sm:col-span-2"
        />
        <TextField
          label="Career page tagline"
          value={form.careerPageTagline}
          onChange={(v) => update("careerPageTagline", v)}
          className="sm:col-span-2"
        /> */}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {savedAt && (
          <p className="text-xs text-emerald-600">Saved at {savedAt.toLocaleTimeString()}</p>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-slate-200"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
        />
      </div>
    </div>
  );
}

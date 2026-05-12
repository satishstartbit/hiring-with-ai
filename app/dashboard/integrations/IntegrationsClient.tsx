"use client";

import { useEffect, useMemo, useState } from "react";
import type { IntegrationProvider } from "@/app/lib/constants/integrations";

type IntegrationView = {
  provider: IntegrationProvider;
  name: string;
  gradient: string;
  description: string;
  status: "connected" | "disconnected" | "expired" | "error";
  accountEmail: string;
  accountName: string;
  externalAccountId: string;
  scope: string;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
  profileSnapshot: Record<string, unknown> | null;
};

type LinkedInConfig = {
  configured: boolean;
  clientId: string;
  redirectUri: string;
  scope: string;
  hasSecret: boolean;
};

export default function IntegrationsClient({ initial }: { initial: IntegrationView[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<IntegrationProvider | null>(null);
  const [expanded, setExpanded] = useState<IntegrationProvider | null>(null);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [linkedInConfig, setLinkedInConfig] = useState<LinkedInConfig | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("linkedin_connected");
    const error = params.get("linkedin_error");
    const description = params.get("linkedin_error_description");
    if (connected === "1") {
      setBanner({ kind: "success", text: "LinkedIn connected successfully." });
    } else if (error) {
      setBanner({
        kind: "error",
        text: linkedInErrorMessage(error, description),
      });
      if (error === "not_configured") setShowLinkedInModal(true);
    }
    if (connected || error) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function startLinkedInConnect() {
    setBusy("linkedin");
    try {
      const res = await fetch("/api/integrations/linkedin/config");
      const data = await res.json();
      if (data.ok && data.data.configured) {
        window.location.href = "/api/integrations/linkedin/connect";
        return;
      }
      setLinkedInConfig(data.ok ? data.data : null);
      setShowLinkedInModal(true);
    } finally {
      setBusy(null);
    }
  }

  async function connect(p: IntegrationProvider) {
    if (p === "linkedin") return startLinkedInConnect();
    setBusy(p);
    try {
      const res = await fetch(`/api/integrations/${p}`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const d = data.data;
        setItems((arr) =>
          arr.map((x) =>
            x.provider === p
              ? {
                  ...x,
                  status: "connected",
                  accountEmail: d.accountEmail ?? "",
                  accountName: d.accountName ?? "",
                  externalAccountId: d.externalAccountId ?? "",
                  scope: d.scope ?? "",
                  lastSyncAt: d.lastSyncAt
                    ? new Date(d.lastSyncAt).toISOString()
                    : new Date().toISOString(),
                  tokenExpiresAt: d.tokenExpiresAt
                    ? new Date(d.tokenExpiresAt).toISOString()
                    : null,
                  connectedAt: x.connectedAt ?? new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  profileSnapshot: d.profileSnapshot ?? null,
                }
              : x
          )
        );
        setExpanded(p);
      }
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(p: IntegrationProvider) {
    setBusy(p);
    try {
      const res = await fetch(`/api/integrations/${p}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setItems((arr) =>
          arr.map((x) =>
            x.provider === p
              ? {
                  ...x,
                  status: "disconnected",
                  accountEmail: "",
                  accountName: "",
                  externalAccountId: "",
                  scope: "",
                  lastSyncAt: null,
                  tokenExpiresAt: null,
                  profileSnapshot: null,
                }
              : x
          )
        );
        if (expanded === p) setExpanded(null);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {banner && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{banner.text}</span>
            <button
              onClick={() => setBanner(null)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <IntegrationCard
            key={it.provider}
            item={it}
            busy={busy === it.provider}
            expanded={expanded === it.provider}
            onToggle={() => setExpanded((cur) => (cur === it.provider ? null : it.provider))}
            onConnect={() => connect(it.provider)}
            onDisconnect={() => disconnect(it.provider)}
            onConfigure={
              it.provider === "linkedin"
                ? async () => {
                    try {
                      const res = await fetch("/api/integrations/linkedin/config");
                      const data = await res.json();
                      setLinkedInConfig(data.ok ? data.data : null);
                    } finally {
                      setShowLinkedInModal(true);
                    }
                  }
                : undefined
            }
          />
        ))}
      </div>

      {showLinkedInModal && (
        <LinkedInConfigModal
          initial={linkedInConfig}
          onClose={() => setShowLinkedInModal(false)}
          onSaved={() => {
            setShowLinkedInModal(false);
            setBanner({ kind: "success", text: "Credentials saved. Redirecting to LinkedIn…" });
            window.location.href = "/api/integrations/linkedin/connect";
          }}
        />
      )}
    </div>
  );
}

function linkedInErrorMessage(code: string, description: string | null): string {
  const base =
    {
      not_configured: "LinkedIn isn't configured yet. Add your Client ID and Secret to continue.",
      invalid_state: "The LinkedIn sign-in session expired. Please try again.",
      token_exchange_failed: "LinkedIn rejected the token exchange.",
      callback_failed: "Something went wrong finishing the LinkedIn connection.",
      start_failed: "Could not start the LinkedIn flow.",
      access_denied: "You cancelled the LinkedIn sign-in.",
    }[code] ?? `LinkedIn error: ${code}`;
  return description ? `${base} (${description})` : base;
}

function LinkedInConfigModal({
  initial,
  onClose,
  onSaved,
}: Readonly<{
  initial: LinkedInConfig | null;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(initial?.redirectUri ?? "");
  const [scope, setScope] = useState(initial?.scope ?? "openid profile email w_member_social");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/linkedin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, redirectUri, scope }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message ?? "Could not save credentials.");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save credentials.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <form
        onSubmit={save}
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Configure LinkedIn</h2>
          <p className="mt-1 text-xs text-slate-500">
            Create an app at{" "}
            <a
              href="https://www.linkedin.com/developers/apps"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              linkedin.com/developers/apps
            </a>{" "}
            and paste its Client ID and Secret. The Redirect URL below must be added to your app's
            <span className="font-medium"> Auth → Authorized redirect URLs</span>.
          </p>
        </div>

        <div className="space-y-3">
          <Labelled label="Client ID" required>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Labelled>
          <Labelled
            label={
              initial?.hasSecret
                ? "Client Secret (already set — re-enter to update)"
                : "Client Secret"
            }
            required
          >
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Labelled>
          <Labelled label="Redirect URI">
            <input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Copy this exact URL into your LinkedIn app's Authorized redirect URLs.
            </p>
          </Labelled>
          <Labelled label="Scopes">
            <input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Space-separated. <code>openid profile email</code> for identity;{" "}
              <code>w_member_social</code> to share posts.
            </p>
          </Labelled>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Labelled({
  label,
  required,
  children,
}: Readonly<{ label: React.ReactNode; required?: boolean; children: React.ReactNode }>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function IntegrationCard({
  item,
  busy,
  expanded,
  onToggle,
  onConnect,
  onDisconnect,
  onConfigure,
}: Readonly<{
  item: IntegrationView;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigure?: () => void;
}>) {
  const connected = item.status === "connected";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`h-1.5 w-full bg-gradient-to-r ${item.gradient}`} />
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br ${item.gradient} text-xs font-bold text-white`}
              >
                {item.name[0]}
              </span>
              <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">{item.description}</p>
          </div>
          <StatusPill status={item.status} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
          <Field label="Account">
            <span className="truncate text-slate-700">{item.accountEmail || "—"}</span>
          </Field>
          <Field label="Last sync">
            <span className="text-slate-700" suppressHydrationWarning>
              {formatDate(item.lastSyncAt)}
            </span>
          </Field>
        </div>

        {connected && expanded && <DetailsPanel item={item} />}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-3">
            {connected && (
              <button
                onClick={onToggle}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                {expanded ? "Hide details" : "View details"}
              </button>
            )}
            {onConfigure && (
              <button
                onClick={onConfigure}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Settings
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {connected ? (
              <button
                onClick={onDisconnect}
                disabled={busy}
                className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
              >
                {busy ? "Working…" : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={onConnect}
                disabled={busy}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {busy ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailsPanel({ item }: Readonly<{ item: IntegrationView }>) {
  const tokenState = useMemo(() => describeTokenState(item.tokenExpiresAt), [item.tokenExpiresAt]);
  const scopes = item.scope ? item.scope.split(/\s+/).filter(Boolean) : [];
  const profileEntries = item.profileSnapshot
    ? Object.entries(item.profileSnapshot).filter(([, v]) => v !== null && v !== undefined && v !== "")
    : [];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Connection details
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field label="Display name">
          <span className="text-slate-800">{item.accountName || "—"}</span>
        </Field>
        <Field label="External account ID">
          <code className="break-all rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200">
            {item.externalAccountId || "—"}
          </code>
        </Field>
        <Field label="Connected since">
          <span className="text-slate-700" suppressHydrationWarning>
            {formatDate(item.connectedAt)}
          </span>
        </Field>
        <Field label="Last updated">
          <span className="text-slate-700" suppressHydrationWarning>
            {formatDate(item.updatedAt)}
          </span>
        </Field>
        <Field label="Token status">
          <span className={tokenState.className} suppressHydrationWarning>
            {tokenState.label}
          </span>
        </Field>
        <Field label="Token expires">
          <span className="text-slate-700" suppressHydrationWarning>
            {formatDate(item.tokenExpiresAt)}
          </span>
        </Field>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Granted scopes</p>
        {scopes.length ? (
          <div className="flex flex-wrap gap-1.5">
            {scopes.map((s) => (
              <span
                key={s}
                className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200"
              >
                {s}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">No scopes recorded.</p>
        )}
      </div>

      {profileEntries.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Profile snapshot</p>
          <dl className="grid grid-cols-1 gap-y-1 text-xs sm:grid-cols-2 sm:gap-x-4">
            {profileEntries.map(([k, v]) => (
              <div key={k} className="flex gap-1">
                <dt className="text-slate-500">{humanize(k)}:</dt>
                <dd className="truncate text-slate-700">{renderValue(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <p className="uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  let styles = "bg-slate-100 text-slate-600";
  if (status === "connected") styles = "bg-emerald-100 text-emerald-700";
  else if (status === "expired" || status === "error") styles = "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles}`}>{status}</span>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function describeTokenState(iso: string | null): { label: string; className: string } {
  if (!iso) return { label: "No expiry recorded", className: "text-slate-500" };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "Expired", className: "text-rose-600" };
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days <= 7) return { label: `Expires in ${days}d`, className: "text-amber-600" };
  return { label: `Valid · ${days}d remaining`, className: "text-emerald-600" };
}

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function renderValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "—";
  }
}

"use client";

import { useState } from "react";
import type { Role } from "@/app/lib/db/models/User";
import { ROLE_LABELS } from "@/app/lib/auth/permissions";

type Member = {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  lastLoginAt: string | null;
  joinedAt: string | null;
  roleLabel: string;
};

const INVITABLE_ROLES: { value: Role; label: string }[] = [
  { value: "company_admin", label: "Company Admin" },
  { value: "recruiter", label: "Recruiter" },
  { value: "hr_manager", label: "HR Manager" },
  { value: "hiring_manager", label: "Hiring Manager" },
];

export default function TeamClient({
  canManage,
  currentUserId,
  initialMembers,
}: {
  canManage: boolean;
  currentUserId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [inviting, setInviting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{
    email: string;
    tempPassword: string;
    inviteUrl: string;
    emailSent: boolean;
    emailStubbed: boolean;
    emailError: string | null;
  } | null>(null);

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInviting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      role: String(form.get("role") ?? "recruiter") as Role,
    };
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message ?? "Failed to invite member");
        return;
      }
      setMembers((m) => [
        ...m,
        {
          id: data.data.id,
          email: data.data.email,
          name: data.data.name,
          role: data.data.role,
          emailVerified: false,
          lastLoginAt: null,
          joinedAt: new Date().toISOString(),
          roleLabel: ROLE_LABELS[data.data.role as Role],
        },
      ]);
      setLastInvite({
        email: data.data.email,
        tempPassword: data.data.tempPassword,
        inviteUrl: data.data.inviteUrl ?? "",
        emailSent: data.data.invite?.emailSent ?? false,
        emailStubbed: data.data.invite?.emailStubbed ?? false,
        emailError: data.data.invite?.emailError ?? null,
      });
      setShowForm(false);
      (e.target as HTMLFormElement).reset();
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: Role) {
    const res = await fetch(`/api/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (data.ok) {
      setMembers((m) =>
        m.map((x) => (x.id === memberId ? { ...x, role, roleLabel: ROLE_LABELS[role] } : x))
      );
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Remove this member?")) return;
    const res = await fetch(`/api/team/${memberId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setMembers((m) => m.filter((x) => x.id !== memberId));
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {showForm ? "Cancel" : "+ Invite member"}
          </button>
        </div>
      )}

      {lastInvite && (
        <InviteResultBanner invite={lastInvite} onDismiss={() => setLastInvite(null)} />
      )}

      {showForm && canManage && (
        <form
          onSubmit={handleInvite}
          className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
        >
          <input
            name="name"
            placeholder="Full name"
            required
            className="rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-1"
          />
          <input
            name="email"
            type="email"
            placeholder="email@company.com"
            required
            className="rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-1"
          />
          <select
            name="role"
            defaultValue="recruiter"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-1"
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 sm:col-span-1"
          >
            {inviting ? "Inviting…" : "Send invite"}
          </button>
          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-4">
              {error}
            </p>
          )}
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Joined</th>
              {canManage && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.id === currentUserId;
              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{m.name}</div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && !isSelf ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value as Role)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                      >
                        {INVITABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-700">{m.roleLabel}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.emailVerified ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => handleRemove(m.id)}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type InviteResult = {
  email: string;
  tempPassword: string;
  inviteUrl: string;
  emailSent: boolean;
  emailStubbed: boolean;
  emailError: string | null;
};

function InviteResultBanner({
  invite,
  onDismiss,
}: Readonly<{ invite: InviteResult; onDismiss: () => void }>) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — fall back silently
    }
  }

  const styles = (() => {
    if (!invite.emailSent) return "border-rose-200 bg-rose-50 text-rose-900";
    if (invite.emailStubbed) return "border-amber-200 bg-amber-50 text-amber-900";
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  })();

  const heading = (() => {
    if (!invite.emailSent) return `Invite created for ${invite.email}, but the email failed to send.`;
    if (invite.emailStubbed)
      return `Invite created for ${invite.email}. Email is in stub mode — copy the link below to share manually.`;
    return `Invite emailed to ${invite.email}. They'll receive a "Set password" link.`;
  })();

  return (
    <div className={`rounded-md border p-4 text-sm ${styles}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{heading}</p>
        <button
          onClick={onDismiss}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          dismiss
        </button>
      </div>

      {invite.emailError && (
        <p className="mt-1 text-xs">SMTP error: {invite.emailError}</p>
      )}

      {invite.inviteUrl && (
        <div className="mt-3 space-y-1">
          <p className="text-xs uppercase tracking-wide opacity-70">Invite link</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs">
              {invite.inviteUrl}
            </code>
            <button
              onClick={copyLink}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer opacity-70 hover:opacity-100">
          Fallback temp password
        </summary>
        <p className="mt-1">
          If the link doesn&apos;t reach them, they can log in with:{" "}
          <code className="rounded bg-white px-1.5 py-0.5">{invite.tempPassword}</code>
        </p>
      </details>
    </div>
  );
}

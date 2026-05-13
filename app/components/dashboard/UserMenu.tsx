"use client";

import { useState } from "react";
import { ROLE_LABELS } from "@/app/lib/auth/permissions";
import { logoutAction } from "@/app/actions/auth";
import type { Role } from "@/app/lib/db/models/User";

export default function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: Role;
}) {
  const [open, setOpen] = useState(false);
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm hover:bg-slate-50"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-xs font-medium text-white">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-900">{name}</span>
          <span className="block text-xs leading-tight text-slate-500">{ROLE_LABELS[role]}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-medium text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

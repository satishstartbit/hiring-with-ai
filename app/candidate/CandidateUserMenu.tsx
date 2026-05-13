"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";

export default function CandidateUserMenu({
  name,
  email,
}: Readonly<{
  name: string;
  email: string;
}>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside close — avoids the menu eating taps when the user moves on.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-xs font-medium text-white">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-900">{name}</span>
          <span className="block text-xs leading-tight text-slate-500">Candidate</span>
        </span>
        <svg
          className="hidden h-4 w-4 text-slate-400 sm:block"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-medium text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <Link
            href="/candidate"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            My applications
          </Link>
          <Link
            href="/candidate/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Profile
          </Link>
          <Link
            href="/jobs"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Browse jobs
          </Link>
          <form action={logoutAction} className="border-t border-slate-100">
            <button
              type="submit"
              className="block w-full px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

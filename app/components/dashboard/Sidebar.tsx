"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "@/app/lib/auth/permissions";
import type { Role } from "@/app/lib/db/models/User";
import BrandLogo from "@/app/components/BrandLogo";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "□" },
  { href: "/dashboard/jobs", label: "Jobs", icon: "▤" },
  { href: "/dashboard/candidates", label: "Candidates", icon: "◉" },
  { href: "/dashboard/interviews", label: "AI Interviews", icon: "◑" },
  { href: "/dashboard/integrations", label: "Integrations", icon: "⌬" },
  { href: "/dashboard/team", label: "Team", icon: "☷" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({
  role,
  workspaceName,
}: {
  role: Role;
  workspaceName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // While the drawer is open: lock body scroll and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function navBody() {
    return (
      <>
        <Link href="/dashboard" className="mb-6 block" onClick={close}>
          <BrandLogo size="md" imageClassName="h-12 w-auto" />
          <p className="mt-2 truncate text-xs text-slate-500">{workspaceName}</p>
        </Link>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className="w-4 text-slate-400">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p className="font-medium text-slate-700">{ROLE_LABELS[role]}</p>
          <p className="text-slate-500">Role-based access enabled</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Mobile trigger — sits in the dashboard header's left padding zone. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="fixed left-3 top-2.5 z-30 grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-lg leading-none text-slate-600 shadow-sm hover:bg-slate-50 lg:hidden"
      >
        ☰
      </button>

      {/* Desktop sidebar — always visible from lg up. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        {navBody()}
      </aside>

      {/* Mobile drawer + backdrop. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
            {navBody()}
          </aside>
        </div>
      )}
    </>
  );
}

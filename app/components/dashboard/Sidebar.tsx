"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
      <Link href="/dashboard" className="mb-6 block">
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
    </aside>
  );
}

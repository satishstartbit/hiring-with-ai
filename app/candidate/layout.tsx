import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentCandidate } from "@/app/lib/auth/dal";
import CandidateUserMenu from "./CandidateUserMenu";
import BrandLogo from "@/app/components/BrandLogo";

export default async function CandidateLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentCandidate();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/candidate" className="flex items-center gap-3 text-base font-semibold text-slate-900">
              <BrandLogo size="sm" imageClassName="h-9 w-auto" />
              <span className="ml-1 hidden rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:inline">
                Candidate
              </span>
            </Link>
            <nav className="hidden gap-5 text-sm sm:flex">
              <Link href="/candidate" className="text-slate-600 hover:text-slate-900">
                Applications
              </Link>
              <Link href="/candidate/profile" className="text-slate-600 hover:text-slate-900">
                Profile
              </Link>
              <Link href="/jobs" className="text-slate-600 hover:text-slate-900">
                Browse jobs
              </Link>
            </nav>
          </div>
          <CandidateUserMenu name={user.name} email={user.email} />
        </div>
        {/* Mobile sub-nav — keeps the same destinations one tap away on small screens */}
        <nav className="flex gap-4 border-t border-slate-100 bg-white px-4 py-2 text-sm sm:hidden">
          <Link href="/candidate" className="text-slate-600 hover:text-slate-900">
            Applications
          </Link>
          <Link href="/candidate/profile" className="text-slate-600 hover:text-slate-900">
            Profile
          </Link>
          <Link href="/jobs" className="text-slate-600 hover:text-slate-900">
            Browse jobs
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}

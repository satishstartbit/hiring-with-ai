import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentCandidate, getCurrentUser, optionalSession } from "@/app/lib/auth/dal";
import CandidateUserMenu from "@/app/candidate/CandidateUserMenu";
import UserMenu from "@/app/components/dashboard/UserMenu";

export default async function JobsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await optionalSession();

  const candidate = session?.role === "candidate" ? await getCurrentCandidate() : null;
  const hrUser = session?.userId && session.role !== "candidate" ? await getCurrentUser() : null;
  const homeHref = candidate ? "/candidate" : hrUser ? "/dashboard" : "/";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={homeHref}
              className="flex items-center gap-2 text-base font-semibold text-slate-900"
            >
              <span className="grid h-8 w-8 place-items-center rounded-md bg-indigo-600 text-white">
                H
              </span>
              <span>HireAI</span>
              {candidate ? (
                <span className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:inline">
                  Candidate
                </span>
              ) : hrUser ? (
                <span className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:inline">
                  Team
                </span>
              ) : null}
            </Link>

            <nav className="hidden items-center gap-5 text-sm sm:flex">
              <Link href="/jobs" className="text-slate-600 hover:text-slate-900">
                Browse jobs
              </Link>
              {candidate && (
                <>
                  <Link href="/candidate" className="text-slate-600 hover:text-slate-900">
                    Applications
                  </Link>
                  <Link
                    href="/candidate/profile"
                    className="text-slate-600 hover:text-slate-900"
                  >
                    Profile
                  </Link>
                </>
              )}
              {hrUser && (
                <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
                  Dashboard
                </Link>
              )}
            </nav>
          </div>

          {candidate ? (
            <CandidateUserMenu name={candidate.name} email={candidate.email} />
          ) : hrUser ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="hidden rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex"
              >
                Dashboard
              </Link>
              <UserMenu name={hrUser.name} email={hrUser.email} role={hrUser.role} />
            </div>
          ) : (
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/login" className="text-slate-600 hover:text-slate-900">
                Sign in
              </Link>
              <Link
                href="/candidate-register"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
              >
                Create account
              </Link>
            </nav>
          )}
        </div>

        {candidate && (
          <nav className="flex gap-4 border-t border-slate-100 bg-white px-4 py-2 text-sm sm:hidden">
            <Link href="/jobs" className="text-slate-600 hover:text-slate-900">
              Browse jobs
            </Link>
            <Link href="/candidate" className="text-slate-600 hover:text-slate-900">
              Applications
            </Link>
            <Link href="/candidate/profile" className="text-slate-600 hover:text-slate-900">
              Profile
            </Link>
          </nav>
        )}
      </header>

      {children}
    </div>
  );
}

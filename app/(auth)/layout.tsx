import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:py-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-indigo-600 text-white">
              H
            </span>
            <span>HireAI</span>
          </Link>
          <nav className="text-sm text-slate-600">
            <Link href="/login" className="mr-4 hover:text-slate-900">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100"
            >
              Create workspace
            </Link>
          </nav>
        </header>

        <main className="grid flex-1 place-items-center py-10">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              {children}
            </div>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-500">
          {new Date().getFullYear()} HireAI — AI-native hiring OS
        </footer>
      </div>
    </div>
  );
}

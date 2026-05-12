import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:py-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
              H
            </span>
            <span>HireAI</span>
          </Link>
          <nav className="text-sm text-slate-400">
            <Link href="/login" className="mr-4 hover:text-white">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-white/10 px-3 py-1.5 backdrop-blur hover:bg-white/20"
            >
              Create workspace
            </Link>
          </nav>
        </header>

        <main className="grid flex-1 place-items-center py-10">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
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

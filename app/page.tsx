import Link from "next/link";
import { optionalSession } from "@/app/lib/auth/dal";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await optionalSession();
  if (session) redirect(session.role === "candidate" ? "/candidate" : "/dashboard");

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-indigo-600 text-white">
            H
          </span>
          <span>HireAI</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-slate-600 hover:text-slate-900">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-24 text-center">
        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          The AI-native hiring OS
        </span>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight text-slate-900">
          Hire faster with an AI workforce built for recruiting teams.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Register your company, set up your workspace, manage recruiters and hiring managers, and
          plug into LinkedIn, Indeed, Naukri, and more — all from a single dashboard.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/register"
            className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            Create your workspace
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-3">
        {[
          {
            title: "Multi-tenant workspaces",
            body: "Each company gets its own branded workspace with roles for admins, recruiters, HR, and hiring managers.",
          },
          {
            title: "Job board integrations",
            body: "Connect LinkedIn, Indeed, Naukri, Monster, and Glassdoor. Sync postings and manage applicants in one place.",
          },
          {
            title: "AI screening & interviews",
            body: "Generate JDs, screen resumes, and run AI interviews powered by an agentic LangGraph pipeline.",
          },
        ].map((c) => (
          <div
            key={c.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{c.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

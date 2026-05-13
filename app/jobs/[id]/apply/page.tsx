import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import mongoose from "mongoose";
import { requireCandidate } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import Candidate from "@/app/lib/db/models/Candidate";
import ApplyStage1Form, { type ApplicationQuestion } from "./ApplyStage1Form";

export const dynamic = "force-dynamic";

export default async function ApplyPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();

  // Force a logged-in candidate. Proxy already handles the "not signed in"
  // case; this catches HR users who tried to apply via direct URL.
  const session = await requireCandidate();

  await connectDB();
  const job = await Job.findById(id).lean();
  if (!job) notFound();

  // Existing application → straight to that candidate's stage page.
  const existing = await Candidate.findOne({ jobId: id, userId: session.userId })
    .select("_id")
    .lean();
  if (existing) {
    redirect(`/candidate/applications/${String(existing._id)}`);
  }

  if (job.status !== "active" && job.status !== "ai_generated") {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">This role isn’t open</h1>
          <p className="mt-2 text-sm text-slate-600">
            {job.title} is no longer accepting applications.
          </p>
          <Link
            href="/jobs"
            className="mt-5 inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Browse other jobs
          </Link>
        </div>
      </main>
    );
  }

  const applicationQuestions: ApplicationQuestion[] = (job.applicationQuestions ?? []).map(
    (q) => ({
      question: q.question,
      kind: q.kind,
      placeholder: q.placeholder,
      required: q.required,
    })
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <nav className="mb-4 text-sm text-slate-500">
        <Link href={`/jobs/${id}`} className="hover:text-slate-800">
          ← Back to job
        </Link>
      </nav>

      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Apply — step 1 of 3
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Apply for {job.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as <span className="font-medium text-slate-900">{session.email}</span>.
          After your resume is checked, the quiz and AI interview can be completed any time —
          you don’t have to do them in one sitting.
        </p>
      </header>

      <ApplyStage1Form
        jobId={id}
        jobTitle={job.title}
        defaultEmail={session.email}
        applicationQuestions={applicationQuestions}
      />
    </main>
  );
}

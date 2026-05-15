import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import mongoose from "mongoose";
import { requireCandidate } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Candidate from "@/app/lib/db/models/Candidate";
import QuizClient from "./QuizClient";
import IdentityVerificationGate from "@/app/components/identity/IdentityVerificationGate";

export const dynamic = "force-dynamic";

export default async function QuizPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();

  const session = await requireCandidate();
  await connectDB();
  const app = await Candidate.findOne({ _id: id, userId: session.userId })
    .select("_id jobTitle stage")
    .lean();
  if (!app) notFound();

  if (app.stage === "rejected") {
    redirect(`/candidate/applications/${id}`);
  }
  if (
    app.stage === "quiz_completed" ||
    app.stage === "interview_in_progress" ||
    app.stage === "completed"
  ) {
    redirect(`/candidate/applications/${id}`);
  }

  return (
    <div className="space-y-5">
      <nav className="text-sm text-slate-500">
        <Link href={`/candidate/applications/${id}`} className="hover:text-slate-800">
          ← Back to application
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Step 2 of 3 — screening quiz
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {app.jobTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          The same questions are saved for you, so feel free to close the tab and come back.
          The timer resets when you do.
        </p>
      </header>

      <IdentityVerificationGate mode="quiz" title="Verify your identity to start the quiz">
        <QuizClient applicationId={id} />
      </IdentityVerificationGate>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import mongoose from "mongoose";
import { requireCandidate } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Candidate from "@/app/lib/db/models/Candidate";
import InterviewLaunchClient from "./InterviewLaunchClient";
import IdentityVerificationGate from "@/app/components/identity/IdentityVerificationGate";

export const dynamic = "force-dynamic";

export default async function InterviewLaunchPage({
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

  // Funnel candidates to where they should actually be.
  if (app.stage === "screening" || app.stage === "quiz_in_progress") {
    redirect(`/candidate/applications/${id}/quiz`);
  }
  if (app.stage === "rejected" || app.stage === "completed") {
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
          Step 3 of 3 — AI interview
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {app.jobTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          When you click below, we’ll start an AI interview session for this role. You can rejoin
          from this page any time before it’s complete.
        </p>
      </header>

      <IdentityVerificationGate
        mode="interview"
        title="Verify your identity to start the interview"
      >
        <InterviewLaunchClient
          applicationId={id}
          alreadyInProgress={app.stage === "interview_in_progress"}
        />
      </IdentityVerificationGate>
    </div>
  );
}

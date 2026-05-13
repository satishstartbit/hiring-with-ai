import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { readSession } from "../../../../../lib/auth/session";
import { connectDB } from "../../../../../lib/db/connection";
import Candidate from "../../../../../lib/db/models/Candidate";
import Job from "../../../../../lib/db/models/Job";
import InterviewSession from "../../../../../lib/db/models/InterviewSession";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return Response.json({ error: "Invalid application ID" }, { status: 400 });
  }
  const session = await readSession();
  if (!session?.userId) {
    return Response.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (session.role !== "candidate") {
    return Response.json({ error: "Candidate accounts only" }, { status: 403 });
  }

  await connectDB();
  const candidate = await Candidate.findOne({ _id: id, userId: session.userId });
  if (!candidate) {
    return Response.json({ error: "Application not found" }, { status: 404 });
  }

  if (
    candidate.stage !== "quiz_completed" &&
    candidate.stage !== "interview_in_progress"
  ) {
    return Response.json(
      { error: "Finish the quiz before starting the interview." },
      { status: 400 }
    );
  }

  // Idempotent: reuse the existing session if there is one.
  let interview = candidate.interviewSessionId
    ? await InterviewSession.findById(candidate.interviewSessionId)
    : null;

  if (!interview) {
    const job = await Job.findById(candidate.jobId).lean();
    if (!job) return Response.json({ error: "Job no longer available" }, { status: 404 });

    interview = await InterviewSession.create({
      candidateId: candidate._id,
      jobId: candidate.jobId,
      jobTitle: job.title,
      jobDescription: job.description ?? "",
      jobRequirements: job.requirements ?? [],
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      status: "scheduled",
      scheduledAt: new Date(),
      questions: [],
      conversationHistory: [],
      answers: [],
      currentQuestionIndex: 0,
    });
    candidate.interviewSessionId = interview._id;
  }

  if (candidate.stage === "quiz_completed") {
    candidate.stage = "interview_in_progress";
  }
  await candidate.save();

  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const origin = request.headers.get("origin") ?? `${proto}://${host}`;
  const meetingUrl = `${origin}/interview/${interview._id}`;
  if (!interview.meetingUrl) {
    interview.meetingUrl = meetingUrl;
    await interview.save();
  }

  return Response.json({
    interviewSessionId: String(interview._id),
    meetingUrl,
    stage: candidate.stage,
  });
}

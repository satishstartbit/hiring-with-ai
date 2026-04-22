import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import Candidate from "../../../../lib/db/models/Candidate";
import { runGradeInterview } from "../../../../lib/workflow/interviewGraph";
import { sendInterviewResultEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  if (!mongoose.isValidObjectId(sessionId)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  await connectDB();

  const session = await InterviewSession.findById(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "completed" && session.totalScore !== undefined) {
    return Response.json({
      totalScore: session.totalScore,
      questionScores: session.questionScores,
      questionFeedback: session.questionFeedback,
      overallFeedback: session.overallFeedback,
    });
  }

  const result = await runGradeInterview({
    jobTitle: session.jobTitle,
    jobRequirements: session.jobRequirements,
    questions: session.questions,
    answers: session.answers,
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  await InterviewSession.findByIdAndUpdate(sessionId, {
    status: "completed",
    completedAt: new Date(),
    totalScore: result.totalScore,
    questionScores: result.questionScores,
    questionFeedback: result.questionFeedback,
    overallFeedback: result.overallFeedback,
  });

  await Candidate.findByIdAndUpdate(session.candidateId, {
    status: result.totalScore >= 70 ? "offer" : "reviewing",
  });

  await sendInterviewResultEmail({
    to: session.candidateEmail,
    candidateName: session.candidateName,
    jobTitle: session.jobTitle,
    totalScore: result.totalScore,
    overallFeedback: result.overallFeedback,
    questionScores: result.questionScores,
    questionFeedback: result.questionFeedback,
    questions: session.questions,
  }).catch((err) => console.error("[email] interview result send failed:", err));

  return Response.json({
    totalScore: result.totalScore,
    questionScores: result.questionScores,
    questionFeedback: result.questionFeedback,
    overallFeedback: result.overallFeedback,
  });
}

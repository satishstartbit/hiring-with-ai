import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import Candidate from "../../../../lib/db/models/Candidate";
import { runStartInterview } from "../../../../lib/workflow/interviewGraph";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  if (!mongoose.isValidObjectId(sessionId)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  await connectDB();
  const session = await InterviewSession.findById(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  // Already started — return existing state
  if (session.status === "in_progress" && session.questions.length > 0) {
    return Response.json({
      firstMessage: session.conversationHistory[0]?.content ?? "",
      totalQuestions: session.questions.length,
      currentQuestionIndex: session.currentQuestionIndex,
    });
  }

  if (session.status === "completed") {
    return Response.json({ error: "Interview already completed" }, { status: 400 });
  }

  // Generate questions and start
  const result = await runStartInterview({
    jobTitle: session.jobTitle,
    jobDescription: session.jobDescription,
    jobRequirements: session.jobRequirements,
    candidateName: session.candidateName,
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  await InterviewSession.findByIdAndUpdate(sessionId, {
    status: "in_progress",
    startedAt: new Date(),
    questions: result.questions,
    conversationHistory: [{ role: "assistant", content: result.firstMessage, timestamp: new Date() }],
    answers: [],
    currentQuestionIndex: 0,
  });

  await Candidate.findByIdAndUpdate(session.candidateId, { status: "interviewing" });

  return Response.json({
    firstMessage: result.firstMessage,
    totalQuestions: result.questions.length,
    currentQuestionIndex: 0,
  });
}

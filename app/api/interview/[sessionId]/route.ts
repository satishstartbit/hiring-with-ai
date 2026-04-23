import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../lib/db/connection";
import InterviewSession from "../../../lib/db/models/InterviewSession";
import Candidate from "../../../lib/db/models/Candidate";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  if (!mongoose.isValidObjectId(sessionId)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  await connectDB();
  const session = await InterviewSession.findById(sessionId).lean();
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const candidate = await Candidate
    .findById(session.candidateId)
    .select("resumeMatchScore answerScore")
    .lean() as { resumeMatchScore?: number; answerScore?: number } | null;

  return Response.json({
    sessionId: session._id.toString(),
    status: session.status,
    jobTitle: session.jobTitle,
    candidateName: session.candidateName,
    scheduledAt: session.scheduledAt.toISOString(),
    startedAt: session.startedAt?.toISOString(),
    questions: session.questions,
    currentQuestionIndex: session.currentQuestionIndex,
    totalQuestions: session.questions.length,
    conversationHistory: session.conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    totalScore: session.totalScore,
    overallFeedback: session.overallFeedback,
    questionScores: session.questionScores,
    questionFeedback: session.questionFeedback,
    resumeMatchScore: candidate?.resumeMatchScore,
    answerScore: candidate?.answerScore,
  });
}

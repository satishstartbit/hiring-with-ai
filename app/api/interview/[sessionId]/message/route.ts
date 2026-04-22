import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import { runSendMessage } from "../../../../lib/workflow/interviewGraph";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  if (!mongoose.isValidObjectId(sessionId)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { message } = body as { message?: string };
  if (!message?.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  await connectDB();

  const session = await InterviewSession.findById(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "completed") {
    return Response.json({ error: "Interview already completed" }, { status: 400 });
  }

  const result = await runSendMessage({
    jobTitle: session.jobTitle,
    jobRequirements: session.jobRequirements,
    candidateName: session.candidateName,
    questions: session.questions,
    conversationHistory: session.conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    userMessage: message.trim(),
    currentQuestionIndex: session.currentQuestionIndex,
    answers: session.answers,
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  await InterviewSession.findByIdAndUpdate(sessionId, {
    conversationHistory: result.conversationHistory.map((m) => ({
      ...m,
      timestamp: new Date(),
    })),
    currentQuestionIndex: result.currentQuestionIndex,
    answers: result.answers,
    ...(result.isComplete ? { status: "completed", completedAt: new Date() } : {}),
  });

  return Response.json({
    aiReply: result.aiReply,
    currentQuestionIndex: result.currentQuestionIndex,
    isComplete: result.isComplete,
    totalQuestions: session.questions.length,
  });
}

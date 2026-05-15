import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import AssessmentConfig from "../../../../lib/db/models/AssessmentConfig";
import { runSendMessage } from "../../../../lib/workflow/interviewGraph";
import {
  ZERO_SCORES,
  type PlannedQuestion,
  type QuestionType,
  type Difficulty,
  type InterviewSettings,
} from "../../../../lib/workflow/interviewState";

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

  const questions: PlannedQuestion[] = (session.questionPlan ?? []).length
    ? session.questionPlan!.map((q) => ({
        prompt: q.prompt,
        type: q.type as QuestionType,
        difficulty: q.difficulty as Difficulty,
        skill: q.skill,
        generatedAdaptively: q.generatedAdaptively,
      }))
    : session.questions.map((prompt) => ({
        prompt,
        type: "technical" as QuestionType,
        difficulty: "medium" as Difficulty,
        generatedAdaptively: false,
      }));

  // Re-load per-job AI-interview settings so allowFollowups + adaptiveDifficulty
  // are enforced on every candidate turn, not just at planning time.
  const assessmentConfig = await AssessmentConfig.findOne({ jobId: session.jobId })
    .select("interview")
    .lean();
  const interviewSettings: InterviewSettings | null = assessmentConfig?.interview
    ? {
        durationMinutes: assessmentConfig.interview.durationMinutes ?? 15,
        questionCount: assessmentConfig.interview.questionCount ?? 8,
        topics:
          (assessmentConfig.interview.topics as QuestionType[]) ?? [
            "introduction",
            "technical",
            "scenario",
            "behavioral",
          ],
        difficulty: assessmentConfig.interview.difficulty ?? "medium",
        passingScore: assessmentConfig.interview.passingScore ?? 20,
        allowFollowups: assessmentConfig.interview.allowFollowups ?? true,
        adaptiveDifficulty: assessmentConfig.interview.adaptiveDifficulty ?? true,
      }
    : null;

  const result = await runSendMessage({
    candidateId: session.candidateId.toString(),
    jobId: session.jobId.toString(),
    interviewSessionId: sessionId,
    jobTitle: session.jobTitle,
    jobRequirements: session.jobRequirements,
    candidateName: session.candidateName,
    resumeIntelligence: session.resumeIntelligence ?? null,
    skillMatch: session.skillMatch ?? null,
    strongSkills: session.strongSkills ?? [],
    weakSkills: session.weakSkills ?? [],
    questions,
    currentQuestionIndex: session.currentQuestionIndex,
    currentDifficulty: session.currentDifficulty ?? "medium",
    conversationHistory: session.conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    answers: session.answers,
    evaluations: session.evaluations ?? [],
    runningScores: session.dimensionScores ?? { ...ZERO_SCORES },
    userMessage: message.trim(),
    interviewSettings,
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  await InterviewSession.findByIdAndUpdate(sessionId, {
    conversationHistory: result.conversationHistory.map((m) => ({
      ...m,
      timestamp: new Date(),
    })),
    // The DifficultyDecisionNode may have rewritten future question prompts —
    // mirror that back into the legacy `questions` array so the UI stays in sync.
    questions: result.questions.map((q) => q.prompt),
    questionPlan: result.questions,
    currentQuestionIndex: result.currentQuestionIndex,
    currentDifficulty: result.currentDifficulty,
    answers: result.answers,
    evaluations: result.evaluations,
    dimensionScores: result.runningScores,
    ...(result.isComplete ? { status: "completed", completedAt: new Date() } : {}),
  });

  return Response.json({
    aiReply: result.aiReply,
    currentQuestionIndex: result.currentQuestionIndex,
    isComplete: result.isComplete,
    totalQuestions: result.questions.length,
  });
}

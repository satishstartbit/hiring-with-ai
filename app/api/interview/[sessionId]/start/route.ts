import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import Candidate from "../../../../lib/db/models/Candidate";
import AssessmentConfig from "../../../../lib/db/models/AssessmentConfig";
import { runStartInterview } from "../../../../lib/workflow/interviewGraph";
import { extractResumeText } from "../../../../lib/ai/resumeText";
import { resolveInterviewSettings } from "../../../../lib/interview/assessmentSettings";

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

  // Already started — return existing state.
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

  // Pull resume text so ResumeAnalysisNode has signal.
  const candidate = await Candidate.findById(session.candidateId)
    .select("resumeData resumeFilename resumeContentType")
    .lean();
  const resumeText = extractResumeText(
    candidate?.resumeData ? Buffer.from(candidate.resumeData) : null,
    {
      filename: candidate?.resumeFilename,
      contentType: candidate?.resumeContentType,
    }
  );

  // Pull the AI-interview slice of the AssessmentConfig — drives the planner's
  // topic mix, question count, difficulty baseline, and adaptive toggles. If
  // HR hasn't configured the job yet, omit and the planner falls back to its
  // resume-driven heuristic plan.
  const assessmentConfig = await AssessmentConfig.findOne({ jobId: session.jobId })
    .select("interview")
    .lean();
  const interviewSettings = resolveInterviewSettings(assessmentConfig?.interview);

  const result = await runStartInterview({
    candidateId: session.candidateId.toString(),
    jobId: session.jobId.toString(),
    interviewSessionId: sessionId,
    jobTitle: session.jobTitle,
    jobDescription: session.jobDescription,
    jobRequirements: session.jobRequirements,
    candidateName: session.candidateName,
    resumeText,
    interviewSettings,
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  // Persist: questions stored as plain text for legacy UI; questionPlan keeps
  // the structured form. Resume intelligence + skill match cached on the
  // session so we don't re-run those nodes on every candidate turn.
  await InterviewSession.findByIdAndUpdate(sessionId, {
    status: "in_progress",
    startedAt: new Date(),
    questions: result.questions.map((q) => q.prompt),
    questionPlan: result.questions,
    conversationHistory: result.conversationHistory.map((m) => ({
      ...m,
      timestamp: new Date(),
    })),
    answers: [],
    evaluations: [],
    currentQuestionIndex: 0,
    currentDifficulty: result.currentDifficulty,
    resumeIntelligence: result.resumeIntelligence ?? undefined,
    skillMatch: result.skillMatch ?? undefined,
    strongSkills: result.strongSkills,
    weakSkills: result.weakSkills,
  });

  await Candidate.findByIdAndUpdate(session.candidateId, { status: "interviewing" });

  return Response.json({
    firstMessage: result.firstMessage,
    totalQuestions: result.questions.length,
    currentQuestionIndex: 0,
  });
}

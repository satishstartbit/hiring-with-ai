import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import Candidate from "../../../../lib/db/models/Candidate";
import AIReport from "../../../../lib/db/models/AIReport";
import { runGradeInterview } from "../../../../lib/workflow/interviewGraph";
import { sendInterviewResultEmail } from "../../../../lib/email";
import { isInterviewPassed } from "../../../../lib/interviewConfig";
import type {
  PlannedQuestion,
  QuestionType,
  Difficulty,
} from "../../../../lib/workflow/interviewState";

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
  if (session.status === "completed" && session.totalScore !== undefined) {
    return Response.json({
      totalScore: session.totalScore,
      questionScores: session.questionScores,
      questionFeedback: session.questionFeedback,
      overallFeedback: session.overallFeedback,
    });
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

  const result = await runGradeInterview({
    jobTitle: session.jobTitle,
    jobRequirements: session.jobRequirements,
    questions,
    answers: session.answers,
    evaluations: session.evaluations ?? [],
    strongSkills: session.strongSkills ?? [],
    weakSkills: session.weakSkills ?? [],
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  await InterviewSession.findByIdAndUpdate(sessionId, {
    status: "completed",
    completedAt: new Date(),
    totalScore: result.overallScore,
    dimensionScores: result.dimensionScores,
    questionScores: result.questionScores,
    questionFeedback: result.questionFeedback,
    overallFeedback: result.overallFeedback,
  });

  // Mirror the report onto AIReport so the recruiter candidate-detail page
  // surfaces the full hiring intelligence (strengths/weaknesses/breakdown).
  if (result.finalReport) {
    const report = result.finalReport;
    const candidate = await Candidate.findById(session.candidateId)
      .select("jobId")
      .lean();

    if (candidate) {
      const job = await mongoose
        .model("Job")
        .findById(candidate.jobId)
        .select("workspaceId")
        .lean<{ workspaceId: mongoose.Types.ObjectId }>();

      await AIReport.updateOne(
        { candidateId: session.candidateId, jobId: candidate.jobId },
        {
          $set: {
            assessmentId: session._id,
            candidateId: session.candidateId,
            jobId: candidate.jobId,
            workspaceId: job?.workspaceId,
            technicalScore: report.scores.technical,
            problemSolvingScore: report.scores.problemSolving,
            communicationScore: report.scores.communication,
            codingScore: report.scores.technical,
            confidenceScore: report.scores.confidence,
            overallScore: report.overallScore,
            recommendation: report.recommendation,
            recommendationReason: report.recommendationReason,
            strengths: report.strengths,
            weaknesses: report.weaknesses,
            skillBreakdown: report.skillBreakdown,
            summary: report.summary,
            passed: report.passed,
            failureReasons: report.failureReasons,
          },
        },
        { upsert: true }
      ).catch((err) =>
        console.error("[interview] AIReport upsert failed:", err)
      );
    }
  }

  await Candidate.findByIdAndUpdate(session.candidateId, {
    status: isInterviewPassed(result.overallScore) ? "offer" : "reviewing",
    stage: "completed",
  });

  await sendInterviewResultEmail({
    to: session.candidateEmail,
    candidateName: session.candidateName,
    jobTitle: session.jobTitle,
    totalScore: result.overallScore,
    overallFeedback: result.overallFeedback,
    questionScores: result.questionScores,
    questionFeedback: result.questionFeedback,
    questions: session.questions,
  }).catch((err) => console.error("[email] interview result send failed:", err));

  return Response.json({
    totalScore: result.overallScore,
    questionScores: result.questionScores,
    questionFeedback: result.questionFeedback,
    overallFeedback: result.overallFeedback,
    dimensionScores: result.dimensionScores,
    finalReport: result.finalReport,
  });
}

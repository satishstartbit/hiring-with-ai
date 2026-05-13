import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { readSession } from "../../../../../lib/auth/session";
import { connectDB } from "../../../../../lib/db/connection";
import Candidate, {
  type ICandidate,
  type IPersistedQuizQuestion,
} from "../../../../../lib/db/models/Candidate";
import type { HydratedDocument } from "mongoose";
import Job from "../../../../../lib/db/models/Job";
import AssessmentConfig from "../../../../../lib/db/models/AssessmentConfig";
import { runQuestionsWorkflow } from "../../../../../lib/workflow/screeningGraph";
import { runGradingWorkflow } from "../../../../../lib/workflow/gradingGraph";

export const dynamic = "force-dynamic";

/** Question shape sent to the candidate — never includes correctIndex. */
interface PublicQuizQuestion {
  type: "mcq" | "descriptive";
  text: string;
  options?: string[];
}

function toPublic(q: IPersistedQuizQuestion): PublicQuizQuestion {
  if (q.type === "mcq") {
    return { type: "mcq", text: q.text, options: q.options ?? [] };
  }
  return { type: "descriptive", text: q.text };
}

type CandidateDoc = HydratedDocument<ICandidate>;

type GateResult =
  | { error: string; status: number }
  | { candidate: CandidateDoc; userId: string };

async function requireCandidateOwner(appId: string): Promise<GateResult> {
  if (!mongoose.isValidObjectId(appId)) {
    return { error: "Invalid application ID", status: 400 };
  }
  const session = await readSession();
  if (!session?.userId) return { error: "Sign in to continue", status: 401 };
  if (session.role !== "candidate") {
    return { error: "Only candidate accounts can take quizzes", status: 403 };
  }
  await connectDB();
  const candidate = await Candidate.findOne({ _id: appId, userId: session.userId });
  if (!candidate) return { error: "Application not found", status: 404 };
  return { candidate, userId: session.userId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gate = await requireCandidateOwner(id);
  if ("error" in gate) return Response.json({ error: gate.error }, { status: gate.status });
  const { candidate } = gate;

  if (candidate.stage === "rejected") {
    return Response.json({ error: "This application is closed." }, { status: 400 });
  }
  if (candidate.stage === "quiz_completed" || candidate.stage === "interview_in_progress" || candidate.stage === "completed") {
    return Response.json({ error: "Quiz already submitted." }, { status: 400 });
  }

  // Return the persisted quiz if we have one — same questions, every time.
  if (candidate.quizQuestions && candidate.quizQuestions.length > 0) {
    return Response.json({
      stage: candidate.stage,
      questions: candidate.quizQuestions.map(toPublic),
      timeLimitSeconds: candidate.quizTimeLimitSeconds ?? 20 * 60,
    });
  }

  // First time the candidate opens the quiz — generate and persist.
  const job = await Job.findById(candidate.jobId).lean();
  if (!job) return Response.json({ error: "Job no longer available" }, { status: 404 });

  const config = await AssessmentConfig.findOne({ jobId: candidate.jobId }).lean();
  const useConfig = config && config.isPublished;
  const result = await runQuestionsWorkflow({
    jobTitle: job.title,
    jobDescription: job.description,
    jobRequirements: job.requirements ?? [],
    jobDepartment: job.department,
    ...(useConfig
      ? {
          difficulty: config.difficulty,
          skills: config.skills,
          enabledQuestionTypes: config.enabledQuestionTypes,
          questionCount: config.questionCount,
          questionCountMode: config.questionCountMode,
          durationMinutes: config.durationMinutes,
        }
      : {}),
  });
  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const persisted: IPersistedQuizQuestion[] = result.questions.map((q) =>
    q.type === "mcq"
      ? {
          type: "mcq",
          text: q.text,
          options: [...q.options],
          correctIndex: q.correctIndex,
        }
      : { type: "descriptive", text: q.text }
  );

  candidate.quizQuestions = persisted;
  candidate.quizTimeLimitSeconds = result.timeLimitSeconds;
  candidate.quizStartedAt = candidate.quizStartedAt ?? new Date();
  candidate.stage = "quiz_in_progress";
  await candidate.save();

  return Response.json({
    stage: candidate.stage,
    questions: persisted.map(toPublic),
    timeLimitSeconds: result.timeLimitSeconds,
  });
}

interface SubmitBody {
  answers?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gate = await requireCandidateOwner(id);
  if ("error" in gate) return Response.json({ error: gate.error }, { status: gate.status });
  const { candidate } = gate;

  if (candidate.stage !== "quiz_in_progress" && candidate.stage !== "screening") {
    return Response.json({ error: "Quiz is not available for this stage." }, { status: 400 });
  }
  if (!candidate.quizQuestions || candidate.quizQuestions.length === 0) {
    return Response.json({ error: "Open the quiz first" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as SubmitBody;
  if (!Array.isArray(body.answers)) {
    return Response.json({ error: "Answers must be an array" }, { status: 400 });
  }
  const rawAnswers = body.answers as unknown[];
  const answers = candidate.quizQuestions.map((_, i) =>
    typeof rawAnswers[i] === "string" ? (rawAnswers[i] as string) : ""
  );
  if (answers.some((a) => !a.trim())) {
    return Response.json({ error: "Please answer every question" }, { status: 400 });
  }

  const job = await Job.findById(candidate.jobId).lean();
  if (!job) return Response.json({ error: "Job no longer available" }, { status: 404 });

  // ── Grade ────────────────────────────────────────────────────────────────
  // MCQ: auto-grade against persisted correctIndex
  // Descriptive: LLM-grade
  const mcqScores: number[] = [];
  const mcqFeedback: string[] = [];
  const descIndices: number[] = [];
  const descQuestions: string[] = [];
  const descAnswers: string[] = [];

  candidate.quizQuestions.forEach((q, i) => {
    if (q.type === "mcq") {
      const selected = Number.parseInt(answers[i] ?? "-1", 10);
      const correct = q.correctIndex ?? -1;
      const score = selected === correct ? 10 : 0;
      mcqScores.push(score);
      mcqFeedback.push(
        score === 10 ? "Correct" : `Wrong — correct answer: ${String.fromCharCode(65 + correct)}`
      );
    } else {
      descIndices.push(i);
      descQuestions.push(q.text);
      descAnswers.push(answers[i] ?? "");
    }
  });

  let descScores: number[] = [];
  let descFeedbackArr: string[] = [];
  let overallFeedback = "";
  if (descQuestions.length > 0) {
    const graded = await runGradingWorkflow({
      jobTitle: job.title,
      jobDescription: job.description,
      jobRequirements: job.requirements ?? [],
      questions: descQuestions,
      answers: descAnswers,
    });
    if (!graded.error) {
      descScores = graded.questionScores;
      descFeedbackArr = graded.questionFeedback;
      overallFeedback = graded.overallFeedback;
    }
  }

  let mcqIdx = 0;
  let descIdx = 0;
  const questionScores: number[] = candidate.quizQuestions.map((q) =>
    q.type === "mcq" ? mcqScores[mcqIdx++] ?? 0 : descScores[descIdx++] ?? 0
  );
  let mcqFbIdx = 0;
  const questionFeedback: string[] = candidate.quizQuestions.map((q, i) =>
    q.type === "mcq"
      ? mcqFeedback[mcqFbIdx++] ?? ""
      : descFeedbackArr[descIndices.indexOf(i)] ?? ""
  );
  const totalScore = Math.round(
    (questionScores.reduce((a, b) => a + b, 0) / (candidate.quizQuestions.length * 10)) * 100
  );

  candidate.screeningQuestions = candidate.quizQuestions.map((q) => q.text);
  candidate.screeningAnswers = answers;
  candidate.answerScore = totalScore;
  candidate.questionScores = questionScores;
  candidate.questionFeedback = questionFeedback;
  candidate.overallFeedback = overallFeedback;
  candidate.quizSubmittedAt = new Date();
  candidate.stage = "quiz_completed";
  await candidate.save();

  return Response.json({
    totalScore,
    questionScores,
    questionFeedback,
    overallFeedback,
    stage: candidate.stage,
  });
}

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
import type {
  DifficultyLevel,
  QuestionType,
  QuestionCountMode,
} from "../../../../../lib/constants/assessment";
import { runQuestionsWorkflow } from "../../../../../lib/workflow/screeningGraph";
import { runGradingWorkflow } from "../../../../../lib/workflow/gradingGraph";
import { gradeCodingAnswers } from "../../../../../lib/workflow/gradeCoding";

export const dynamic = "force-dynamic";
// Quiz generation runs an LLM workflow — give it headroom past the platform default.
export const maxDuration = 90;

/** Question shape sent to the candidate — never includes answer keys. */
interface PublicQuizQuestion {
  type: "mcq" | "multi_select" | "descriptive" | "coding";
  text: string;
  options?: string[];
  language?: string;
  starterCode?: string;
}

interface ClientAntiCheat {
  tabSwitchDetection: boolean;
  fullscreenRequired: boolean;
  blockCopyPaste: boolean;
  maxViolations: number;
}

interface QuizConfigForClient {
  passingPercent: number;
  enabledTypes: string[];
  difficulty: string;
  skills: string[];
  durationMinutes: number;
  questionCount: number;
  codingLanguages: string[];
  antiCheat: ClientAntiCheat;
}

const DEFAULT_CLIENT_CONFIG: QuizConfigForClient = {
  passingPercent: 0,
  enabledTypes: ["mcq", "short_answer"],
  difficulty: "medium",
  skills: [],
  durationMinutes: 20,
  questionCount: 10,
  codingLanguages: [],
  antiCheat: {
    tabSwitchDetection: true,
    fullscreenRequired: false,
    blockCopyPaste: true,
    maxViolations: 1,
  },
};

function toPublic(q: IPersistedQuizQuestion): PublicQuizQuestion {
  if (q.type === "mcq") {
    return { type: "mcq", text: q.text, options: q.options ?? [] };
  }
  if (q.type === "multi_select") {
    return { type: "multi_select", text: q.text, options: q.options ?? [] };
  }
  if (q.type === "coding") {
    return {
      type: "coding",
      text: q.text,
      language: q.language ?? "javascript",
      starterCode: q.starterCode ?? "",
    };
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

interface RawConfig {
  difficulty?: DifficultyLevel;
  enabledQuestionTypes?: QuestionType[];
  skills?: string[];
  durationMinutes?: number;
  questionCount?: number;
  questionCountMode?: QuestionCountMode;
  passingCriteria?: { overallPercent?: number };
  coding?: { languages?: string[] };
  antiCheat?: {
    tabSwitchDetection?: boolean;
    fullscreenRequired?: boolean;
    blockCopyPaste?: boolean;
    maxViolations?: number;
  };
}

/** Build the slice of AssessmentConfig the candidate UI needs. */
function configForClient(config: RawConfig | null): QuizConfigForClient {
  if (!config) return DEFAULT_CLIENT_CONFIG;
  return {
    passingPercent: config.passingCriteria?.overallPercent ?? 0,
    enabledTypes: config.enabledQuestionTypes ?? DEFAULT_CLIENT_CONFIG.enabledTypes,
    difficulty: config.difficulty ?? DEFAULT_CLIENT_CONFIG.difficulty,
    skills: config.skills ?? [],
    durationMinutes: config.durationMinutes ?? DEFAULT_CLIENT_CONFIG.durationMinutes,
    questionCount: config.questionCount ?? DEFAULT_CLIENT_CONFIG.questionCount,
    codingLanguages: config.coding?.languages ?? [],
    antiCheat: {
      tabSwitchDetection: config.antiCheat?.tabSwitchDetection ?? true,
      fullscreenRequired: config.antiCheat?.fullscreenRequired ?? false,
      blockCopyPaste: config.antiCheat?.blockCopyPaste ?? true,
      // maxViolations from config is "violations until termination". Treat
      // each violation before the last as a warning. Default 1 = no warning,
      // first violation closes immediately. Most teams configure 2+.
      maxViolations: Math.max(1, config.antiCheat?.maxViolations ?? 1),
    },
  };
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
  if (
    candidate.stage === "quiz_completed" ||
    candidate.stage === "interview_in_progress" ||
    candidate.stage === "completed"
  ) {
    return Response.json({ error: "Quiz already submitted." }, { status: 400 });
  }

  const rawConfig = await AssessmentConfig.findOne({ jobId: candidate.jobId }).lean();
  const useConfig = rawConfig && rawConfig.isPublished;
  const clientConfig = configForClient(useConfig ? (rawConfig as RawConfig) : null);

  // Return the persisted quiz if we have one — same questions, every time.
  if (candidate.quizQuestions && candidate.quizQuestions.length > 0) {
    return Response.json({
      stage: candidate.stage,
      questions: candidate.quizQuestions.map(toPublic),
      timeLimitSeconds: candidate.quizTimeLimitSeconds ?? 20 * 60,
      config: clientConfig,
    });
  }

  // First time the candidate opens the quiz — generate and persist.
  const job = await Job.findById(candidate.jobId).lean();
  if (!job) return Response.json({ error: "Job no longer available" }, { status: 404 });

  try {
    return await generateAndPersist(candidate, job, rawConfig, useConfig, clientConfig);
  } catch (err) {
    // The workflow has its own fallbacks, so reaching here means something
    // unexpected threw (DB save, malformed state, etc.). Surface a clean error
    // instead of a bare 500 so the candidate sees a retry-able message.
    console.error("[quiz GET] generation failed:", err);
    return Response.json(
      {
        error: "We couldn't generate your quiz. Please refresh to try again.",
        // Surface the real cause in dev only — never leak internals in prod.
        ...(process.env.NODE_ENV !== "production"
          ? { detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
          : {}),
      },
      { status: 502 }
    );
  }
}

interface JobLean {
  title: string;
  description: string;
  requirements?: string[];
  department: string;
}

async function generateAndPersist(
  candidate: CandidateDoc,
  job: JobLean,
  rawConfig: RawConfig | null,
  useConfig: boolean | null | "" | undefined,
  clientConfig: QuizConfigForClient
): Promise<Response> {
  const result = await runQuestionsWorkflow({
    jobTitle: job.title,
    jobDescription: job.description,
    jobRequirements: job.requirements ?? [],
    jobDepartment: job.department,
    ...(useConfig && rawConfig
      ? {
          difficulty: rawConfig.difficulty,
          skills: rawConfig.skills,
          enabledQuestionTypes: rawConfig.enabledQuestionTypes,
          questionCount: rawConfig.questionCount,
          questionCountMode: rawConfig.questionCountMode,
          durationMinutes: rawConfig.durationMinutes,
          codingLanguages: rawConfig.coding?.languages ?? [],
        }
      : {}),
  });
  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const persisted: IPersistedQuizQuestion[] = result.questions.map((q) => {
    if (q.type === "mcq") {
      return {
        type: "mcq",
        text: q.text,
        options: [...q.options],
        correctIndex: q.correctIndex,
      };
    }
    if (q.type === "multi_select") {
      return {
        type: "multi_select",
        text: q.text,
        options: [...q.options],
        correctIndices: [...q.correctIndices],
      };
    }
    if (q.type === "coding") {
      return {
        type: "coding",
        text: q.text,
        language: q.language,
        starterCode: q.starterCode,
        referenceSolution: q.referenceSolution,
      };
    }
    return { type: "descriptive", text: q.text };
  });

  candidate.quizQuestions = persisted;
  candidate.quizTimeLimitSeconds = result.timeLimitSeconds;
  candidate.quizStartedAt = candidate.quizStartedAt ?? new Date();
  candidate.stage = "quiz_in_progress";
  try {
    await candidate.save();
  } catch (err) {
    // A ValidationError here almost always means the running Mongoose model
    // was compiled before the schema gained multi_select/coding — restart the
    // dev server. Log distinctly so it's obvious vs. an LLM failure.
    console.error("[quiz GET] candidate.save() failed — restart dev server if schema changed:", err);
    throw err;
  }

  return Response.json({
    stage: candidate.stage,
    questions: persisted.map(toPublic),
    timeLimitSeconds: result.timeLimitSeconds,
    config: clientConfig,
  });
}

interface SubmitBody {
  answers?: unknown;
}

function arraysEqualAsSets(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const v of b) if (!set.has(v)) return false;
  return true;
}

function parseMultiSelectAnswer(raw: string): number[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: number[] = [];
    for (const v of arr) {
      const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
      if (Number.isFinite(n) && n >= 0 && n <= 3) out.push(n);
    }
    return Array.from(new Set(out)).sort((x, y) => x - y);
  } catch {
    return [];
  }
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

  // ── Grade per-type ──────────────────────────────────────────────────────
  const questionScores: number[] = new Array(candidate.quizQuestions.length).fill(0);
  const questionFeedback: string[] = new Array(candidate.quizQuestions.length).fill("");

  // Descriptive answers go through the existing LLM grading workflow.
  const descIndices: number[] = [];
  const descQuestions: string[] = [];
  const descAnswers: string[] = [];

  // Coding answers go through the dedicated coding grader.
  const codingIndices: number[] = [];
  const codingItems: {
    question: string;
    language: string;
    starterCode: string;
    referenceSolution: string;
    candidateCode: string;
  }[] = [];

  candidate.quizQuestions.forEach((q, i) => {
    if (q.type === "mcq") {
      const selected = Number.parseInt(answers[i] ?? "-1", 10);
      const correct = q.correctIndex ?? -1;
      const ok = selected === correct;
      questionScores[i] = ok ? 10 : 0;
      questionFeedback[i] = ok
        ? "Correct"
        : `Wrong — correct answer: ${String.fromCharCode(65 + correct)}`;
    } else if (q.type === "multi_select") {
      const selected = parseMultiSelectAnswer(answers[i]);
      const correct = q.correctIndices ?? [];
      const ok = arraysEqualAsSets(selected, correct);
      questionScores[i] = ok ? 10 : 0;
      const labels = correct
        .map((idx) => String.fromCharCode(65 + idx))
        .join(", ");
      questionFeedback[i] = ok
        ? "Correct — you selected exactly the right set."
        : `Wrong — correct answers: ${labels}`;
    } else if (q.type === "coding") {
      codingIndices.push(i);
      codingItems.push({
        question: q.text,
        language: q.language ?? "javascript",
        starterCode: q.starterCode ?? "",
        referenceSolution: q.referenceSolution ?? "",
        candidateCode: answers[i] ?? "",
      });
    } else {
      descIndices.push(i);
      descQuestions.push(q.text);
      descAnswers.push(answers[i] ?? "");
    }
  });

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
      descIndices.forEach((qi, di) => {
        questionScores[qi] = graded.questionScores[di] ?? 0;
        questionFeedback[qi] = graded.questionFeedback[di] ?? "";
      });
      overallFeedback = graded.overallFeedback;
    }
  }

  if (codingItems.length > 0) {
    const codingGrades = await gradeCodingAnswers(codingItems);
    codingIndices.forEach((qi, ci) => {
      questionScores[qi] = codingGrades[ci]?.score ?? 0;
      questionFeedback[qi] = codingGrades[ci]?.feedback ?? "";
    });
  }

  const totalScore = Math.round(
    (questionScores.reduce((a, b) => a + b, 0) / (candidate.quizQuestions.length * 10)) * 100
  );

  // ── Apply passing criteria ──────────────────────────────────────────────
  const cfg = await AssessmentConfig.findOne({ jobId: candidate.jobId }).lean();
  const passingPercent = cfg?.isPublished ? cfg.passingCriteria?.overallPercent ?? 0 : 0;
  const passed = totalScore >= passingPercent;

  candidate.screeningQuestions = candidate.quizQuestions.map((q) => q.text);
  candidate.screeningAnswers = answers;
  candidate.answerScore = totalScore;
  candidate.questionScores = questionScores;
  candidate.questionFeedback = questionFeedback;
  if (!overallFeedback) {
    overallFeedback = passed
      ? `Scored ${totalScore}/100. You're through to the AI interview.`
      : `Scored ${totalScore}/100. Below the ${passingPercent}/100 passing mark for this role.`;
  }
  candidate.overallFeedback = overallFeedback;
  candidate.quizSubmittedAt = new Date();
  candidate.stage = passed ? "quiz_completed" : "rejected";
  if (!passed) {
    candidate.status = "rejected";
  }
  await candidate.save();

  return Response.json({
    totalScore,
    questionScores,
    questionFeedback,
    overallFeedback,
    stage: candidate.stage,
    passed,
    passingPercent,
  });
}

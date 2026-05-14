import Link from "next/link";
import { notFound } from "next/navigation";
import mongoose from "mongoose";
import { requireCandidate } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Candidate, { type CandidateStage } from "@/app/lib/db/models/Candidate";
import InterviewSession from "@/app/lib/db/models/InterviewSession";
import AssessmentConfig from "@/app/lib/db/models/AssessmentConfig";
import type { QuestionType } from "@/app/lib/constants/assessment";

export const dynamic = "force-dynamic";

interface StageView {
  badgeLabel: string;
  badgeTone: string;
  heading: string;
  body: string;
  primary: { label: string; href: string } | null;
}

function describeStage(stage: CandidateStage, appId: string): StageView {
  switch (stage) {
    case "screening":
      return {
        badgeLabel: "Resume submitted",
        badgeTone: "bg-slate-100 text-slate-700",
        heading: "We’ve received your resume",
        body: "Your AI fit check passed. Take the screening quiz when you’re ready — now or later, your spot is saved.",
        primary: { label: "Start the quiz", href: `/candidate/applications/${appId}/quiz` },
      };
    case "quiz_in_progress":
      return {
        badgeLabel: "Quiz in progress",
        badgeTone: "bg-amber-100 text-amber-700",
        heading: "You haven’t finished the quiz yet",
        body: "We saved the same set of questions for you. Resume whenever you’re ready — the timer restarts when you reopen the quiz.",
        primary: { label: "Resume quiz", href: `/candidate/applications/${appId}/quiz` },
      };
    case "quiz_completed":
      return {
        badgeLabel: "Quiz complete",
        badgeTone: "bg-indigo-100 text-indigo-700",
        heading: "Ready for the AI interview",
        body: "Your screening is done. The AI interview usually takes about 10 minutes. Start it whenever it suits you.",
        primary: {
          label: "Start the AI interview",
          href: `/candidate/applications/${appId}/interview`,
        },
      };
    case "interview_in_progress":
      return {
        badgeLabel: "Interview in progress",
        badgeTone: "bg-indigo-100 text-indigo-700",
        heading: "Pick up your interview",
        body: "Your AI interview session is open. Rejoin to finish it.",
        primary: {
          label: "Rejoin the interview",
          href: `/candidate/applications/${appId}/interview`,
        },
      };
    case "completed":
      return {
        badgeLabel: "Completed",
        badgeTone: "bg-emerald-100 text-emerald-700",
        heading: "All steps complete",
        body: "Thanks for applying. The hiring team will review your interview and reach out with next steps.",
        primary: null,
      };
    case "rejected":
      return {
        badgeLabel: "Not a match",
        badgeTone: "bg-rose-100 text-rose-700",
        heading: "Your resume didn’t match this role",
        body: "Our AI fit check didn’t find a strong match for this position. Try another role that fits your background.",
        primary: { label: "Browse other jobs", href: "/jobs" },
      };
  }
}

const STAGE_ORDER: CandidateStage[] = [
  "screening",
  "quiz_in_progress",
  "quiz_completed",
  "interview_in_progress",
  "completed",
];
function isStageAfter(current: CandidateStage, target: CandidateStage): boolean {
  if (current === "rejected") return false;
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(target);
}

export default async function CandidateApplicationPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) notFound();

  const session = await requireCandidate();
  await connectDB();
  const app = await Candidate.findOne({ _id: id, userId: session.userId })
    .select(
      "_id jobId jobTitle stage createdAt updatedAt resumeMatchScore resumeMatchReason resumeFilename answerScore questionScores questionFeedback overallFeedback screeningQuestions interviewSessionId quizSubmittedAt"
    )
    .lean();
  if (!app) notFound();

  const interview = app.interviewSessionId
    ? await InterviewSession.findById(app.interviewSessionId)
        .select(
          "_id status startedAt completedAt totalScore questionScores questionFeedback overallFeedback questions"
        )
        .lean()
    : null;

  const assessmentConfig = await AssessmentConfig.findOne({ jobId: app.jobId })
    .select("difficulty enabledQuestionTypes durationMinutes questionCount passingCriteria isPublished")
    .lean();

  const view = describeStage(app.stage as CandidateStage, id);
  const stage = app.stage as CandidateStage;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/candidate" className="hover:text-slate-800">
          ← All applications
        </Link>
      </nav>

      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${view.badgeTone}`}
        >
          {view.badgeLabel}
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          {app.jobTitle}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Applied {new Date(app.createdAt).toLocaleDateString()} · Last activity{" "}
          {new Date(app.updatedAt).toLocaleString()}
        </p>
        <StageTimeline stage={stage} />
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{view.heading}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{view.body}</p>
        {view.primary && (
          <div className="mt-5">
            <Link
              href={view.primary.href}
              className="inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {view.primary.label}
            </Link>
          </div>
        )}
      </section>

      {/* ── Resume fit ─────────────────────────────────────────────────── */}
      {app.resumeMatchScore != null && (
        <ScoreSection
          title="Resume fit"
          subtitle="How well your resume matched this role"
          score={app.resumeMatchScore}
          feedback={app.resumeMatchReason}
          meta={app.resumeFilename ? `Submitted: ${app.resumeFilename}` : undefined}
        />
      )}

      {/* ── Screening quiz ─────────────────────────────────────────────── */}
      {isStageAfter(stage, "quiz_completed") && app.answerScore != null && (
        <ScoreSection
          title="Screening quiz"
          subtitle="MCQ answers are auto-graded; written answers are reviewed by AI."
          score={app.answerScore}
          feedback={app.overallFeedback}
          meta={
            app.quizSubmittedAt
              ? `Submitted ${new Date(app.quizSubmittedAt).toLocaleString()}`
              : undefined
          }
        >
          {Array.isArray(app.screeningQuestions) && app.screeningQuestions.length > 0 && (
            <PerQuestionList
              questions={app.screeningQuestions}
              scores={app.questionScores ?? []}
              feedback={app.questionFeedback ?? []}
            />
          )}
        </ScoreSection>
      )}

      {/* ── AI interview ───────────────────────────────────────────────── */}
      {interview && (
        <ScoreSection
          title="AI interview"
          subtitle={
            interview.status === "completed"
              ? "Your full conversation was reviewed by AI."
              : "Interview is in progress."
          }
          score={interview.totalScore ?? null}
          feedback={interview.overallFeedback}
          meta={interviewMeta(interview)}
        >
          {interview.status === "completed" &&
            Array.isArray(interview.questions) &&
            interview.questions.length > 0 && (
              <PerQuestionList
                questions={interview.questions}
                scores={interview.questionScores ?? []}
                feedback={interview.questionFeedback ?? []}
              />
            )}
        </ScoreSection>
      )}

      <ScoringInfo
        config={
          assessmentConfig && assessmentConfig.isPublished
            ? {
                enabledTypes: assessmentConfig.enabledQuestionTypes ?? [],
                durationMinutes: assessmentConfig.durationMinutes ?? 20,
                questionCount: assessmentConfig.questionCount ?? 10,
                passingPercent: assessmentConfig.passingCriteria?.overallPercent ?? 60,
              }
            : null
        }
      />
    </div>
  );
}

function interviewMeta(interview: {
  startedAt?: Date | null;
  completedAt?: Date | null;
  status: string;
}): string | undefined {
  const parts: string[] = [`Status: ${interview.status.replace(/_/g, " ")}`];
  if (interview.startedAt)
    parts.push(`Started ${new Date(interview.startedAt).toLocaleString()}`);
  if (interview.completedAt)
    parts.push(`Finished ${new Date(interview.completedAt).toLocaleString()}`);
  return parts.join(" · ");
}

function StageTimeline({ stage }: Readonly<{ stage: CandidateStage }>) {
  if (stage === "rejected") return null;
  const steps: { key: CandidateStage; label: string }[] = [
    { key: "screening", label: "Resume" },
    { key: "quiz_completed", label: "Quiz" },
    { key: "completed", label: "Interview" },
  ];
  return (
    <ol className="mt-4 flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = isStageAfter(stage, s.key);
        const current =
          (s.key === "screening" && (stage === "screening" || stage === "quiz_in_progress")) ||
          (s.key === "quiz_completed" &&
            (stage === "quiz_completed" || stage === "interview_in_progress")) ||
          (s.key === "completed" && stage === "completed");
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                done
                  ? "bg-emerald-600 text-white"
                  : current
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={`font-medium ${done || current ? "text-slate-800" : "text-slate-400"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={`mx-1 h-px w-6 ${
                  done ? "bg-emerald-400" : "bg-slate-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ScoreSection({
  title,
  subtitle,
  score,
  feedback,
  meta,
  children,
}: Readonly<{
  title: string;
  subtitle?: string;
  score: number | null;
  feedback?: string | null;
  meta?: string;
  children?: React.ReactNode;
}>) {
  const tone =
    score == null ? "text-slate-400" : score >= 75 ? "text-emerald-700" : score >= 50 ? "text-amber-700" : "text-rose-700";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <p className={`text-3xl font-bold ${tone}`}>
          {score == null ? "—" : <>
            {score}<span className="text-base text-slate-400">/100</span>
          </>}
        </p>
      </div>
      {meta && <p className="mt-3 text-xs text-slate-500">{meta}</p>}
      {feedback && <p className="mt-3 text-sm leading-6 text-slate-700">{feedback}</p>}
      {children}
    </section>
  );
}

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "single-correct MCQs",
  multi_select: "multi-select questions",
  coding: "coding problems",
  short_answer: "short written answers",
  scenario: "scenario questions",
  debugging: "debugging exercises",
  sql: "SQL queries",
  video: "video responses",
  voice: "voice responses",
};

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function ScoringInfo({
  config,
}: Readonly<{
  config: {
    enabledTypes: string[];
    durationMinutes: number;
    questionCount: number;
    passingPercent: number;
  } | null;
}>) {
  const types = config?.enabledTypes ?? [];
  const typeLabels = types
    .map((t) => TYPE_LABEL[t as QuestionType] ?? t)
    .filter((s, i, arr) => arr.indexOf(s) === i);
  const hasMcq = types.includes("mcq");
  const hasMulti = types.includes("multi_select");
  const hasCoding = types.includes("coding");
  const hasFree =
    types.includes("short_answer") ||
    types.includes("scenario") ||
    types.includes("debugging") ||
    types.includes("sql");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        How scoring works
      </h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        <li>
          <span className="font-medium text-slate-800">Resume fit (0–100):</span> AI compares your
          resume against the role’s requirements. 60 or higher means you proceed to the screening
          quiz.
        </li>
        {config ? (
          <li>
            <span className="font-medium text-slate-800">Screening quiz (0–100):</span> ~
            {config.questionCount} questions ({typeLabels.length > 0 ? joinList(typeLabels) : "mixed formats"})
            in {config.durationMinutes} minutes. Each question is worth up to 10 points.
            {hasMcq && " MCQs are graded automatically."}
            {hasMulti && " Multi-select awards full credit only when you pick exactly the right set."}
            {hasFree && " Written answers are reviewed by AI on relevance, depth, and accuracy."}
            {hasCoding && " Coding submissions are AI-graded on correctness and quality against a hidden reference solution."}
            {config.passingPercent > 0 && (
              <> You need at least <strong>{config.passingPercent}/100</strong> to move on to the AI interview.</>
            )}
          </li>
        ) : (
          <li>
            <span className="font-medium text-slate-800">Screening quiz (0–100):</span> AI-generated
            questions tailored to the role. Each question is worth up to 10 points.
          </li>
        )}
        <li>
          <span className="font-medium text-slate-800">AI interview (0–100):</span> The AI evaluates
          each spoken/typed answer against the role and produces a per-question score plus an
          overall summary you can read above once it’s done.
        </li>
      </ul>
    </section>
  );
}

function PerQuestionList({
  questions,
  scores,
  feedback,
}: Readonly<{
  questions: string[];
  scores: number[];
  feedback: string[];
}>) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline">
        Show per-question breakdown
      </summary>
      <ol className="mt-3 space-y-2">
        {questions.map((q, i) => {
          const score = scores[i];
          const tone =
            typeof score !== "number"
              ? "bg-slate-100 text-slate-700"
              : score >= 7
                ? "bg-emerald-100 text-emerald-700"
                : score >= 4
                  ? "bg-amber-100 text-amber-700"
                  : "bg-rose-100 text-rose-700";
          return (
            <li key={`${i}-${q.slice(0, 16)}`} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1 text-xs text-slate-700">
                  {i + 1}. {q}
                </p>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${tone}`}>
                  {typeof score === "number" ? `${score}/10` : "—"}
                </span>
              </div>
              {feedback[i] && (
                <p className="mt-1 text-xs leading-5 text-slate-500">{feedback[i]}</p>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

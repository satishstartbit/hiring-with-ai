import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import Candidate, { type CandidateStage } from "@/app/lib/db/models/Candidate";
import InterviewSession from "@/app/lib/db/models/InterviewSession";
import Assessment from "@/app/lib/db/models/Assessment";
import CandidateAnswer from "@/app/lib/db/models/CandidateAnswer";
import AIReport from "@/app/lib/db/models/AIReport";
import SuspiciousActivity from "@/app/lib/db/models/SuspiciousActivity";

export const metadata = { title: "Candidate — HireAI" };
export const dynamic = "force-dynamic";

const STAGE_META: Record<string, { label: string; className: string }> = {
  screening: { label: "Screening", className: "bg-slate-100 text-slate-700" },
  quiz_in_progress: { label: "Quiz in progress", className: "bg-amber-100 text-amber-700" },
  quiz_completed: { label: "Quiz passed", className: "bg-indigo-100 text-indigo-700" },
  interview_in_progress: { label: "Interviewing", className: "bg-violet-100 text-violet-700" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700" },
};

const PASSED_STAGES: CandidateStage[] = [
  "quiz_completed",
  "interview_in_progress",
  "completed",
];

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-rose-700";
}

function ScorePill({
  label,
  score,
}: Readonly<{ label: string; score?: number | null }>) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      {score == null ? (
        <p className="mt-1 text-lg font-semibold text-slate-400">—</p>
      ) : (
        <p className={`mt-1 text-2xl font-bold tabular-nums ${scoreColor(score)}`}>
          {score}
          <span className="ml-0.5 text-sm font-normal text-slate-400">/100</span>
        </p>
      )}
    </div>
  );
}

function formatDate(date?: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  const { id } = await params;
  await connectDB();

  const candidate = await Candidate.findById(id).lean();
  if (!candidate) notFound();

  // Workspace scoping: candidates aren't workspace-scoped directly — they hang
  // off jobs. Confirm the candidate's job belongs to this workspace.
  const job = await Job.findOne({
    _id: candidate.jobId,
    workspaceId: session.workspaceId,
  }).lean();
  if (!job) notFound();

  const [interview, assessment, aiReport] = await Promise.all([
    candidate.interviewSessionId
      ? InterviewSession.findById(candidate.interviewSessionId).lean()
      : null,
    Assessment.findOne({ candidateId: candidate._id, jobId: candidate.jobId }).lean(),
    AIReport.findOne({ candidateId: candidate._id, jobId: candidate.jobId }).lean(),
  ]);

  const [answers, violations] = await Promise.all([
    assessment
      ? CandidateAnswer.find({ assessmentId: assessment._id })
          .sort({ submittedAt: 1, createdAt: 1 })
          .lean()
      : [],
    assessment
      ? SuspiciousActivity.find({ assessmentId: assessment._id })
          .sort({ occurredAt: -1 })
          .limit(50)
          .lean()
      : [],
  ]);

  const stage = STAGE_META[candidate.stage] ?? {
    label: candidate.stage,
    className: "bg-slate-100 text-slate-600",
  };
  const isPassed = PASSED_STAGES.includes(candidate.stage);
  const role = candidate.currentTitle
    ? candidate.currentCompany
      ? `${candidate.currentTitle} · ${candidate.currentCompany}`
      : candidate.currentTitle
    : null;

  // Map AssessmentConfig questions to candidate answers by questionId.
  const answerByQuestionId = new Map(
    answers.map((a) => [a.questionId, a])
  );

  // Old-style screening: candidate doc holds questions/answers directly.
  const screeningQuestions = candidate.screeningQuestions ?? [];
  const screeningAnswers = candidate.screeningAnswers ?? [];
  const questionScores = candidate.questionScores ?? [];
  const questionFeedback = candidate.questionFeedback ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href="/dashboard/candidates" className="hover:text-indigo-600">
          Candidates
        </Link>{" "}
        / <span className="text-slate-700">{candidate.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {candidate.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${stage.className}`}
            >
              {stage.label}
            </span>
            {isPassed && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                ✓ Passed
              </span>
            )}
            {candidate.proctoringFlagged && (
              <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                ⚠ Proctoring flagged
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{candidate.email}</p>
          {role && <p className="text-sm text-slate-500">{role}</p>}
          <p className="mt-3 text-sm text-slate-500">
            Applied for{" "}
            <Link
              href={`/dashboard/jobs/${String(job._id)}`}
              className="font-medium text-indigo-700 hover:underline"
            >
              {candidate.jobTitle}
            </Link>{" "}
            · {job.department} · {job.location}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Applied {formatDate(candidate.appliedAt)}
            {candidate.quizSubmittedAt && (
              <> · Quiz submitted {formatDate(candidate.quizSubmittedAt)}</>
            )}
          </p>
        </div>
        <div className="flex flex-none flex-col gap-2">
          {candidate.resumeFilename && (
            <a
              href={`/api/resumes/${String(candidate._id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              📄 View resume
            </a>
          )}
          {candidate.skills && candidate.skills.length > 0 && (
            <div className="max-w-xs">
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                Skills
              </p>
              <div className="flex flex-wrap gap-1">
                {candidate.skills.slice(0, 8).map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Score summary */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ScorePill label="Resume match" score={candidate.resumeMatchScore} />
        <ScorePill label="Quiz score" score={candidate.answerScore} />
        <ScorePill label="Interview score" score={interview?.totalScore} />
        <ScorePill label="AI overall" score={aiReport?.overallScore} />
      </section>

      {/* Resume match reason */}
      {candidate.resumeMatchReason && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Resume match analysis</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">
            {candidate.resumeMatchReason}
          </p>
        </section>
      )}

      {/* Resume preview */}
      {candidate.resumeFilename && (
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Resume</h2>
              <p className="truncate text-xs text-slate-500">
                {candidate.resumeFilename}
                {candidate.resumeContentType && (
                  <> · {candidate.resumeContentType}</>
                )}
              </p>
            </div>
            <div className="flex flex-none gap-2">
              <a
                href={`/api/resumes/${String(candidate._id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Open in new tab ↗
              </a>
              <a
                href={`/api/resumes/${String(candidate._id)}`}
                download={candidate.resumeFilename}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Download
              </a>
            </div>
          </div>
          {candidate.resumeContentType === "application/pdf" ? (
            <iframe
              src={`/api/resumes/${String(candidate._id)}#toolbar=0&navpanes=0`}
              title={`Resume — ${candidate.name}`}
              className="block h-[760px] w-full bg-slate-50"
            />
          ) : (
            <div className="px-5 py-8 text-center">
              <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl text-slate-500">
                📄
              </div>
              <p className="text-sm font-medium text-slate-700">
                Inline preview isn&apos;t available for this file type
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Open it in a new tab or download to review the resume.
              </p>
            </div>
          )}
        </section>
      )}

      {/* AI Report */}
      {aiReport && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">AI evaluation report</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                aiReport.passed
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {aiReport.passed ? "Passed" : "Did not pass"} · {aiReport.recommendation.replace(/_/g, " ")}
            </span>
          </div>
          {aiReport.summary && (
            <p className="mb-4 whitespace-pre-line text-sm text-slate-700">{aiReport.summary}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DimensionScore label="Technical" value={aiReport.technicalScore} />
            <DimensionScore label="Problem solving" value={aiReport.problemSolvingScore} />
            <DimensionScore label="Communication" value={aiReport.communicationScore} />
            <DimensionScore label="Coding" value={aiReport.codingScore} />
            <DimensionScore label="Confidence" value={aiReport.confidenceScore} />
            <DimensionScore label="Overall" value={aiReport.overallScore} />
          </div>

          {(aiReport.strengths.length > 0 || aiReport.weaknesses.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {aiReport.strengths.length > 0 && (
                <BulletList
                  title="Strengths"
                  items={aiReport.strengths}
                  accent="text-emerald-700"
                />
              )}
              {aiReport.weaknesses.length > 0 && (
                <BulletList
                  title="Areas to improve"
                  items={aiReport.weaknesses}
                  accent="text-rose-700"
                />
              )}
            </div>
          )}

          {aiReport.skillBreakdown.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Skill breakdown</h3>
              <div className="space-y-1">
                {aiReport.skillBreakdown.map((s) => (
                  <div
                    key={s.skill}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-700">{s.skill}</span>
                    <span className={`font-semibold tabular-nums ${scoreColor(s.score)}`}>
                      {s.score}/100
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiReport.failureReasons.length > 0 && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <p className="mb-1 font-semibold">Failure reasons</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {aiReport.failureReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Quiz overall feedback */}
      {candidate.overallFeedback && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Quiz feedback</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">
            {candidate.overallFeedback}
          </p>
        </section>
      )}

      {/* Quiz questions & answers — old screening flow */}
      {screeningQuestions.length > 0 && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">
              Quiz responses
              <span className="ml-2 text-xs font-normal text-slate-500">
                {screeningQuestions.length} question
                {screeningQuestions.length === 1 ? "" : "s"}
              </span>
            </h2>
          </div>
          <ol className="divide-y divide-slate-100">
            {screeningQuestions.map((q, i) => {
              const score = questionScores[i];
              const feedback = questionFeedback[i];
              return (
                <li key={i} className="px-5 py-4">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">
                      Q{i + 1}. {q}
                    </p>
                    {typeof score === "number" && (
                      <span
                        className={`flex-none text-sm font-bold tabular-nums ${scoreColor(score)}`}
                      >
                        {score}/100
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-line text-sm text-slate-700">
                    {screeningAnswers[i] || (
                      <span className="text-slate-400">No answer</span>
                    )}
                  </p>
                  {feedback && (
                    <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">Feedback:</span> {feedback}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Assessment questions & answers — new Assessment flow */}
      {assessment && assessment.questions.length > 0 && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">
              Assessment responses
              <span className="ml-2 text-xs font-normal text-slate-500">
                {assessment.questions.length} questions · {assessment.status}
              </span>
            </h2>
          </div>
          <ol className="divide-y divide-slate-100">
            {assessment.questions.map((q, i) => {
              const ans = answerByQuestionId.get(q.questionId);
              const score = ans?.score;
              return (
                <li key={q.questionId} className="px-5 py-4">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        Q{i + 1}. {q.prompt}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {q.type} · {q.difficulty}
                        {q.skill && <> · {q.skill}</>}
                      </p>
                    </div>
                    {typeof score === "number" && (
                      <span
                        className={`flex-none text-sm font-bold tabular-nums ${scoreColor(score)}`}
                      >
                        {score}/{ans?.maxScore ?? 100}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    {renderAnswer(q.type, q.options ?? [], ans)}
                  </div>
                  {ans?.aiFeedback && (
                    <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">Feedback:</span>{" "}
                      {ans.aiFeedback}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Interview transcript */}
      {interview && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">AI Interview</h2>
            <span className="text-xs text-slate-500">
              {interview.status} · {interview.questions.length} questions ·{" "}
              Scheduled {formatDate(interview.scheduledAt)}
            </span>
          </div>
          {interview.overallFeedback && (
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-sm text-slate-700">{interview.overallFeedback}</p>
            </div>
          )}
          {interview.questions.length > 0 && (
            <ol className="divide-y divide-slate-100">
              {interview.questions.map((q, i) => {
                const ans = interview.answers[i];
                const score = interview.questionScores?.[i];
                const fb = interview.questionFeedback?.[i];
                return (
                  <li key={i} className="px-5 py-4">
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">
                        Q{i + 1}. {q}
                      </p>
                      {typeof score === "number" && (
                        <span
                          className={`flex-none text-sm font-bold tabular-nums ${scoreColor(score)}`}
                        >
                          {score}/100
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-line text-sm text-slate-700">
                      {ans || <span className="text-slate-400">No answer</span>}
                    </p>
                    {fb && (
                      <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">Feedback:</span> {fb}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {/* Proctoring */}
      {(candidate.proctoringViolations?.length ?? 0) > 0 || violations.length > 0 ? (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">
              Proctoring activity
              <span className="ml-2 text-xs font-normal text-slate-500">
                {(candidate.proctoringViolations?.length ?? 0) + violations.length} events
              </span>
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {(candidate.proctoringViolations ?? []).map((v, i) => (
              <li
                key={`cv-${i}`}
                className="flex items-center justify-between px-5 py-2.5 text-sm"
              >
                <span className="text-slate-700">
                  {v.type.replace(/_/g, " ")}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                      v.level === "terminate"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {v.level}
                  </span>
                </span>
                <span className="text-xs text-slate-500">{formatDate(v.at)}</span>
              </li>
            ))}
            {violations.map((v) => (
              <li
                key={String(v._id)}
                className="flex items-center justify-between px-5 py-2.5 text-sm"
              >
                <span className="text-slate-700">
                  {v.type.replace(/_/g, " ")}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                      v.severity === "critical" || v.severity === "high"
                        ? "bg-rose-100 text-rose-700"
                        : v.severity === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {v.severity}
                  </span>
                  {v.detail && (
                    <span className="ml-2 text-xs text-slate-500">{v.detail}</span>
                  )}
                </span>
                <span className="text-xs text-slate-500">{formatDate(v.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Application answers */}
      {candidate.applicationAnswers && candidate.applicationAnswers.length > 0 && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">Application answers</h2>
          </div>
          <ol className="divide-y divide-slate-100">
            {candidate.applicationAnswers.map((a, i) => (
              <li key={i} className="px-5 py-4">
                <p className="text-sm font-medium text-slate-900">{a.question}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                  {a.answer || <span className="text-slate-400">No answer</span>}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function DimensionScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${scoreColor(value)}`}>
        {value}
        <span className="ml-0.5 text-xs font-normal text-slate-400">/100</span>
      </p>
    </div>
  );
}

function BulletList({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <h3 className={`mb-1.5 text-sm font-semibold ${accent}`}>{title}</h3>
      <ul className="space-y-1 text-sm text-slate-700">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 flex-none rounded-full bg-slate-400" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type AnswerLike = {
  textAnswer?: string;
  selectedIndices?: number[];
};

function renderAnswer(
  type: string,
  options: string[],
  ans: AnswerLike | undefined
) {
  if (!ans) {
    return <span className="text-slate-400">No answer submitted</span>;
  }
  if (type === "mcq" || type === "multi_select") {
    const selected = ans.selectedIndices ?? [];
    if (selected.length === 0) {
      return <span className="text-slate-400">Not answered</span>;
    }
    return (
      <ul className="space-y-1">
        {options.map((opt, i) => {
          const isSelected = selected.includes(i);
          return (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-md px-2 py-1 text-sm ${
                isSelected
                  ? "bg-indigo-50 text-indigo-900"
                  : "text-slate-600"
              }`}
            >
              <span className="mt-0.5 text-xs">{isSelected ? "●" : "○"}</span>
              <span>{opt}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (ans.textAnswer) {
    return <p className="whitespace-pre-line">{ans.textAnswer}</p>;
  }
  return <span className="text-slate-400">No answer</span>;
}

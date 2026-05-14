import Link from "next/link";
import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import Candidate, { type CandidateStage } from "@/app/lib/db/models/Candidate";
import InterviewSession from "@/app/lib/db/models/InterviewSession";

export const metadata = { title: "Candidates — HireAI" };
export const dynamic = "force-dynamic";

// "Passed" = the candidate cleared the screening quiz and moved forward.
// Candidates still in screening/quiz, or rejected, are intentionally excluded.
const PASSED_STAGES: CandidateStage[] = [
  "quiz_completed",
  "interview_in_progress",
  "completed",
];

const STAGE_META: Record<string, { label: string; className: string }> = {
  quiz_completed: { label: "Quiz passed", className: "bg-indigo-100 text-indigo-700" },
  interview_in_progress: { label: "Interviewing", className: "bg-violet-100 text-violet-700" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
};

function scorePillClass(score: number): string {
  if (score >= 75) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-rose-700";
}

function ScoreCell({ score }: Readonly<{ score?: number | null }>) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className={`text-sm font-bold tabular-nums ${scorePillClass(score)}`}>
      {score}
      <span className="text-xs font-normal text-slate-400">/100</span>
    </span>
  );
}

export default async function CandidatesListPage() {
  const session = await verifySession();
  await connectDB();

  // Candidates aren't workspace-scoped directly — they hang off jobs. So scope
  // through the workspace's jobs first.
  const jobs = await Job.find({ workspaceId: session.workspaceId })
    .select("_id")
    .lean();
  const jobIds = jobs.map((j) => j._id);

  const candidates = await Candidate.find({
    jobId: { $in: jobIds },
    stage: { $in: PASSED_STAGES },
  })
    .select(
      "_id name email currentTitle currentCompany jobTitle stage resumeFilename resumeMatchScore answerScore proctoringFlagged interviewSessionId quizSubmittedAt updatedAt"
    )
    .sort({ quizSubmittedAt: -1, updatedAt: -1 })
    .lean();

  // Interview scores live on InterviewSession — join them in one query.
  const sessionIds = candidates
    .map((c) => c.interviewSessionId)
    .filter((id): id is NonNullable<typeof id> => Boolean(id));
  const interviews = sessionIds.length
    ? await InterviewSession.find({ _id: { $in: sessionIds } })
        .select("_id totalScore")
        .lean()
    : [];
  const interviewScoreById = new Map(
    interviews.map((i) => [String(i._id), i.totalScore ?? null])
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Passed candidates</h1>
        <p className="text-sm text-slate-500">
          {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"} cleared the
          screening quiz across this workspace.
        </p>
      </header>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-2xl text-indigo-500">
            ◉
          </div>
          <h3 className="text-base font-semibold text-slate-900">No passed candidates yet</h3>
          <p className="mt-1 text-sm text-slate-500">
            Once candidates clear the screening quiz for your jobs, they&apos;ll show up here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Candidate</th>
                <th className="px-4 py-2">Job</th>
                <th className="px-4 py-2">Resume</th>
                <th className="px-4 py-2">Match</th>
                <th className="px-4 py-2">Quiz</th>
                <th className="px-4 py-2">Interview</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Passed</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const id = String(c._id);
                const stage = STAGE_META[c.stage] ?? {
                  label: c.stage,
                  className: "bg-slate-100 text-slate-600",
                };
                const interviewScore = c.interviewSessionId
                  ? interviewScoreById.get(String(c.interviewSessionId)) ?? null
                  : null;
                const role = c.currentTitle
                  ? c.currentCompany
                    ? `${c.currentTitle} · ${c.currentCompany}`
                    : c.currentTitle
                  : null;
                return (
                  <tr
                    key={id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/candidates/${id}`}
                        className="block font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-slate-500">{c.email}</div>
                      {role && <div className="text-xs text-slate-400">{role}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.jobTitle}</td>
                    <td className="px-4 py-3">
                      {c.resumeFilename ? (
                        <a
                          href={`/api/resumes/${id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`View ${c.resumeFilename}`}
                          className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          View
                        </a>
                      ) : (
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          No resume
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ScoreCell score={c.resumeMatchScore} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreCell score={c.answerScore} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreCell score={interviewScore} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${stage.className}`}
                      >
                        {stage.label}
                      </span>
                      {c.proctoringFlagged && (
                        <span className="mt-1 block text-xs font-semibold text-rose-600">
                          ⚠ Proctoring flagged
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {c.quizSubmittedAt
                        ? new Date(c.quizSubmittedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

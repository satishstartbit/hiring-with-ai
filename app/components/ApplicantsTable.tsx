"use client";

const CANDIDATE_STATUS_STYLES: Record<string, string> = {
  applied: "bg-blue-50 text-blue-700 border border-blue-200",
  screening: "bg-amber-50 text-amber-700 border border-amber-200",
  interviewing: "bg-violet-50 text-violet-700 border border-violet-200",
  offered: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
  hired: "bg-green-50 text-green-700 border border-green-200",
};

interface Candidate {
  _id: string;
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  jobTitle: string;
  status: string;
  resumeFilename?: string;
  resumeMatchScore?: number;
  answerScore?: number;
  interviewScore?: number;
  screeningAnswers?: string[];
  appliedAt?: string;
  createdAt: string;
}

interface ApplicantsTableProps {
  candidates: Candidate[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSearchChange: (search: string) => void;
  searchTerm: string;
}

export default function ApplicantsTable({
  candidates,
  total,
  page,
  totalPages,
  onPageChange,
  onSearchChange,
  searchTerm,
}: ApplicantsTableProps) {
  const startItem = (page - 1) * 10 + 1;
  const endItem = Math.min(page * 10, total);

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
        <div>
          <h2 className="text-base font-bold text-slate-950">
            Applicants
            {total > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                {total}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Candidates who have applied for this position.
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search candidates..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-64 rounded-md border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <PeopleIcon />
          </span>
          <p className="text-sm font-semibold text-slate-600">
            {searchTerm ? "No candidates found" : "No applicants yet"}
          </p>
          <p className="text-xs text-slate-400">
            {searchTerm
              ? "Try adjusting your search terms"
              : "Candidates will appear here once they apply for this position."
            }
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3">Candidate</th>
                  <th className="px-4 py-3">Current role</th>
                  <th className="px-4 py-3">Resume</th>
                  <th className="px-4 py-3">Resume Score</th>
                  <th className="px-4 py-3">Quiz Score</th>
                  <th className="px-4 py-3">Interview Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((candidate) => {
                  const statusStyle =
                    CANDIDATE_STATUS_STYLES[candidate.status] ?? CANDIDATE_STATUS_STYLES.applied;
                  const roleBase = candidate.currentTitle ?? "";
                  const company = candidate.currentCompany ? ` · ${candidate.currentCompany}` : "";
                  const role = roleBase ? roleBase + company : null;
                  return (
                    <tr key={candidate._id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{candidate.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{candidate.email}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {role ?? <span className="text-slate-400">Not provided</span>}
                      </td>
                      <td className="px-4 py-4">
                        {candidate.resumeFilename ? (
                          <a
                            href={`/api/resumes/${candidate._id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View Resume
                          </a>
                        ) : (
                          <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            No resume
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <ScoreCell score={candidate.resumeMatchScore} emptyLabel="Not scored" />
                      </td>
                      <td className="px-4 py-4">
                        <ScoreCell score={candidate.answerScore} emptyLabel="Not taken"
                          sub={`${candidate.screeningAnswers?.length ?? 0} answers`} />
                      </td>
                      <td className="px-4 py-4">
                        <ScoreCell score={candidate.interviewScore} emptyLabel="No interview" />
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${statusStyle}`}>
                          {candidate.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-slate-500">
                        {new Date(candidate.appliedAt ?? candidate.createdAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 sm:px-7">
              <div className="text-sm text-slate-500">
                Showing <span className="font-semibold">{startItem}</span> to{" "}
                <span className="font-semibold">{endItem}</span> of{" "}
                <span className="font-semibold">{total}</span> results
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPageChange(page - 1)}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => onPageChange(pageNum)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                          pageNum === page
                            ? "bg-blue-600 text-white"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => onPageChange(page + 1)}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function scoreBarColor(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-red-400";
}

function scoreTextColor(score: number) {
  if (score >= 75) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-red-700";
}

function ScoreCell({ score, emptyLabel, sub }: {
  readonly score: number | undefined;
  readonly emptyLabel: string;
  readonly sub?: string;
}) {
  if (score === undefined || score === null) {
    return <span className="text-xs text-slate-400">{emptyLabel}</span>;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={`text-xs font-bold tabular-nums ${scoreTextColor(score)}`}>
          {score}/100
        </span>
      </div>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 9a3 3 0 0 0-3 3v.75c0 .414.336.75.75.75h10.5a.75.75 0 0 0 .75-.75V12a3 3 0 0 0-3-3H5Z" />
    </svg>
  );
}
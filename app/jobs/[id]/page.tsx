import Link from "next/link";
import { notFound } from "next/navigation";
import ApplyJobButton from "../../components/ApplyJobButton";
import { getCandidates, getJobById } from "../../lib/data/hiring";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  active:  { badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",  dot: "bg-emerald-500" },
  draft:   { badge: "bg-slate-100 text-slate-600 border border-slate-200",        dot: "bg-slate-400"   },
  closed:  { badge: "bg-red-50 text-red-700 border border-red-200",               dot: "bg-red-500"     },
  filled:  { badge: "bg-blue-50 text-blue-700 border border-blue-200",            dot: "bg-blue-500"    },
};

const CANDIDATE_STATUS_STYLES: Record<string, string> = {
  applied:     "bg-blue-50 text-blue-700 border border-blue-200",
  screening:   "bg-amber-50 text-amber-700 border border-amber-200",
  interviewing:"bg-violet-50 text-violet-700 border border-violet-200",
  offered:     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  rejected:    "bg-red-50 text-red-700 border border-red-200",
  hired:       "bg-green-50 text-green-700 border border-green-200",
};

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJobById(id);

  if (!job) notFound();

  const candidates = await getCandidates(job._id);
  const resumeCount = candidates.filter((c) => c.resumeFilename).length;
  const statusStyle = STATUS_STYLES[job.status] ?? STATUS_STYLES.draft;
  const postedDate = new Date(job.postedAt ?? job.createdAt).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-10">

      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Link
          href="/jobs"
          className="flex items-center gap-1.5 font-semibold text-slate-500 transition-colors hover:text-slate-800"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" />
          </svg>
          Job Positions
        </Link>
        <span className="text-slate-300">/</span>
        <span className="truncate font-semibold text-slate-800">{job.title}</span>
      </nav>

      {/* Hero */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyle.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                  {job.status}
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                {job.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <MetaPill icon={<BuildingIcon />} value={job.department} />
                <MetaPill icon={<PinIcon />} value={job.location} />
                <MetaPill icon={<ClockIcon />} value={job.type} />
              </div>
            </div>

            {job.status === "active" && (
              <div className="shrink-0">
                <ApplyJobButton jobId={job._id} jobTitle={job.title} />
              </div>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid divide-x divide-slate-100 sm:grid-cols-3">
          <StatCell
            label="Total applicants"
            value={candidates.length}
            valueClass="text-slate-900"
            icon={<PeopleIcon />}
          />
          <StatCell
            label="Resumes uploaded"
            value={resumeCount}
            valueClass="text-slate-900"
            icon={<DocumentIcon />}
          />
          <StatCell
            label="Date posted"
            value={postedDate}
            valueClass="text-slate-900"
            icon={<CalendarIcon />}
          />
        </div>
      </section>

      {/* Body */}
      {(job.description || job.requirements.length > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* Main content */}
          <section className="space-y-6">
            {job.description && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <SectionHeading>Job description</SectionHeading>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-700">
                  {job.description}
                </p>
              </div>
            )}

            {job.requirements.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <SectionHeading>Requirements</SectionHeading>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {job.requirements.map((req) => (
                    <li
                      key={req}
                      className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700"
                    >
                      <span className="mt-0.5 h-4 w-4 shrink-0 text-blue-500">
                        <CheckIcon />
                      </span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Role overview
              </p>
              <dl className="mt-4 space-y-3">
                <Detail label="Department" value={job.department} />
                <Detail label="Location" value={job.location} />
                <Detail label="Type" value={job.type} />
                <Detail label="Status" value={job.status} />
                <Detail label="Posted" value={postedDate} />
              </dl>
            </div>

            {job.status === "active" && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                <p className="text-sm font-bold text-blue-900">Ready to apply?</p>
                <p className="mt-1 text-xs leading-5 text-blue-700">
                  Submit your resume and complete an AI-powered screening test.
                </p>
                <div className="mt-4">
                  <ApplyJobButton jobId={job._id} jobTitle={job.title} />
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Applicants */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-7">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Applicants
              {candidates.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {candidates.length}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Candidates who have applied for this position.
            </p>
          </div>
     
        </div>

        {candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <PeopleIcon />
            </span>
            <p className="text-sm font-semibold text-slate-600">No applicants yet</p>
            <p className="text-xs text-slate-400">
              Candidates will appear here once they apply for this position.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3">Candidate</th>
                  <th className="px-4 py-3">Current role</th>
                  <th className="px-4 py-3">Resume</th>
                  <th className="px-4 py-3">Resume Score</th>
                  <th className="px-4 py-3">Quiz Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((candidate) => {
                  const resumeScore = typeof candidate.resumeMatchScore === "number" ? candidate.resumeMatchScore : null;
                  const quizScore = typeof candidate.answerScore === "number" ? candidate.answerScore : null;
                  const candidateStatusStyle =
                    CANDIDATE_STATUS_STYLES[candidate.status] ?? CANDIDATE_STATUS_STYLES.applied;
                  return (
                    <tr key={candidate._id} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{candidate.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{candidate.email}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {candidate.currentTitle
                          ? `${candidate.currentTitle}${candidate.currentCompany ? ` · ${candidate.currentCompany}` : ""}`
                          : <span className="text-slate-400">Not provided</span>}
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
                        {resumeScore !== null ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    resumeScore >= 75 ? "bg-emerald-500" : resumeScore >= 50 ? "bg-amber-400" : "bg-red-400"
                                  }`}
                                  style={{ width: `${resumeScore}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold tabular-nums ${
                                resumeScore >= 75 ? "text-emerald-700" : resumeScore >= 50 ? "text-amber-700" : "text-red-700"
                              }`}>
                                {resumeScore}/100
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Not scored</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {quizScore !== null ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    quizScore >= 75 ? "bg-emerald-500" : quizScore >= 50 ? "bg-amber-400" : "bg-red-400"
                                  }`}
                                  style={{ width: `${quizScore}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold tabular-nums ${
                                quizScore >= 75 ? "text-emerald-700" : quizScore >= 50 ? "text-amber-700" : "text-red-700"
                              }`}>
                                {quizScore}/100
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">
                              {candidate.screeningAnswers?.length ?? 0} answers
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Not taken</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${candidateStatusStyle}`}>
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
        )}
      </section>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-bold text-slate-950">
      <span className="h-4 w-1 rounded-full bg-blue-500" />
      {children}
    </h2>
  );
}

function MetaPill({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
      <span className="h-3.5 w-3.5 shrink-0 text-slate-400">{icon}</span>
      {value}
    </span>
  );
}

function StatCell({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: string | number;
  valueClass: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-5 sm:px-7">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`mt-0.5 truncate text-xl font-bold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="truncate font-semibold text-slate-800 capitalize">{value}</dd>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BuildingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path d="M2 2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v13h-3v-3H5v3H2V2Zm2 1v1h2V3H4Zm4 0v1h2V3H8ZM4 6v1h2V6H4Zm4 0v1h2V6H8Zm-4 3v1h2V9H4Zm4 0v1h2V9H8Z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path fillRule="evenodd" d="M8 1.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM2 6a6 6 0 1 1 10.174 4.31l3.263 3.263a.75.75 0 0 1-1.06 1.06l-3.263-3.263A6 6 0 0 1 2 6Z" clipRule="evenodd" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path fillRule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM2.5 8a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z" clipRule="evenodd" />
      <path d="M8 4.75a.75.75 0 0 1 .75.75v2.69l1.53 1.53a.75.75 0 1 1-1.06 1.06L7.47 9.03A.75.75 0 0 1 7.25 8.5v-3A.75.75 0 0 1 8 4.75Z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 9a3 3 0 0 0-3 3v.75c0 .414.336.75.75.75h10.5a.75.75 0 0 0 .75-.75V12a3 3 0 0 0-3-3H5Z" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path fillRule="evenodd" d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.414A2 2 0 0 0 13.414 5L11 2.586A2 2 0 0 0 9.586 2H4Zm1 5.75A.75.75 0 0 1 5.75 7h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 7.75Zm0 3A.75.75 0 0 1 5.75 10h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 5 10.75Z" clipRule="evenodd" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path d="M5.75 7.5a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5ZM5 10.75a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1-.75-.75Zm4.25-.75a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5ZM9 8.25A.75.75 0 0 1 9.75 7.5h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 9 8.25Z" />
      <path fillRule="evenodd" d="M5.5 2a.75.75 0 0 1 .75.75V4h3.5V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 14.25 6.75v6A2.75 2.75 0 0 1 11.5 15.5h-7a2.75 2.75 0 0 1-2.75-2.75v-6A2.75 2.75 0 0 1 4.5 4h.25V2.75A.75.75 0 0 1 5.5 2ZM3.25 7.5h9.5V6.75a1.25 1.25 0 0 0-1.25-1.25h-7a1.25 1.25 0 0 0-1.25 1.25V7.5Z" clipRule="evenodd" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-1/4 w-1/4">
      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
    </svg>
  );
}

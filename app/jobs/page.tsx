import Link from "next/link";
import JobCard from "../components/JobCard";
import { getJobSummaries } from "../lib/data/hiring";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 3;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; query?: string }>;
}) {
  const { page: pageParam, query: queryParam } = await searchParams;
  const allJobs = await getJobSummaries();
  const query = queryParam?.trim() ?? "";
  const jobs = query
    ? allJobs.filter((job) => {
        const q = query.toLowerCase();
        return (
          job.title.toLowerCase().includes(q) ||
          (job.department ?? "").toLowerCase().includes(q) ||
          (job.location ?? "").toLowerCase().includes(q) ||
          job.status.toLowerCase().includes(q)
        );
      })
    : allJobs;

  const currentPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedJobs = jobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeJobs = allJobs.filter((job) => job.status === "active").length;
  const draftJobs = allJobs.filter((job) => job.status === "draft").length;
  const totalApplicants = allJobs.reduce((sum, job) => sum + job.applicantCount, 0);
  const newestJob = allJobs[0];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="border-b border-slate-200 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="text-sm font-semibold text-blue-700">Job Positions</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Manage every role from draft to filled
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Review live openings, watch applicant volume, and jump into each
              role candidate list from one focused workspace.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
              >
                Create Position
              </Link>
            </div>
          </div>

          <div className="bg-slate-50 p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Hiring Snapshot
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <Snapshot label="Active" value={activeJobs} tone="blue" />
              <Snapshot label="Drafts" value={draftJobs} tone="slate" />
              <Snapshot label="Applicants" value={totalApplicants} tone="red" />
              <Snapshot
                label="Avg. applicants"
                value={jobs.length ? Math.round(totalApplicants / jobs.length) : 0}
                tone="slate"
              />
            </dl>
            <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Latest role
              </p>
              {newestJob ? (
                <>
                  <p className="mt-2 truncate text-sm font-bold text-slate-950">
                    {newestJob.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(newestJob.createdAt).toLocaleDateString()} /{" "}
                    {newestJob.applicantCount} applicants
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No positions created yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="my-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Total positions" value={allJobs.length} color="slate" />
        <Metric label="Active positions" value={activeJobs} color="blue" />
        <Metric label="Total applicants" value={totalApplicants} color="red" />
      </section>

      {jobs.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-blue-50 text-lg font-bold text-blue-700">
            0
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">No positions yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Start a hiring workflow from the dashboard to publish your first role.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Create First Position
          </Link>
        </section>
      ) : (
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Position directory</h2>
              <p className="text-sm text-slate-600">
                Active roles appear first based on newest workflow activity.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <form action="/jobs" method="GET" className="flex items-center gap-2">
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    name="query"
                    defaultValue={query}
                    placeholder="Search roles…"
                    className="h-9 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
                  />
                </div>
                {query && (
                  <Link
                    href="/jobs"
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Clear
                  </Link>
                )}
              </form>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                {jobs.length} {jobs.length === 1 ? "role" : "roles"}
                {query ? " found" : ""}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedJobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
          {jobs.length === 0 && query && (
            <p className="py-10 text-center text-sm text-slate-500">
              No roles match &ldquo;{query}&rdquo;.{" "}
              <Link href="/jobs" className="font-medium text-blue-600 hover:underline">
                Clear search
              </Link>
            </p>
          )}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {safePage} of {totalPages}
              </p>
              <div className="flex gap-2">
                {safePage > 1 ? (
                  <Link
                    href={`/jobs?page=${safePage - 1}${query ? `&query=${encodeURIComponent(query)}` : ""}`}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-300 cursor-not-allowed">
                    ← Previous
                  </span>
                )}
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Link
                      key={p}
                      href={`/jobs?page=${p}${query ? `&query=${encodeURIComponent(query)}` : ""}`}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium ${
                        p === safePage
                          ? "bg-blue-600 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {p}
                    </Link>
                  ))}
                </div>
                {safePage < totalPages ? (
                  <Link
                    href={`/jobs?page=${safePage + 1}${query ? `&query=${encodeURIComponent(query)}` : ""}`}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-300 cursor-not-allowed">
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Snapshot({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "red" | "slate";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "red"
        ? "bg-red-50 text-red-700"
        : "bg-slate-100 text-slate-700";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-2 inline-flex rounded-md px-2.5 py-1 text-2xl font-bold ${toneClass}`}>
        {value}
      </dd>
    </div>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "red" | "slate";
}) {
  const colorClass =
    color === "blue"
      ? "text-blue-700"
      : color === "red"
        ? "text-red-700"
        : "text-slate-900";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

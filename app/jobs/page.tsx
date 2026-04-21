import Link from "next/link";
import JobCard from "../components/JobCard";
import { getJobSummaries } from "../lib/data/hiring";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await getJobSummaries();
  const activeJobs = jobs.filter((job) => job.status === "active").length;
  const totalApplicants = jobs.reduce((sum, job) => sum + job.applicantCount, 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">Job Positions</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Open and past job positions
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Click any job position to open its details page and applicant list.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          Create Position
        </Link>
      </div>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Total positions" value={jobs.length} color="blue" />
        <Metric label="Active positions" value={activeJobs} color="blue" />
        <Metric label="Total applicants" value={totalApplicants} color="red" />
      </section>

      {jobs.length === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">No positions yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Start a hiring workflow from the dashboard to publish your first role.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
          >
            Go to Dashboard
          </Link>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job._id} job={job} />
          ))}
        </section>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "red";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-bold ${
          color === "blue" ? "text-blue-700" : "text-red-700"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

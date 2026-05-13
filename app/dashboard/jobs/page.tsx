import Link from "next/link";
import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";

export const metadata = { title: "Jobs — HireAI" };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  ai_generated: "bg-indigo-100 text-indigo-700",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-600",
  filled: "bg-fuchsia-100 text-fuchsia-700",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ai_generated: "AI generated",
  active: "Active",
  closed: "Closed",
  filled: "Filled",
};

export default async function JobsListPage() {
  const session = await verifySession();
  await connectDB();
  const jobs = await Job.find({ workspaceId: session.workspaceId })
    .select("_id title department location workMode type status numberOfOpenings applicantCount postedAt createdAt skills")
    .sort({ createdAt: -1 })
    .lean();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-slate-500">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"} in this workspace.
          </p>
        </div>
        <Link
          href="/dashboard/jobs/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          + Create job
        </Link>
      </header>

      {jobs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Openings</th>
                <th className="px-4 py-2">Applicants</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={String(j._id)}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/jobs/${String(j._id)}`}
                      className="block font-medium text-slate-900 hover:text-indigo-700"
                    >
                      {j.title}
                    </Link>
                    <div className="text-xs text-slate-500">{j.department}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        STATUS_STYLES[j.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABEL[j.status] ?? j.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {j.location}
                    <div className="text-xs text-slate-500">
                      {j.workMode} · {j.type}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{j.numberOfOpenings ?? 1}</td>
                  <td className="px-4 py-3 text-slate-700">{j.applicantCount ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {j.createdAt ? new Date(j.createdAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-2xl text-indigo-500">
        ✦
      </div>
      <h3 className="text-base font-semibold text-slate-900">No jobs yet</h3>
      <p className="mt-1 text-sm text-slate-500">
        Create your first job with the AI-powered wizard. Add the basics, let AI write the JD, then
        publish to LinkedIn and other portals.
      </p>
      <Link
        href="/dashboard/jobs/new"
        className="mt-4 inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        + Create your first job
      </Link>
    </div>
  );
}

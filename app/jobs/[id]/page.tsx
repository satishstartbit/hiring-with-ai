import Link from "next/link";
import { notFound } from "next/navigation";
import ApplyJobButton from "../../components/ApplyJobButton";
import { getCandidates, getJobById } from "../../lib/data/hiring";

export const dynamic = "force-dynamic";

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJobById(id);

  if (!job) notFound();

  const candidates = await getCandidates(job._id);
  const resumeCount = candidates.filter((candidate) => candidate.resumeFilename).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6">
        <Link
          href="/jobs"
          className="text-sm font-bold text-blue-700 hover:text-blue-800"
        >
          Back to Job Positions
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
              {job.status}
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              {job.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {job.department} / {job.location} / {job.type}
            </p>
          </div>
          {job.status === "active" && (
            <ApplyJobButton jobId={job._id} jobTitle={job.title} />
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Metric label="Applicants" value={candidates.length} color="red" />
          <Metric label="Resumes uploaded" value={resumeCount} color="red" />
          <Metric
            label="Posted"
            value={new Date(job.postedAt ?? job.createdAt).toLocaleDateString()}
            color="blue"
          />
        </div>

        {job.description && (
          <div className="mt-8">
            <h2 className="text-base font-bold text-slate-950">Job description</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
              {job.description}
            </p>
          </div>
        )}

        {job.requirements.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-bold text-slate-950">Requirements</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {job.requirements.map((requirement) => (
                <li
                  key={requirement}
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  {requirement}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Applicants</h2>
            <p className="text-sm text-slate-600">
              User details and resume status for this job position.
            </p>
          </div>
          <Link
            href="/resumes"
            className="rounded-md border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"
          >
            All Resumes
          </Link>
        </div>

        {candidates.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-6 text-sm text-slate-500">
            No candidates have applied for this job yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Candidate</th>
                  <th className="py-3 pr-4">Current role</th>
                  <th className="py-3 pr-4">Resume</th>
                  <th className="py-3 pr-4">AI screen</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((candidate) => (
                  <tr key={candidate._id}>
                    <td className="py-3 pr-4">
                      <p className="font-bold text-slate-950">{candidate.name}</p>
                      <p className="text-xs text-slate-500">{candidate.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {candidate.currentTitle || "Not provided"}
                      {candidate.currentCompany ? ` at ${candidate.currentCompany}` : ""}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-bold ${
                          candidate.resumeFilename
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {candidate.resumeFilename || "No resume"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-bold text-blue-700">
                        {typeof candidate.resumeMatchScore === "number"
                          ? `${candidate.resumeMatchScore}/100`
                          : "Not scored"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {candidate.screeningAnswers?.length ?? 0} answers
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                        {candidate.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">
                      {new Date(candidate.appliedAt ?? candidate.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "blue" | "red";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          color === "blue" ? "text-blue-700" : "text-red-700"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

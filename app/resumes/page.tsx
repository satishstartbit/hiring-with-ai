import Link from "next/link";
import { getCandidates } from "../lib/data/hiring";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const candidates = await getCandidates();
  const resumeCount = candidates.filter((candidate) => candidate.resumeFilename).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-red-700">Resumes</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Resume and applicant listing
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review every application, candidate detail, job title, and uploaded resume.
          </p>
        </div>
        <Link
          href="/jobs"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
        >
          Job Positions
        </Link>
      </div>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Applications received" value={candidates.length} color="red" />
        <Metric label="Resumes uploaded" value={resumeCount} color="red" />
        <Metric
          label="Without resume file"
          value={candidates.length - resumeCount}
          color="blue"
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-950">All applicants</h2>
          <p className="text-sm text-slate-600">
            Candidate user details are listed with the job they applied for.
          </p>
        </div>

        {candidates.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-6 text-sm text-slate-500">
            No resumes or applications have come in yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-3 pr-4">User</th>
                  <th className="py-3 pr-4">Job position</th>
                  <th className="py-3 pr-4">Current details</th>
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
                    <td className="py-3 pr-4">
                      <Link
                        href={`/jobs/${candidate.jobId}`}
                        className="font-semibold text-blue-700 hover:text-blue-800"
                      >
                        {candidate.jobTitle}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {candidate.currentTitle || "Title not provided"}
                      {candidate.currentCompany ? ` / ${candidate.currentCompany}` : ""}
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

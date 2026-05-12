import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import { JobPublication } from "@/app/lib/db/models/JobPublication";
import type { IntegrationProvider } from "@/app/lib/db/models/Integration";
import RepublishButton from "./RepublishButton";
import ShareToLinkedInButton from "./ShareToLinkedInButton";

export const metadata = { title: "Job — HireAI" };

const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  naukri: "Naukri",
  monster: "Monster",
  glassdoor: "Glassdoor",
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  const { id } = await params;
  await connectDB();
  const job = await Job.findOne({ _id: id, workspaceId: session.workspaceId }).lean();
  if (!job) notFound();
  const publications = await JobPublication.find({
    jobId: job._id,
    workspaceId: session.workspaceId,
  })
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href="/dashboard/jobs" className="hover:text-indigo-600">
          Jobs
        </Link>{" "}
        / <span className="text-slate-700">{job.title}</span>
      </nav>

      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="text-sm text-slate-500">
            {job.department} · {job.location} · {job.workMode} · {job.type}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {job.skills.map((s) => (
              <span
                key={s}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
          {job.status}
        </span>
      </header>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Description</h2>
        <p className="whitespace-pre-line text-sm text-slate-700">{job.description || "—"}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ListBox title="Responsibilities" items={job.responsibilities} />
        <ListBox title="Requirements" items={job.requirements} />
        <ListBox title="Preferred qualifications" items={job.preferredQualifications} />
        <ListBox title="Screening questions" items={job.screeningQuestions} />
      </div>

      {job.interviewProcessSummary && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Interview process</h2>
          <p className="text-sm text-slate-700">{job.interviewProcessSummary}</p>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Publishing history</h2>
          <div className="flex items-center gap-2">
            <ShareToLinkedInButton jobId={String(job._id)} jobTitle={job.title} />
            <RepublishButton jobId={String(job._id)} />
          </div>
        </div>
        {publications.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            Not published yet.{" "}
            <Link href={`/dashboard/jobs/new`} className="text-indigo-600 underline">
              Publish from the wizard
            </Link>{" "}
            or click Re-publish above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Platform</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Published at</th>
                <th className="px-4 py-2">External URL</th>
              </tr>
            </thead>
            <tbody>
              {publications.map((p) => (
                <tr key={String(p._id)} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    {PROVIDER_LABEL[p.provider as IntegrationProvider] ?? p.provider}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                    {p.status === "failed" && p.errorMessage && (
                      <p className="mt-1 text-xs text-rose-600">{p.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.externalUrl ? (
                      <a
                        href={p.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 underline"
                      >
                        Open ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function ListBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-700">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 h-1 w-1 flex-none rounded-full bg-slate-400" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "published"
      ? "bg-emerald-100 text-emerald-700"
      : status === "failed"
      ? "bg-rose-100 text-rose-700"
      : status === "removed"
      ? "bg-slate-100 text-slate-600"
      : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles}`}>{status}</span>;
}

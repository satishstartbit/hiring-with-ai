import { Suspense } from "react";
import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import {
  listWorkspaceCandidates,
  parseListParams,
} from "@/app/lib/candidates/passedCandidatesList";
import CandidatesListClient from "./CandidatesListClient";

export const metadata = { title: "Candidates — HireAI" };
export const dynamic = "force-dynamic";

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 rounded-md bg-slate-100" />
      <div className="h-64 rounded-lg bg-slate-100" />
    </div>
  );
}

export default async function CandidatesListPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await verifySession();
  const sp = await searchParams;
  const { page, limit, search, sort, order } = parseListParams(sp);

  await connectDB();
  const jobs = await Job.find({ workspaceId: session.workspaceId }).select("_id").lean();
  const jobIds = jobs.map((j) => j._id);

  if (jobIds.length === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-sm text-slate-500">
            Applicants for jobs in your workspace appear here.
          </p>
        </header>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h3 className="text-base font-semibold text-slate-900">No jobs in this workspace</h3>
          <p className="mt-1 text-sm text-slate-500">
            Create and publish a job to start receiving applications.
          </p>
        </div>
      </div>
    );
  }

  const result = await listWorkspaceCandidates({
    jobIds,
    page,
    limit,
    search,
    sort,
    order,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
        <p className="text-sm text-slate-500">
          {result.total} {result.total === 1 ? "applicant" : "applicants"} for your workspace
          jobs — passed and in progress.
        </p>
      </header>

      <Suspense fallback={<TableSkeleton />}>
        <CandidatesListClient
          candidates={result.candidates}
          total={result.total}
          page={result.page}
          limit={result.limit}
          totalPages={result.totalPages}
          sort={result.sort}
          order={result.order}
          search={result.search}
        />
      </Suspense>
    </div>
  );
}

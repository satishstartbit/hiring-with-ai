import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import { Integration, INTEGRATION_PROVIDERS } from "@/app/lib/db/models/Integration";
import JobWizard from "./JobWizard";

export const metadata = { title: "Create job — HireAI" };

export default async function NewJobPage() {
  const session = await requirePermission(PERMISSIONS.JOB_CREATE);
  await connectDB();
  const integrations = await Integration.find({
    userId: session.userId,
    deletedAt: null,
  })
    .select("provider status accountEmail")
    .lean();
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));
  const integrationStatus = INTEGRATION_PROVIDERS.map((p) => ({
    provider: p,
    status: (byProvider.get(p)?.status ?? "disconnected") as
      | "connected"
      | "disconnected"
      | "expired"
      | "error",
    accountEmail: byProvider.get(p)?.accountEmail ?? "",
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">New job</p>
        <h1 className="text-2xl font-semibold tracking-tight">Create a job with AI</h1>
        <p className="text-sm text-slate-500">
          Answer a few questions. We&apos;ll draft the description, requirements, screening
          questions, and an interview plan — you review, then publish to portals.
        </p>
      </header>
      <JobWizard integrationStatus={integrationStatus} />
    </div>
  );
}

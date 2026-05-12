import { requirePermission, getCurrentWorkspaceContext } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import { Branding } from "@/app/lib/db/models/Branding";
import SettingsClient from "./SettingsClient";

export const metadata = { title: "Settings — HireAI" };

export default async function SettingsPage() {
  const session = await requirePermission(PERMISSIONS.BRANDING_CONFIGURE);
  const ctx = await getCurrentWorkspaceContext();
  await connectDB();
  const branding = await Branding.findOne({ workspaceId: session.workspaceId }).lean();
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace settings</h1>
        <p className="text-sm text-slate-500">
          Customize branding for {ctx.company.name}. Saved instantly.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <h2 className="mb-3 text-base font-semibold">Company</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-slate-700">
          <dt className="text-slate-500">Name</dt>
          <dd>{ctx.company.name}</dd>
          <dt className="text-slate-500">Domain</dt>
          <dd>{ctx.company.domain}</dd>
          <dt className="text-slate-500">Industry</dt>
          <dd>{ctx.company.industry}</dd>
          <dt className="text-slate-500">Size</dt>
          <dd>{ctx.company.size}</dd>
          <dt className="text-slate-500">Country</dt>
          <dd>{ctx.company.country}</dd>
          <dt className="text-slate-500">Timezone</dt>
          <dd>{ctx.company.timezone}</dd>
          <dt className="text-slate-500">Workspace slug</dt>
          <dd className="font-mono text-xs">{ctx.workspace.slug}</dd>
        </dl>
      </section>

      <SettingsClient
        initial={{
          logoUrl: branding?.logoUrl ?? "",
          faviconUrl: branding?.faviconUrl ?? "",
          primaryColor: branding?.primaryColor ?? "#4f46e5",
          accentColor: branding?.accentColor ?? "#a855f7",
          emailHeader: branding?.emailHeader ?? "",
          emailFooter: branding?.emailFooter ?? "",
          careerPageTagline: branding?.careerPageTagline ?? "",
        }}
      />
    </div>
  );
}

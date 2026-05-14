import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import {
  Integration,
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
} from "@/app/lib/db/models/Integration";
import IntegrationsClient from "./IntegrationsClient";

export const metadata = { title: "Integrations — HireAI" };

const META: Record<IntegrationProvider, { name: string; gradient: string; description: string }> = {
  linkedin: {
    name: "LinkedIn",
    gradient: "from-sky-500 to-blue-600",
    description: "OAuth sync of profile + share jobs to your feed.",
  },
};

export default async function IntegrationsPage() {
  const session = await verifySession();
  await connectDB();
  const rows = await Integration.find({ userId: session.userId, deletedAt: null })
    .select(
      "provider status accountEmail accountName externalAccountId scope lastSyncAt tokenExpiresAt profileSnapshot createdAt updatedAt"
    )
    .lean();
  const byProvider = new Map(rows.map((r) => [r.provider as IntegrationProvider, r]));

  const integrations = INTEGRATION_PROVIDERS.map((p) => {
    const r = byProvider.get(p);
    return {
      provider: p,
      name: META[p].name,
      gradient: META[p].gradient,
      description: META[p].description,
      status: (r?.status as "connected" | "disconnected" | "expired" | "error") ?? "disconnected",
      accountEmail: r?.accountEmail ?? "",
      accountName: r?.accountName ?? "",
      externalAccountId: r?.externalAccountId ?? "",
      scope: r?.scope ?? "",
      lastSyncAt: r?.lastSyncAt ? new Date(r.lastSyncAt).toISOString() : null,
      tokenExpiresAt: r?.tokenExpiresAt ? new Date(r.tokenExpiresAt).toISOString() : null,
      connectedAt: r?.createdAt ? new Date(r.createdAt).toISOString() : null,
      updatedAt: r?.updatedAt ? new Date(r.updatedAt).toISOString() : null,
      profileSnapshot: (r?.profileSnapshot as Record<string, unknown> | null) ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-slate-500">
          Connect external job portals. OAuth flows wire up in Phase 3; connect actions stub the
          link today so the dashboard reflects state.
        </p>
      </header>
      <IntegrationsClient initial={integrations} />
    </div>
  );
}

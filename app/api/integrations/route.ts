import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import { Integration, INTEGRATION_PROVIDERS } from "@/app/lib/db/models/Integration";
import { ok, fromError } from "@/app/lib/api/response";

export async function GET() {
  try {
    const session = await verifySession();
    await connectDB();
    const rows = await Integration.find({
      userId: session.userId,
      deletedAt: null,
    })
      .select("provider status accountEmail accountName lastSyncAt tokenExpiresAt")
      .lean();

    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    const integrations = INTEGRATION_PROVIDERS.map((p) => {
      const row = byProvider.get(p);
      return {
        provider: p,
        status: row?.status ?? "disconnected",
        accountEmail: row?.accountEmail ?? "",
        accountName: row?.accountName ?? "",
        lastSyncAt: row?.lastSyncAt ?? null,
        tokenExpiresAt: row?.tokenExpiresAt ?? null,
      };
    });
    return ok({ integrations });
  } catch (e) {
    return fromError(e);
  }
}

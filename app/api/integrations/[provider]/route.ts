import { verifySession } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import {
  Integration,
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
} from "@/app/lib/db/models/Integration";
import { ok, err, fromError } from "@/app/lib/api/response";

function isProvider(value: string): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

const PROVIDER_SCOPES: Record<IntegrationProvider, string> = {
  linkedin: "r_liteprofile r_emailaddress w_member_social",
  indeed: "employer.listings.read employer.listings.write",
  naukri: "candidate.search jobs.publish",
  monster: "jobs.publish candidates.read",
  glassdoor: "employer.read employer.write",
};

function stubProfileSnapshot(provider: IntegrationProvider, email: string) {
  const handle = email.split("@")[0] || "user";
  const base = {
    headline: `Talent Acquisition · HireAI`,
    publicProfileUrl: `https://example.invalid/${provider}/${handle}`,
    locale: "en_US",
    syncedAt: new Date().toISOString(),
  };
  if (provider === "linkedin") {
    return {
      ...base,
      industry: "Internet",
      connections: 500,
      vanityName: handle,
    };
  }
  return base;
}

export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const session = await verifySession();
    const { provider } = await params;
    if (!isProvider(provider)) return err("bad_provider", "Unknown provider", 400);

    // OAuth flows arrive in Phase 3. For now, stub the connection so the UI can demo.
    // The real flow will (1) redirect to the provider's authorize URL, (2) handle
    // callback to exchange code → tokens, and (3) upsert this Integration record.
    await connectDB();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const accountName =
      session.email.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
      "Recruiter";
    const externalAccountId = `${provider}_${session.userId.slice(-8)}`;

    const record = await Integration.findOneAndUpdate(
      { userId: session.userId, provider },
      {
        $set: {
          status: "connected",
          accountEmail: session.email,
          accountName,
          externalAccountId,
          scope: PROVIDER_SCOPES[provider],
          tokenExpiresAt: expiresAt,
          profileSnapshot: stubProfileSnapshot(provider, session.email),
          workspaceId: session.workspaceId,
          companyId: session.companyId,
          lastSyncAt: now,
        },
      },
      { new: true, upsert: true }
    ).lean();

    return ok({
      provider,
      status: record!.status,
      accountEmail: record!.accountEmail,
      accountName: record!.accountName,
      externalAccountId: record!.externalAccountId,
      scope: record!.scope,
      tokenExpiresAt: record!.tokenExpiresAt,
      lastSyncAt: record!.lastSyncAt,
      profileSnapshot: record!.profileSnapshot,
      stub: true,
    });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const session = await verifySession();
    const { provider } = await params;
    if (!isProvider(provider)) return err("bad_provider", "Unknown provider", 400);
    await connectDB();
    await Integration.updateOne(
      { userId: session.userId, provider },
      {
        $set: {
          status: "disconnected",
          accessToken: "",
          refreshToken: "",
          tokenExpiresAt: null,
        },
      }
    );
    return ok({ provider, status: "disconnected" });
  } catch (e) {
    return fromError(e);
  }
}

import { z } from "zod";
import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import { IntegrationConfig } from "@/app/lib/db/models/IntegrationConfig";
import { ok, fromError } from "@/app/lib/api/response";

export const dynamic = "force-dynamic";

const LINKEDIN_DEFAULT_SCOPE = "openid profile email w_member_social";

function defaultRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/integrations/linkedin/callback`;
}

export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.INTEGRATION_CONNECT);
    await connectDB();
    const cfg = await IntegrationConfig.findOne({
      workspaceId: session.workspaceId,
      provider: "linkedin",
    }).lean();

    return ok({
      configured: Boolean(cfg?.clientId && cfg?.clientSecret),
      clientId: cfg?.clientId ?? "",
      redirectUri: cfg?.redirectUri || defaultRedirectUri(),
      scope: cfg?.scope || LINKEDIN_DEFAULT_SCOPE,
      configuredAt: cfg?.configuredAt ?? null,
      hasSecret: Boolean(cfg?.clientSecret),
    });
  } catch (e) {
    return fromError(e);
  }
}

const PutSchema = z.object({
  clientId: z.string().trim().min(1, "Client ID is required"),
  clientSecret: z.string().trim().min(1, "Client Secret is required"),
  redirectUri: z.string().trim().url().optional(),
  scope: z.string().trim().optional(),
});

export async function PUT(req: Request) {
  try {
    const session = await requirePermission(PERMISSIONS.INTEGRATION_CONNECT);
    const body = PutSchema.parse(await req.json());
    await connectDB();

    const update = {
      workspaceId: session.workspaceId,
      companyId: session.companyId,
      provider: "linkedin" as const,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      redirectUri: body.redirectUri || defaultRedirectUri(),
      scope: body.scope || LINKEDIN_DEFAULT_SCOPE,
      configuredBy: session.userId,
      configuredAt: new Date(),
    };

    await IntegrationConfig.findOneAndUpdate(
      { workspaceId: session.workspaceId, provider: "linkedin" },
      { $set: update },
      { upsert: true, new: true }
    );

    return ok({
      configured: true,
      clientId: update.clientId,
      redirectUri: update.redirectUri,
      scope: update.scope,
      configuredAt: update.configuredAt.toISOString(),
      hasSecret: true,
    });
  } catch (e) {
    return fromError(e);
  }
}

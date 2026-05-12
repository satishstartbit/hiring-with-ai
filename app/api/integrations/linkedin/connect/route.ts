import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import { IntegrationConfig } from "@/app/lib/db/models/IntegrationConfig";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "linkedin_oauth_state";
const RETURN_COOKIE = "linkedin_oauth_return";

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function redirectToIntegrations(error: string): NextResponse {
  const url = new URL("/dashboard/integrations", appBase());
  url.searchParams.set("linkedin_error", error);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  try {
    const session = await requirePermission(PERMISSIONS.INTEGRATION_CONNECT);
    await connectDB();
    const cfg = await IntegrationConfig.findOne({
      workspaceId: session.workspaceId,
      provider: "linkedin",
    }).lean();

    if (!cfg?.clientId || !cfg?.clientSecret) {
      return redirectToIntegrations("not_configured");
    }

    const state = randomBytes(24).toString("hex");
    const returnTo =
      new URL(req.url).searchParams.get("returnTo") || "/dashboard/integrations";

    const authorizeUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", cfg.clientId);
    authorizeUrl.searchParams.set("redirect_uri", cfg.redirectUri);
    authorizeUrl.searchParams.set("scope", cfg.scope);
    authorizeUrl.searchParams.set("state", state);

    console.log(
      `[linkedin/connect] Sending redirect_uri to LinkedIn → ${JSON.stringify(cfg.redirectUri)}`
    );
    console.log(
      "[linkedin/connect] This string must be registered VERBATIM in your LinkedIn app's Auth → Authorized redirect URLs."
    );

    const res = NextResponse.redirect(authorizeUrl);
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    cookieStore.set(RETURN_COOKIE, returnTo, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    return res;
  } catch {
    return redirectToIntegrations("start_failed");
  }
}

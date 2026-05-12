import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import { Integration } from "@/app/lib/db/models/Integration";
import { IntegrationConfig } from "@/app/lib/db/models/IntegrationConfig";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "linkedin_oauth_state";
const RETURN_COOKIE = "linkedin_oauth_return";

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function done(returnTo: string, params: Record<string, string>): NextResponse {
  const url = new URL(returnTo || "/dashboard/integrations", appBase());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type UserInfo = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
};

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value ?? "";
  const returnTo = cookieStore.get(RETURN_COOKIE)?.value ?? "/dashboard/integrations";
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(RETURN_COOKIE);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return done(returnTo, {
      linkedin_error: oauthError,
      linkedin_error_description: url.searchParams.get("error_description") ?? "",
    });
  }
  if (!code || !state || state !== expectedState) {
    return done(returnTo, { linkedin_error: "invalid_state" });
  }

  try {
    const session = await requirePermission(PERMISSIONS.INTEGRATION_CONNECT);
    await connectDB();
    const cfg = await IntegrationConfig.findOne({
      workspaceId: session.workspaceId,
      provider: "linkedin",
    }).lean();
    if (!cfg?.clientId || !cfg?.clientSecret) {
      return done(returnTo, { linkedin_error: "not_configured" });
    }

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return done(returnTo, {
        linkedin_error: "token_exchange_failed",
        linkedin_error_description: text.slice(0, 240),
      });
    }
    const token = (await tokenRes.json()) as TokenResponse;

    let profile: UserInfo | null = null;
    try {
      const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (userRes.ok) profile = (await userRes.json()) as UserInfo;
    } catch {
      // non-fatal: store token even if profile lookup hiccups
    }

    const now = new Date();
    const tokenExpiresAt = new Date(now.getTime() + (token.expires_in ?? 0) * 1000);
    await Integration.findOneAndUpdate(
      { userId: session.userId, provider: "linkedin" },
      {
        $set: {
          status: "connected",
          workspaceId: session.workspaceId,
          companyId: session.companyId,
          accessToken: token.access_token,
          refreshToken: token.refresh_token ?? "",
          tokenExpiresAt,
          scope: token.scope ?? cfg.scope,
          accountEmail: profile?.email ?? session.email,
          accountName: profile?.name ?? "",
          externalAccountId: profile?.sub ?? "",
          profileSnapshot: profile
            ? {
                givenName: profile.given_name ?? "",
                familyName: profile.family_name ?? "",
                picture: profile.picture ?? "",
                locale: profile.locale ?? "",
                emailVerified: profile.email_verified ?? false,
                fetchedAt: now.toISOString(),
              }
            : null,
          lastSyncAt: now,
          deletedAt: null,
        },
      },
      { upsert: true, new: true }
    );

    return done(returnTo, { linkedin_connected: "1" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "callback_failed";
    return done(returnTo, { linkedin_error: "callback_failed", linkedin_error_description: msg });
  }
}

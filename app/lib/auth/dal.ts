import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession, type SessionPayload } from "./session";
import { hasPermission, type Permission } from "./permissions";
import { connectDB } from "../db/connection";
import { User } from "../db/models/User";
import { Workspace } from "../db/models/Workspace";
import { Company } from "../db/models/Company";

export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await readSession();
  if (!session?.userId) {
    redirect("/login");
  }
  return session;
});

export const optionalSession = cache(async (): Promise<SessionPayload | null> => {
  return await readSession();
});

export const requirePermission = cache(async (permission: Permission): Promise<SessionPayload> => {
  const session = await verifySession();
  if (!hasPermission(session.role, permission)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  await connectDB();
  const user = await User.findOne({ _id: session.userId, deletedAt: null }).lean();
  if (!user) redirect("/login");
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    companyId: String(user.companyId),
    workspaceId: String(user.workspaceId),
    emailVerified: user.emailVerified,
  };
});

export const getCurrentWorkspaceContext = cache(async () => {
  const session = await verifySession();
  await connectDB();
  const [workspace, company] = await Promise.all([
    Workspace.findOne({ _id: session.workspaceId, deletedAt: null }).lean(),
    Company.findOne({ _id: session.companyId, deletedAt: null }).lean(),
  ]);
  if (!workspace || !company) redirect("/login");
  return {
    workspace: {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      memberCount: workspace.memberCount,
    },
    company: {
      id: String(company._id),
      name: company.name,
      domain: company.domain,
      logoUrl: company.logoUrl,
      industry: company.industry,
      size: company.size,
      country: company.country,
      timezone: company.timezone,
    },
  };
});

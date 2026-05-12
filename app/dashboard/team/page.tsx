import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS, ROLE_LABELS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import { User, type Role } from "@/app/lib/db/models/User";
import TeamClient from "./TeamClient";

export const metadata = { title: "Team — HireAI" };

export default async function TeamPage() {
  const session = await requirePermission(PERMISSIONS.TEAM_VIEW);
  await connectDB();
  const members = await User.find({ workspaceId: session.workspaceId, deletedAt: null })
    .select("_id email name role avatarUrl emailVerified lastLoginAt createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const canManage =
    session.role === "company_admin" || session.role === "super_admin";

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team management</h1>
          <p className="text-sm text-slate-500">
            Invite recruiters, HR, and hiring managers to your workspace.
          </p>
        </div>
      </header>

      <TeamClient
        canManage={canManage}
        currentUserId={session.userId}
        initialMembers={members.map((m) => ({
          id: String(m._id),
          email: m.email,
          name: m.name,
          role: m.role as Role,
          emailVerified: m.emailVerified,
          lastLoginAt: m.lastLoginAt ? new Date(m.lastLoginAt).toISOString() : null,
          joinedAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
          roleLabel: ROLE_LABELS[m.role as Role],
        }))}
      />
    </div>
  );
}

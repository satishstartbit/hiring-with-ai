import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS, ROLE_LABELS } from "@/app/lib/auth/permissions";
import { InviteMemberSchema } from "@/app/lib/validation/auth";
import { connectDB } from "@/app/lib/db/connection";
import { User } from "@/app/lib/db/models/User";
import { Workspace } from "@/app/lib/db/models/Workspace";
import { hashPassword } from "@/app/lib/auth/password";
import { randomToken } from "@/app/lib/auth/slug";
import { sendTeamInviteEmail } from "@/app/lib/integrations/email";
import { ok, err, fromError } from "@/app/lib/api/response";

export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.TEAM_VIEW);
    await connectDB();
    const members = await User.find({
      workspaceId: session.workspaceId,
      deletedAt: null,
    })
      .select("_id email name role avatarUrl emailVerified lastLoginAt createdAt")
      .sort({ createdAt: 1 })
      .lean();
    return ok({
      members: members.map((m) => ({
        id: String(m._id),
        email: m.email,
        name: m.name,
        role: m.role,
        avatarUrl: m.avatarUrl,
        emailVerified: m.emailVerified,
        lastLoginAt: m.lastLoginAt,
        joinedAt: m.createdAt,
      })),
    });
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission(PERMISSIONS.TEAM_INVITE);
    const body = await req.json();
    const parsed = InviteMemberSchema.parse(body);
    await connectDB();

    const existing = await User.findOne({ email: parsed.email, deletedAt: null }).lean();
    if (existing) return err("email_taken", "User already exists", 409);

    const tempPassword = randomToken(8);
    const passwordHash = await hashPassword(tempPassword);
    const passwordResetToken = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const user = await User.create({
      email: parsed.email,
      name: parsed.name,
      role: parsed.role,
      passwordHash,
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      emailVerified: false,
      passwordResetToken,
      passwordResetTokenExpiresAt: expiresAt,
    });

    await Workspace.updateOne({ _id: session.workspaceId }, { $inc: { memberCount: 1 } });

    const [workspace, inviter] = await Promise.all([
      Workspace.findById(session.workspaceId).select("name").lean(),
      User.findById(session.userId).select("name").lean(),
    ]);

    const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const inviteUrl = `${appBase}/reset-password?token=${passwordResetToken}&invite=1`;

    const emailResult = await sendTeamInviteEmail({
      inviteeName: user.name,
      inviteeEmail: user.email,
      inviteeRoleLabel: ROLE_LABELS[user.role],
      inviterName: inviter?.name || session.email,
      workspaceName: workspace?.name || "your workspace",
      inviteUrl,
      expiresAt,
    });

    return ok({
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      tempPassword,
      passwordResetToken: user.passwordResetToken,
      inviteUrl,
      invite: {
        emailSent: emailResult.success,
        emailStubbed: emailResult.stubbed,
        emailError: emailResult.error ?? null,
      },
    });
  } catch (e) {
    return fromError(e);
  }
}

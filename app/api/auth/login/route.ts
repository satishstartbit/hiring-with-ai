import { NextRequest } from "next/server";
import { LoginSchema } from "@/app/lib/validation/auth";
import { connectDB } from "@/app/lib/db/connection";
import { User } from "@/app/lib/db/models/User";
import { Workspace } from "@/app/lib/db/models/Workspace";
import { verifyPassword } from "@/app/lib/auth/password";
import { createSession } from "@/app/lib/auth/session";
import { ok, err, fromError } from "@/app/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    const parsed = LoginSchema.parse(await req.json());
    await connectDB();
    const user = await User.findOne({ email: parsed.email, deletedAt: null });
    if (!user) return err("invalid_credentials", "Invalid email or password", 401);
    const valid = await verifyPassword(parsed.password, user.passwordHash);
    if (!valid) return err("invalid_credentials", "Invalid email or password", 401);
    const workspace = await Workspace.findOne({ _id: user.workspaceId, deletedAt: null }).lean();
    if (!workspace) return err("workspace_unavailable", "Workspace unavailable", 403);
    user.lastLoginAt = new Date();
    await user.save();
    await createSession({
      userId: String(user._id),
      companyId: String(user.companyId),
      workspaceId: String(user.workspaceId),
      workspaceSlug: workspace.slug,
      role: user.role,
      email: user.email,
    });
    return ok({
      userId: String(user._id),
      role: user.role,
      workspaceSlug: workspace.slug,
    });
  } catch (e) {
    return fromError(e);
  }
}

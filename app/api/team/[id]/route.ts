import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import { User } from "@/app/lib/db/models/User";
import { Workspace } from "@/app/lib/db/models/Workspace";
import { ok, err, fromError } from "@/app/lib/api/response";
import { z } from "zod";

const UpdateRoleSchema = z.object({
  role: z.enum(["company_admin", "recruiter", "hr_manager", "hiring_manager"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(PERMISSIONS.TEAM_INVITE);
    const { id } = await params;
    const parsed = UpdateRoleSchema.parse(await req.json());
    await connectDB();
    const target = await User.findOne({
      _id: id,
      workspaceId: session.workspaceId,
      deletedAt: null,
    });
    if (!target) return err("not_found", "Member not found", 404);
    if (String(target._id) === session.userId) {
      return err("self_modify_forbidden", "Cannot change your own role here", 400);
    }
    target.role = parsed.role;
    await target.save();
    return ok({ id: String(target._id), role: target.role });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(PERMISSIONS.TEAM_REMOVE);
    const { id } = await params;
    if (id === session.userId) {
      return err("self_modify_forbidden", "Cannot remove yourself", 400);
    }
    await connectDB();
    const result = await User.updateOne(
      { _id: id, workspaceId: session.workspaceId, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );
    if (result.matchedCount === 0) return err("not_found", "Member not found", 404);
    await Workspace.updateOne({ _id: session.workspaceId }, { $inc: { memberCount: -1 } });
    return ok({ removed: true });
  } catch (e) {
    return fromError(e);
  }
}

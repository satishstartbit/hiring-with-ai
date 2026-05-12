import { getCurrentWorkspaceContext, requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { UpdateBrandingSchema } from "@/app/lib/validation/auth";
import { connectDB } from "@/app/lib/db/connection";
import { Branding } from "@/app/lib/db/models/Branding";
import { ok, fromError } from "@/app/lib/api/response";

export async function GET() {
  try {
    const ctx = await getCurrentWorkspaceContext();
    await connectDB();
    const branding = await Branding.findOne({ workspaceId: ctx.workspace.id }).lean();
    return ok({ ...ctx, branding });
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requirePermission(PERMISSIONS.BRANDING_CONFIGURE);
    const parsed = UpdateBrandingSchema.parse(await req.json());
    await connectDB();
    const branding = await Branding.findOneAndUpdate(
      { workspaceId: session.workspaceId },
      { $set: parsed },
      { new: true, upsert: true }
    ).lean();
    return ok({ branding });
  } catch (e) {
    return fromError(e);
  }
}

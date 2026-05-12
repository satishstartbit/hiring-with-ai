import type { NextRequest } from "next/server";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import { verifySession, requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { JobDraftSchema } from "@/app/lib/validation/jobs";
import { ok, fromError } from "@/app/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await verifySession();
    await connectDB();
    const jobs = await Job.find({ workspaceId: session.workspaceId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return ok({ jobs });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission(PERMISSIONS.JOB_CREATE);
    const body = await request.json();
    const parsed = JobDraftSchema.parse(body);
    await connectDB();
    const job = await Job.create({
      ...parsed,
      status: "draft",
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      createdBy: session.userId,
    });
    return ok({ job }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

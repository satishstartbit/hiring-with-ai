import type { NextRequest } from "next/server";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import { verifySession } from "@/app/lib/auth/dal";
import { JobUpdateSchema } from "@/app/lib/validation/jobs";
import { ok, err, fromError } from "@/app/lib/api/response";

export const dynamic = "force-dynamic";

// Public read for the candidate-facing /jobs/[id] page.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const job = await Job.findById(id).lean();
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    return Response.json({ job });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    const { id } = await params;
    const parsed = JobUpdateSchema.parse(await request.json());
    await connectDB();
    const job = await Job.findOneAndUpdate(
      { _id: id, workspaceId: session.workspaceId },
      { $set: parsed },
      { new: true }
    ).lean();
    if (!job) return err("not_found", "Job not found in this workspace", 404);
    return ok({ job });
  } catch (e) {
    return fromError(e);
  }
}

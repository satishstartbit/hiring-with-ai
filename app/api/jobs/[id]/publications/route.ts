import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import { JobPublication } from "@/app/lib/db/models/JobPublication";
import { verifySession } from "@/app/lib/auth/dal";
import { ok, err, fromError } from "@/app/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifySession();
    const { id } = await params;
    await connectDB();
    const job = await Job.findOne({ _id: id, workspaceId: session.workspaceId })
      .select("_id title")
      .lean();
    if (!job) return err("not_found", "Job not found", 404);
    const publications = await JobPublication.find({
      jobId: job._id,
      workspaceId: session.workspaceId,
    })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
    return ok({ publications });
  } catch (e) {
    return fromError(e);
  }
}

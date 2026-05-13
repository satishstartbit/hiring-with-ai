import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import AssessmentConfig from "@/app/lib/db/models/AssessmentConfig";
import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { AssessmentConfigUpsertSchema } from "@/app/lib/validation/assessment";
import { ok, err, fromError } from "@/app/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission(PERMISSIONS.JOB_MANAGE);
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return err("invalid_id", "Invalid job ID", 400);

    await connectDB();
    const job = await Job.findOne({ _id: id, workspaceId: session.workspaceId })
      .select("_id title skills workspaceId companyId")
      .lean();
    if (!job) return err("not_found", "Job not found in this workspace", 404);

    const config = await AssessmentConfig.findOne({ jobId: id }).lean();

    return ok({
      job: {
        id: String(job._id),
        title: job.title,
        skills: job.skills ?? [],
      },
      config: config
        ? {
            ...config,
            _id: String(config._id),
            jobId: String(config.jobId),
            workspaceId: String(config.workspaceId),
            companyId: String(config.companyId),
          }
        : null,
    });
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission(PERMISSIONS.JOB_MANAGE);
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return err("invalid_id", "Invalid job ID", 400);

    const parsed = AssessmentConfigUpsertSchema.parse(await request.json());

    await connectDB();
    const job = await Job.findOne({ _id: id, workspaceId: session.workspaceId })
      .select("_id companyId workspaceId")
      .lean();
    if (!job) return err("not_found", "Job not found in this workspace", 404);

    const update: Record<string, unknown> = {
      ...parsed,
      lastEditedBy: session.userId,
    };
    if (parsed.isPublished) update.publishedAt = new Date();

    const config = await AssessmentConfig.findOneAndUpdate(
      { jobId: id },
      {
        $set: update,
        $setOnInsert: {
          jobId: id,
          workspaceId: job.workspaceId,
          companyId: job.companyId,
          createdBy: session.userId,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    return ok({
      config: {
        ...config,
        _id: String(config!._id),
        jobId: String(config!.jobId),
        workspaceId: String(config!.workspaceId),
        companyId: String(config!.companyId),
      },
    });
  } catch (e) {
    return fromError(e);
  }
}

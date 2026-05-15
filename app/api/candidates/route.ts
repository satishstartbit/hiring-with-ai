import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { readSession } from "@/app/lib/auth/session";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import {
  listWorkspaceCandidates,
  parseListParams,
} from "@/app/lib/candidates/passedCandidatesList";

export const dynamic = "force-dynamic";

/**
 * Workspace-scoped applicants list (all stages) with pagination, search, and sort.
 * Query: page, limit, q (search), sort, order, jobId (optional filter).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await readSession();
    if (!session?.userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.workspaceId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectDB();
    const { searchParams } = request.nextUrl;
    const { page, limit, search, sort, order } = parseListParams({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      q: searchParams.get("q") ?? searchParams.get("search") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });

    const jobId = searchParams.get("jobId");
    const jobQuery: Record<string, unknown> = { workspaceId: session.workspaceId };
    if (jobId && mongoose.isValidObjectId(jobId)) {
      jobQuery._id = new mongoose.Types.ObjectId(jobId);
    }

    const jobs = await Job.find(jobQuery).select("_id").lean();
    const jobIds = jobs.map((j) => j._id);

    if (jobIds.length === 0) {
      return Response.json({
        candidates: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        sort,
        order,
        search,
      });
    }

    const result = await listWorkspaceCandidates({
      jobIds,
      page,
      limit,
      search,
      sort,
      order,
    });

    return Response.json({
      candidates: result.candidates,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      sort: result.sort,
      order: result.order,
      search: result.search,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

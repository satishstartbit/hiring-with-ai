import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { readSession } from "@/app/lib/auth/session";
import { connectDB } from "@/app/lib/db/connection";
import { bufferFromMongo } from "@/app/lib/db/bufferFromMongo";
import Candidate from "@/app/lib/db/models/Candidate";
import Job from "@/app/lib/db/models/Job";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// HR-side image serving for proctoring snapshots captured during a candidate's
// quiz / AI interview. Workspace-scoped so only members of the workspace that
// owns the job can view the snapshots.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return new NextResponse("Invalid candidate ID", { status: 400 });
  }
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) {
    return new NextResponse("Invalid snapshot index", { status: 400 });
  }

  const session = await readSession();
  if (!session?.userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!session.workspaceId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await connectDB();
  // Do not use .lean() — nested Buffer subdocuments are unreliable when lean.
  const candidate = await Candidate.findById(id).select("jobId proctoringSnapshots");
  if (!candidate) {
    return new NextResponse("Candidate not found", { status: 404 });
  }

  const job = await Job.findOne({
    _id: candidate.jobId,
    workspaceId: session.workspaceId,
  })
    .select("_id")
    .lean();
  if (!job) {
    return new NextResponse("Not found", { status: 404 });
  }

  const snap = candidate.proctoringSnapshots?.[i];
  const bytes = bufferFromMongo(snap?.data);
  if (!bytes?.length) {
    return new NextResponse("Snapshot not found", { status: 404 });
  }

  const rawType = snap?.contentType ?? "image/jpeg";
  const contentType = rawType === "image/jpg" ? "image/jpeg" : rawType;

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

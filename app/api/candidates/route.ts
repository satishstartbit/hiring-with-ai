import type { NextRequest } from "next/server";
import { connectDB } from "../../lib/db/connection";
import Candidate from "../../lib/db/models/Candidate";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = request.nextUrl;

    const jobId = searchParams.get("jobId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search");

    const query: Record<string, unknown> = {};
    if (jobId && mongoose.isValidObjectId(jobId)) {
      query.jobId = new mongoose.Types.ObjectId(jobId);
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [candidates, total] = await Promise.all([
      Candidate.find(query)
        .select("-resumeData")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Candidate.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      candidates,
      total,
      page,
      totalPages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

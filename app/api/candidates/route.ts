import type { NextRequest } from "next/server";
import { connectDB } from "../../lib/db/connection";
import Candidate from "../../lib/db/models/Candidate";
import InterviewSession from "../../lib/db/models/InterviewSession";
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

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [rawCandidates, total] = await Promise.all([
      Candidate.find(query)
        .select("-resumeData")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Candidate.countDocuments(query),
    ]);

    // Attach highest completed interview score for each candidate
    type LeanSession = { candidateId: mongoose.Types.ObjectId; totalScore?: number };
    const ids = rawCandidates.map((c) => (c as { _id: mongoose.Types.ObjectId })._id);
    const sessions = (await InterviewSession.find({
      candidateId: { $in: ids },
      status: "completed",
    })
      .select("candidateId totalScore")
      .lean()) as unknown as LeanSession[];

    const scoreMap = new Map<string, number>();
    for (const s of sessions) {
      if (s.totalScore === undefined) continue;
      const cid = s.candidateId.toString();
      const existing = scoreMap.get(cid);
      if (existing === undefined || s.totalScore > existing) scoreMap.set(cid, s.totalScore);
    }

    const candidates = rawCandidates.map((c) => {
      const cid = (c as { _id: mongoose.Types.ObjectId })._id.toString();
      return { ...c, interviewScore: scoreMap.get(cid) };
    });

    return Response.json({
      candidates,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

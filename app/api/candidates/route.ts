import type { NextRequest } from "next/server";
import { connectDB } from "../../lib/db/connection";
import Candidate from "../../lib/db/models/Candidate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const jobId = request.nextUrl.searchParams.get("jobId");
    const query = jobId ? { jobId } : {};
    const candidates = await Candidate.find(query)
      .select("-resumeData")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return Response.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

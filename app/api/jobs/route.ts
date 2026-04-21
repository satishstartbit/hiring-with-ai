import type { NextRequest } from "next/server";
import { connectDB } from "../../lib/db/connection";
import Job from "../../lib/db/models/Job";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const jobs = await Job.find().sort({ createdAt: -1 }).limit(50).lean();
    return Response.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const job = await Job.create(body);
    return Response.json({ job }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import Job from "../../../../lib/db/models/Job";
import Candidate from "../../../../lib/db/models/Candidate";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!mongoose.isValidObjectId(id)) {
    return Response.json({ error: "Invalid job ID" }, { status: 400 });
  }

  try {
    await connectDB();

    const job = await Job.findById(id).lean();
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "active") {
      return Response.json({ error: "This job is no longer accepting applications" }, { status: 400 });
    }

    const formData = await request.formData();
    const name = (formData.get("name") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim().toLowerCase();
    const currentTitle = (formData.get("currentTitle") as string | null)?.trim();
    const currentCompany = (formData.get("currentCompany") as string | null)?.trim();
    const resumeFile = formData.get("resume") as File | null;

    if (!name || !email) {
      return Response.json({ error: "Name and email are required" }, { status: 400 });
    }

    // Check for duplicate application
    const existing = await Candidate.findOne({ jobId: id, email });
    if (existing) {
      return Response.json({ error: "You have already applied for this position" }, { status: 409 });
    }

    let resumeData: Buffer | undefined;
    let resumeFilename: string | undefined;
    let resumeContentType: string | undefined;

    if (resumeFile && resumeFile.size > 0) {
      if (resumeFile.size > 5 * 1024 * 1024) {
        return Response.json({ error: "Resume must be under 5 MB" }, { status: 400 });
      }
      resumeData = Buffer.from(await resumeFile.arrayBuffer());
      resumeFilename = resumeFile.name;
      resumeContentType = resumeFile.type;
    }

    const candidate = await Candidate.create({
      name,
      email,
      currentTitle: currentTitle || undefined,
      currentCompany: currentCompany || undefined,
      skills: [],
      jobId: new mongoose.Types.ObjectId(id),
      jobTitle: job.title,
      status: "applied",
      source: "website",
      resumeData,
      resumeFilename,
      resumeContentType,
      appliedAt: new Date(),
    });

    // Increment applicant count on the job
    await Job.findByIdAndUpdate(id, { $inc: { applicantCount: 1 } });

    return Response.json(
      {
        success: true,
        candidateId: candidate._id.toString(),
        message: "Application submitted successfully",
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

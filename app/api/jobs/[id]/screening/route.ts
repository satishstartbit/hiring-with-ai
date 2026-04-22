import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import Candidate from "../../../../lib/db/models/Candidate";
import Job from "../../../../lib/db/models/Job";
import { getGroqErrorMessage } from "../../../../lib/groq";
import { runMatchWorkflow } from "../../../../lib/workflow/screeningGraph";
import { sendResumeRejectedEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";

const MAX_RESUME_SIZE = 5 * 1024 * 1024;

function cleanResumeText(text: string): string {
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

async function getResumeText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const decoded = cleanResumeText(buffer.toString("utf8"));

  if (decoded.length >= 120) return decoded;

  return [
    `Resume filename: ${file.name}`,
    `Content type: ${file.type || "unknown"}`,
    `File size: ${file.size} bytes`,
    "Text extraction failed — evaluate based on filename and candidate details only.",
  ].join("\n");
}

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
      return Response.json(
        { error: "This job is no longer accepting applications" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const name = (formData.get("name") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim().toLowerCase();
    const currentTitle = (formData.get("currentTitle") as string | null)?.trim();
    const resumeFile = formData.get("resume") as File | null;

    if (!name || !email) {
      return Response.json({ error: "Name and email are required" }, { status: 400 });
    }
    if (!resumeFile || resumeFile.size === 0) {
      return Response.json({ error: "Resume is required before AI screening" }, { status: 400 });
    }
    if (resumeFile.size > MAX_RESUME_SIZE) {
      return Response.json({ error: "Resume must be under 5 MB" }, { status: 400 });
    }

    const existing = await Candidate.findOne({ jobId: id, email });
    if (existing) {
      return Response.json(
        { error: "You have already applied for this position" },
        { status: 409 }
      );
    }

    const resumeText = await getResumeText(resumeFile);

    const result = await runMatchWorkflow({
      jobTitle: job.title,
      jobDescription: job.description,
      jobRequirements: job.requirements ?? [],
      jobDepartment: job.department,
      candidateName: name,
      candidateTitle: currentTitle ?? "",
      resumeText,
    });

    console.log(`result`,result);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    if (!result.matched) {
      sendResumeRejectedEmail({
        to: email,
        candidateName: name,
        jobTitle: job.title,
        matchScore: result.matchScore,
        matchReason: result.matchReason,
      }).catch((err) => console.error("[email] resume rejected send failed:", err));
      return Response.json({
        matched: false,
        score: result.matchScore,
        reason: result.matchReason,
      });
    }

    return Response.json({
      matched: true,
      score: result.matchScore,
      reason: result.matchReason,
    });
  } catch (err) {
    const message = getGroqErrorMessage(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

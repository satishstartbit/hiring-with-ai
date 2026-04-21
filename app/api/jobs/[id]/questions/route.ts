import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import Job from "../../../../lib/db/models/Job";
import { getGroqErrorMessage } from "../../../../lib/groq";
import { runQuestionsWorkflow } from "../../../../lib/workflow/screeningGraph";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
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

    const result = await runQuestionsWorkflow({
      jobTitle: job.title,
      jobDescription: job.description,
      jobRequirements: job.requirements ?? [],
      jobDepartment: job.department,
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({
      questions: result.questions,
      timeLimitSeconds: result.timeLimitSeconds,
    });
  } catch (err) {
    const message = getGroqErrorMessage(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

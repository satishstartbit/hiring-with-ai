import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import Job from "../../../../lib/db/models/Job";
import AssessmentConfig from "../../../../lib/db/models/AssessmentConfig";
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
    if (job.status !== "active" && job.status !== "ai_generated") {
      return Response.json(
        { error: "This job is no longer accepting applications" },
        { status: 400 }
      );
    }

    // Pick up HR's "Configure the AI assessment" settings if they've published
    // one. Unpublished or missing configs fall back to the workflow's defaults
    // so candidates aren't blocked on jobs that pre-date the feature.
    const config = await AssessmentConfig.findOne({ jobId: id }).lean();
    const configOverrides =
      config && config.isPublished
        ? {
            difficulty: config.difficulty,
            skills: config.skills,
            enabledQuestionTypes: config.enabledQuestionTypes,
            questionCount: config.questionCount,
            questionCountMode: config.questionCountMode,
            durationMinutes: config.durationMinutes,
          }
        : {};

    const result = await runQuestionsWorkflow({
      jobTitle: job.title,
      jobDescription: job.description,
      jobRequirements: job.requirements ?? [],
      jobDepartment: job.department,
      ...configOverrides,
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

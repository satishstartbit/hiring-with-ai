import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { generateJobContent } from "@/app/lib/ai/jobGeneration";
import { ok, err, fromError } from "@/app/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(PERMISSIONS.JOB_CREATE);
    const { id } = await params;
    await connectDB();
    const job = await Job.findOne({ _id: id, workspaceId: session.workspaceId });
    if (!job) return err("not_found", "Job not found", 404);

    const generated = await generateJobContent({
      title: job.title,
      department: job.department,
      location: job.location,
      workMode: job.workMode,
      employmentType: job.type,
      experienceRequired: job.experienceRequired,
      numberOfOpenings: job.numberOfOpenings,
      skills: job.skills,
      salary: job.salary,
      interviewRounds: job.interviewRounds.map((r) => ({ name: r.name, type: r.type })),
      description: job.description,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      preferredQualifications: job.preferredQualifications,
    });

    job.description = generated.description;
    job.responsibilities = generated.responsibilities;
    job.requirements = generated.requirements;
    job.preferredQualifications = generated.preferredQualifications;
    job.screeningQuestions = generated.screeningQuestions;
    job.suggestedSkills = generated.suggestedSkills;
    job.interviewProcessSummary = generated.interviewProcessSummary;
    job.status = "ai_generated";
    job.aiGeneratedAt = new Date();
    await job.save();

    return ok({ job: job.toObject() });
  } catch (e) {
    return fromError(e);
  }
}

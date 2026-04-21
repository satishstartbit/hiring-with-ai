import { connectDB } from "../../db/connection";
import Job from "../../db/models/Job";
import WorkflowRun from "../../db/models/WorkflowRun";
import type { HiringState } from "../state";

export async function postJobNode(
  state: HiringState
): Promise<Partial<HiringState>> {
  const steps = state.steps.map((s) =>
    s.name === "Post Job" ? { ...s, status: "running" as const } : s
  );

  try {
    await connectDB();

    const job = await Job.create({
      title: state.jobTitle ?? state.role,
      department: state.department,
      description: state.jobDescription,
      requirements: state.requirements ?? [],
      location: state.location,
      type: state.jobType as "full-time" | "part-time" | "contract" | "remote",
      status: "active",
      workflowRunId: state.workflowRunId,
      postedAt: new Date(),
    });

    await WorkflowRun.findByIdAndUpdate(state.workflowRunId, {
      jobId: job._id,
      analyzedRole: state.role,
      analyzedDepartment: state.department,
    });

    return {
      jobId: job._id.toString(),
      steps: steps.map((s) =>
        s.name === "Post Job"
          ? {
              ...s,
              status: "completed" as const,
              output: `Published: ${job.title}`,
            }
          : s
      ),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      error,
      steps: steps.map((s) =>
        s.name === "Post Job"
          ? { ...s, status: "failed" as const, error }
          : s
      ),
    };
  }
}

import { connectDB } from "../../db/connection";
import WorkflowRun from "../../db/models/WorkflowRun";
import type { HiringState } from "../state";

export async function trackCandidatesNode(
  state: HiringState
): Promise<Partial<HiringState>> {
  const steps = state.steps.map((s) =>
    s.name === "Open for Applications" ? { ...s, status: "running" as const } : s
  );

  try {
    await connectDB();

    const completedSteps = steps.map((s) =>
      s.name === "Open for Applications"
        ? {
            ...s,
            status: "completed" as const,
            output: "Job is live - candidates can now apply",
          }
        : s
    );

    await WorkflowRun.findByIdAndUpdate(state.workflowRunId, {
      status: "completed",
      steps: completedSteps,
    });

    return { steps: completedSteps };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      error,
      steps: steps.map((s) =>
        s.name === "Open for Applications"
          ? { ...s, status: "failed" as const, error }
          : s
      ),
    };
  }
}

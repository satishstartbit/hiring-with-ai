import { connectDB } from "../../lib/db/connection";
import Job from "../../lib/db/models/Job";
import Candidate from "../../lib/db/models/Candidate";
import WorkflowRun from "../../lib/db/models/WorkflowRun";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();

    const [
      totalJobs,
      activeJobs,
      filledJobs,
      totalCandidates,
      interviewingCandidates,
      hiredCandidates,
      totalWorkflows,
      completedWorkflows,
      recentJobs,
    ] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ status: "active" }),
      Job.countDocuments({ status: "filled" }),
      Candidate.countDocuments(),
      Candidate.countDocuments({ status: "interviewing" }),
      Candidate.countDocuments({ status: "hired" }),
      WorkflowRun.countDocuments(),
      WorkflowRun.countDocuments({ status: "completed" }),
      Job.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const interviewRate =
      totalCandidates > 0
        ? Math.round((interviewingCandidates / totalCandidates) * 100)
        : 0;

    return Response.json({
      jobs: { total: totalJobs, active: activeJobs, filled: filledJobs },
      candidates: {
        total: totalCandidates,
        interviewing: interviewingCandidates,
        hired: hiredCandidates,
        interviewRate,
      },
      workflows: { total: totalWorkflows, completed: completedWorkflows },
      recentJobs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

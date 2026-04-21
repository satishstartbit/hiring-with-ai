import { connectDB } from "../../lib/db/connection";
import WorkflowRun from "../../lib/db/models/WorkflowRun";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const workflows = await WorkflowRun.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    return Response.json({ workflows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

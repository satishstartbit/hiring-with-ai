import type { NextRequest } from "next/server";
import { runHiringWorkflow } from "../../lib/workflow/graph";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userRequest } = await request.json();

    if (!userRequest || typeof userRequest !== "string" || !userRequest.trim()) {
      return Response.json(
        { error: "userRequest is required" },
        { status: 400 }
      );
    }
    console.log("Received user request:", userRequest);
    const result = await runHiringWorkflow(userRequest.trim());

    return Response.json({
      success: !result.error,
      ...result,
    });
  } catch (err) {
    console.error("Error in POST /hiring:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

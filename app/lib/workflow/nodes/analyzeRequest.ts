import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM, getGroqErrorMessage } from "../../groq";
import type { HiringState } from "../state";

const AnalysisSchema = z.object({
  role: z.string().describe("Exact job title, e.g. Senior Backend Engineer"),
  department: z.string().describe("Department, e.g. Engineering, Marketing"),
  location: z.string().default("Remote").describe("Location preference"),
  jobType: z
    .enum(["full-time", "part-time", "contract", "remote"])
    .default("full-time"),
  requirements: z
    .array(z.string())
    .describe("Key skills and requirements, 3-6 items"),
  immediateJoining: z.boolean().optional(),
  joiningDays: z.number().optional(),
});

export async function analyzeRequestNode(
  state: HiringState
): Promise<Partial<HiringState>> {
  const steps = state.steps.map((s) =>
    s.name === "Analyze Request" ? { ...s, status: "running" as const } : s
  );

  try {
    const llm = createLLM();
    const structured = llm.withStructuredOutput(AnalysisSchema, {
      name: "analyze_hiring_request",
      strict: false,
    });

    const result = await structured.invoke([
      new SystemMessage(
        "You are an expert HR analyst. Extract structured hiring intent from user requests."
      ),
      new HumanMessage(
        `Analyze this hiring request and extract structured information:\n\n"${state.userRequest}"`
      ),
    ]);
    console.log("Analysis result:", result);
    return {
      role: result.role,
      department: result.department,
      location: result.location,
      jobType: result.jobType,
      requirements: result.requirements,
      steps: steps.map((s) =>
        s.name === "Analyze Request"
          ? {
            ...s,
            status: "completed" as const,
            output: `${result.role} · ${result.department}`,
          }
          : s
      ),
    };
  } catch (err) {

    console.log("Error in analyzeRequestNode:", err);
    const error = getGroqErrorMessage(err);
    return {
      error,
      steps: steps.map((s) =>
        s.name === "Analyze Request"
          ? { ...s, status: "failed" as const, error }
          : s
      ),
    };
  }
}

import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM, getGroqErrorMessage } from "../../groq";
import { traceable } from "langsmith/traceable";
import type { HiringState } from "../state";

const AnalysisSchema = z.object({
  role: z.string().nullable().transform((v) => v ?? ""),
  department: z.string().nullable().transform((v) => v ?? "General"),
  location: z.string().nullable().transform((v) => v ?? "Remote"),
  jobType: z
    .enum(["full-time", "part-time", "contract", "remote"])
    .nullable()
    .transform((v) => v ?? "full-time"),
  requirements: z.array(z.string()).nullable().transform((v) => v ?? []),
  immediateJoining: z.boolean().nullable().optional().transform((v) => v ?? undefined),
  joiningDays: z.number().nullable().optional().transform((v) => v ?? undefined),
});

export const analyzeRequestNode = traceable(
  async (state: HiringState): Promise<Partial<HiringState>> => {
  const steps = state.steps.map((s) =>
    s.name === "Analyze Request" ? { ...s, status: "running" as const } : s
  );

  try {
    const llm = createLLM();

    const response = await llm.invoke([
      new SystemMessage(
        [
          "You are an expert HR analyst. Extract structured hiring intent from user requests.",
          "",
          'Output ONLY valid JSON with no markdown fences: {"role":"...","department":"...","location":"...","jobType":"full-time|part-time|contract|remote","requirements":["..."],"immediateJoining":true|false,"joiningDays":<number or null>}',
        ].join("\n")
      ),
      new HumanMessage(
        `Analyze this hiring request and extract structured information:\n\n"${state.userRequest}"`
      ),
    ]);

    const rawText = typeof response.content === "string" ? response.content : "";
    const jsonMatch = /\{[\s\S]*\}/.exec(rawText);
    const result = AnalysisSchema.parse(JSON.parse(jsonMatch ? jsonMatch[0] : rawText));
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
  },
  { name: "analyze_request", run_type: "chain", tags: ["hiring"] }
) as (state: HiringState) => Promise<Partial<HiringState>>;

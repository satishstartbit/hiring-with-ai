import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM, getGroqErrorMessage } from "../../groq";
import { webSearch } from "../../tavily";
import type { HiringState } from "../state";

const JDSchema = z.object({
  title: z.string().describe("Official job title"),
  description: z
    .string()
    .describe(
      "Full job description: 3-4 paragraphs covering overview, responsibilities, requirements, and benefits"
    ),
});

export async function generateJobDescriptionNode(
  state: HiringState
): Promise<Partial<HiringState>> {
  const steps = state.steps.map((s) =>
    s.name === "Generate Job Description"
      ? { ...s, status: "running" as const }
      : s
  );

  try {
    const marketContext = await webSearch(
      `${state.role} ${state.jobType} job description skills requirements 2024`,
      4
    );

    const llm = createLLM();
    const structured = llm.withStructuredOutput(JDSchema, {
      name: "generate_job_description",
    });

    const marketSection = marketContext
      ? `\n\nCurrent market context (use to write an accurate, realistic JD):\n${marketContext}`
      : "";

    const result = await structured.invoke([
      new SystemMessage(
        "You are an expert technical recruiter who writes compelling, inclusive job descriptions. Use any market context provided to reflect current industry standards and realistic skill requirements."
      ),
      new HumanMessage(`Write a complete job description for the following role:

Role: ${state.role}
Department: ${state.department}
Location: ${state.location}
Employment type: ${state.jobType}
Key requirements: ${(state.requirements ?? []).join(", ")}${marketSection}`),
    ]);

    return {
      jobTitle: result.title,
      jobDescription: result.description,
      steps: steps.map((s) =>
        s.name === "Generate Job Description"
          ? {
              ...s,
              status: "completed" as const,
              output: `Generated JD: ${result.title}`,
            }
          : s
      ),
    };
  } catch (err) {
    const error = getGroqErrorMessage(err);
    return {
      error,
      steps: steps.map((s) =>
        s.name === "Generate Job Description"
          ? { ...s, status: "failed" as const, error }
          : s
      ),
    };
  }
}

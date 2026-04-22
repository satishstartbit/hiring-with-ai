import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM, getGroqErrorMessage } from "../../groq";
import { webSearch } from "../../tavily";
import { traceable } from "langsmith/traceable";
import type { HiringState } from "../state";

export const generateJobDescriptionNode = traceable(
  async (state: HiringState): Promise<Partial<HiringState>> => {
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

      const marketSection = marketContext
        ? `\n\nCurrent market context (use to write an accurate, realistic JD):\n${marketContext}`
        : "";

      const result = await llm.invoke([
        new SystemMessage(
          "You are an expert technical recruiter who writes compelling, inclusive job descriptions. " +
          "Write only the job description body — no title header, no markdown headings. " +
          "Use any market context provided to reflect current industry standards and realistic skill requirements."
        ),
        new HumanMessage(`Write a complete job description (3-4 paragraphs) for the following role:

Role: ${state.role}
Department: ${state.department}
Location: ${state.location}
Employment type: ${state.jobType}
Key requirements: ${(state.requirements ?? []).join(", ")}${marketSection}`),
      ]);

      const jobDescription =
        typeof result.content === "string" ? result.content.trim() : "";

      return {
        jobTitle: state.role,
        jobDescription,
        steps: steps.map((s) =>
          s.name === "Generate Job Description"
            ? {
                ...s,
                status: "completed" as const,
                output: `Generated JD: ${state.role}`,
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
  },
  { name: "generate_job_description", run_type: "chain", tags: ["hiring"] }
);

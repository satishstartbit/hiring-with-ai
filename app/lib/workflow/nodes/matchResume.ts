import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { traceable } from "langsmith/traceable";
import type { ScreeningState } from "../screeningState";

const ACCEPT_THRESHOLD = 60;

const MatchSchema = z.object({
  score: z.number().min(0).max(100).describe(
    "Match score 0-100. Award generously: 60+ means the candidate meets most key requirements and should proceed to screening."
  ),
  reason: z.string().describe("2-3 sentence explanation covering strengths and any gaps"),
});

export const matchResumeNode = traceable(
  async (state: ScreeningState): Promise<Partial<ScreeningState>> => {
  try {
    const llm = createLLM();

    const response = await llm.invoke([
      new SystemMessage(
        [
          "You are a fair and balanced hiring evaluator scoring resume-to-job fit.",
          "Score generously: if a candidate's background aligns with the majority of the key requirements, award 60 or above.",
          "Only score below 60 if the candidate is clearly from an unrelated field or severely underqualified for every listed requirement.",
          "Partial matches, adjacent experience, or transferable skills should push the score toward 60-80.",
          "If resume text looks like garbled binary, rely on the candidate title and filename — do not fabricate or penalise unfairly.",
          "",
          'Output ONLY valid JSON with no markdown fences: {"score":<number 0-100>,"reason":"<2-3 sentences>"}',
        ].join(" ")
      ),
      new HumanMessage(
        [
          `Job title: ${state.jobTitle}`,
          `Department: ${state.jobDepartment}`,
          `Requirements: ${state.jobRequirements.join(", ")}`,
          `Job description: ${state.jobDescription.slice(0, 800)}`,
          "",
          `Candidate name: ${state.candidateName}`,
          `Current title: ${state.candidateTitle || "Not provided"}`,
          "",
          `Resume (extracted text): ${state.resumeText}`,
        ].join("\n")
      ),
    ]);

    const rawText = typeof response.content === "string" ? response.content : "";
    const jsonStr = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const result = MatchSchema.parse(JSON.parse(jsonStr));

    // Score ≥ 60 is the acceptance rule regardless of any LLM boolean flag
    const isMatch = result.score >= ACCEPT_THRESHOLD;

    return {
      isMatch,
      matchScore: result.score,
      matchReason: result.reason,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  },
  { name: "match_resume", run_type: "chain", tags: ["screening"] }
) as (state: ScreeningState) => Promise<Partial<ScreeningState>>;

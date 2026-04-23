import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { traceable } from "langsmith/traceable";
import type { InterviewState } from "../interviewState";

const GradeSchema = z.object({
  questionScores: z.array(z.number().min(0).max(10))
    .describe("Score 0-10 per question answer, same order as questions"),
  questionFeedback: z.array(z.string())
    .describe("One sentence of feedback per answer, same order as questions"),
  overallFeedback: z.string()
    .describe("2-3 sentence holistic assessment of the candidate"),
});

export const gradeInterviewNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const llm = createLLM();

      const qAndA = state.questions
        .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${state.answers[i] ?? "(no answer)"}`)
        .join("\n\n");

      const response = await llm.invoke([
        new SystemMessage(
          [
            "You are a hiring evaluator grading a mock interview for a technical role.",
            "",
            "Score each answer 0-10:",
            "0-2  Empty, irrelevant, or completely off-topic",
            "3-4  Very vague, surface-level only",
            "5-6  Adequate, some relevant experience shown",
            "7-8  Good, clear understanding with specific details",
            "9-10 Excellent, demonstrates deep expertise",
            "",
            "Return arrays of the same length as the number of questions.",
            "",
            'Output ONLY valid JSON with no markdown fences: {"questionScores":[<0-10>,...],"questionFeedback":["<sentence>",...],"overallFeedback":"<2-3 sentences>"}',
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job: ${state.jobTitle}`,
            `Requirements: ${state.jobRequirements.join(", ")}`,
            "",
            qAndA,
          ].join("\n")
        ),
      ]);

      const rawText = typeof response.content === "string" ? response.content : "";
      const jsonStr = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
      const result = GradeSchema.parse(JSON.parse(jsonStr));

      const count = state.questions.length;
      const questionScores = Array.from({ length: count }, (_, i) =>
        typeof result.questionScores[i] === "number" ? Math.round(result.questionScores[i]) : 0
      );
      const totalScore = Math.round(
        (questionScores.reduce((a, b) => a + b, 0) / (count * 10)) * 100
      );

      return {
        questionScores,
        questionFeedback: Array.from({ length: count }, (_, i) => result.questionFeedback[i] ?? ""),
        overallFeedback: result.overallFeedback,
        totalScore,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  { name: "grade_interview", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

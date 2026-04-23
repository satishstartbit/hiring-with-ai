import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { traceable } from "langsmith/traceable";
import type { GradingState } from "../gradingState";

const GradingSchema = z.object({
  questionScores: z
    .array(z.number().min(0).max(10))
    .describe("Score 0-10 for each answer, in the same order as the questions"),
  questionFeedback: z
    .array(z.string())
    .describe("One concise sentence of feedback per answer, in the same order"),
  totalScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall score 0-100: round(sum(scores) / (count × 10) × 100)"),
  overallFeedback: z
    .string()
    .describe("2-3 sentence holistic assessment of the candidate's answers"),
});

export const gradeAnswersNode = traceable(
  async (state: GradingState): Promise<Partial<GradingState>> => {
  try {
    const llm = createLLM();

    const qAndA = state.questions
      .map(
        (q, i) =>
          `Q${i + 1}: ${q}\nA${i + 1}: ${state.answers[i]?.trim() || "(no answer provided)"}`
      )
      .join("\n\n");

    const response = await llm.invoke([
      new SystemMessage(
        [
          "You are a technical hiring evaluator grading candidate screening answers.",
          "",
          "Scoring per question (integer 0-10):",
          "0-2  No relevant knowledge, empty or nonsensical answer",
          "3-4  Vague, surface-level awareness only",
          "5-6  Adequate, some relevant experience or reasoning shown",
          "7-8  Good, clear understanding with specific and relevant details",
          "9-10 Excellent, demonstrates deep expertise or exceptional reasoning",
          "",
          "Rules:",
          "• Return arrays whose length exactly matches the number of questions.",
          "• totalScore = round(sum(questionScores) / (count × 10) × 100)",
          "• Be objective and consistent across all answers.",
          "",
          'Output ONLY valid JSON with no markdown fences: {"questionScores":[<0-10>,...],"questionFeedback":["<sentence>",...],"totalScore":<0-100>,"overallFeedback":"<2-3 sentences>"}',
        ].join("\n")
      ),
      new HumanMessage(
        [
          `Job title: ${state.jobTitle}`,
          `Key requirements: ${state.jobRequirements.join(", ")}`,
          "",
          "Questions and candidate answers:",
          qAndA,
        ].join("\n")
      ),
    ]);

    const rawText = typeof response.content === "string" ? response.content : "";
    const jsonMatch = /\{[\s\S]*\}/.exec(rawText);
    const result = GradingSchema.parse(JSON.parse(jsonMatch ? jsonMatch[0] : rawText));

    const count = state.questions.length;

    // Ensure array lengths match question count — truncate or pad with 0
    const questionScores = Array.from({ length: count }, (_, i) =>
      typeof result.questionScores[i] === "number" ? Math.round(result.questionScores[i]) : 0
    );
    const questionFeedback = Array.from({ length: count }, (_, i) =>
      result.questionFeedback[i] ?? "No feedback"
    );

    // Recompute totalScore from the validated scores
    const totalScore = Math.round(
      (questionScores.reduce((a, b) => a + b, 0) / (count * 10)) * 100
    );

    return {
      questionScores,
      questionFeedback,
      totalScore,
      overallFeedback: result.overallFeedback,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  },
  { name: "grade_answers", run_type: "chain", tags: ["grading"] }
) as (state: GradingState) => Promise<Partial<GradingState>>;

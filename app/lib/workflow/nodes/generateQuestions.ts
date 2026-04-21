import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { webSearch } from "../../tavily";
import type { ScreeningQuestion, ScreeningState } from "../screeningState";

const MCQ_COUNT = 8;
const DESC_COUNT = 2;

const QuestionsSchema = z.object({
  mcqQuestions: z
    .array(
      z.object({
        question: z.string().describe("The question text"),
        options: z
          .tuple([z.string(), z.string(), z.string(), z.string()])
          .describe("Exactly 4 answer options"),
        correctIndex: z
          .number()
          .min(0)
          .max(3)
          .describe("0-based index of the correct option (0=A, 1=B, 2=C, 3=D)"),
      })
    )
    .describe(`Exactly ${MCQ_COUNT} multiple-choice questions`),
  descriptiveQuestions: z
    .array(z.string())
    .describe(`Exactly ${DESC_COUNT} open-ended descriptive questions`),
});

export async function generateQuestionsNode(
  state: ScreeningState
): Promise<Partial<ScreeningState>> {
  try {
    const searchContext = await webSearch(
      `${state.jobTitle} ${state.jobDepartment} technical interview questions`,
      3
    );

    const llm = createLLM();
    const structured = llm.withStructuredOutput(QuestionsSchema, {
      name: "generate_screening_questions",
    });

    const searchSection = searchContext
      ? `\n\nWeb context (use as inspiration for realistic questions):\n${searchContext}`
      : "";

    const result = await structured.invoke([
      new SystemMessage(
        [
          `Generate exactly ${MCQ_COUNT} multiple-choice questions and ${DESC_COUNT} open-ended descriptive questions for this job role.`,
          "",
          `MCQ rules (${MCQ_COUNT} questions):`,
          "• Each MCQ has exactly 4 options.",
          "• Exactly one option is correct — set correctIndex to its 0-based position.",
          "• Test factual knowledge, best practices, or role-specific technical concepts.",
          "• All 4 options must be plausible but only one is unambiguously correct.",
          "",
          `Descriptive rules (${DESC_COUNT} questions):`,
          "• Open-ended, requiring a written paragraph answer.",
          "• Test real-world experience, problem-solving, or behavioral scenarios for this role.",
          "• Each is a single sentence ending with '?'.",
        ].join("\n")
      ),
      new HumanMessage(
        [
          `Job title: ${state.jobTitle}`,
          `Department: ${state.jobDepartment}`,
          `Requirements: ${state.jobRequirements.join(", ")}`,
          `Job description: ${state.jobDescription.slice(0, 2000)}`,
          searchSection,
        ].join("\n")
      ),
    ]);

    if (result.mcqQuestions.length < MCQ_COUNT) {
      return { error: `AI generated only ${result.mcqQuestions.length}/${MCQ_COUNT} MCQ questions. Please try again.` };
    }
    if (result.descriptiveQuestions.length < DESC_COUNT) {
      return { error: `AI generated only ${result.descriptiveQuestions.length}/${DESC_COUNT} descriptive questions. Please try again.` };
    }

    const questions: ScreeningQuestion[] = [
      ...result.mcqQuestions.slice(0, MCQ_COUNT).map(
        (q): ScreeningQuestion => ({
          type: "mcq",
          text: q.question.trim(),
          options: q.options as [string, string, string, string],
          correctIndex: q.correctIndex,
        })
      ),
      ...result.descriptiveQuestions.slice(0, DESC_COUNT).map(
        (q): ScreeningQuestion => ({ type: "descriptive", text: q.trim() })
      ),
    ];

    return { questions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

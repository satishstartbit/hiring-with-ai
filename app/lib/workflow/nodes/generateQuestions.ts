import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { webSearch } from "../../tavily";
import type { ScreeningQuestion, ScreeningState } from "../screeningState";

const MCQ_COUNT = 8;
const DESC_COUNT = 2;

// Permissive schema — exact counts validated manually after parsing
const QuestionsSchema = z.object({
  mcqQuestions: z.array(
    z.object({
      question: z.string().min(5),
      options: z.array(z.string().min(1)).min(4),
      correctIndex: z.number().min(0).max(3),
    })
  ).min(1),
  descriptiveQuestions: z.array(z.string().min(5)).min(1),
});

function normalizeQuestionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeOptionText(option: string): string {
  return option.replace(/^[A-D][).:-]\s*/i, "").replace(/\s+/g, " ").trim();
}

export const generateQuestionsNode = traceable(
  async (state: ScreeningState): Promise<Partial<ScreeningState>> => {
    try {
      const searchContext = await webSearch(
        `${state.jobTitle} ${state.jobDepartment} technical interview questions`,
        3
      );

      const llm = createLLM();

      const searchSection = searchContext
        ? `\n\nWeb context (use as inspiration for realistic questions):\n${searchContext}`
        : "";

      const response = await llm.invoke([
        new SystemMessage(
          [
            `Generate exactly ${MCQ_COUNT} multiple-choice questions and ${DESC_COUNT} open-ended descriptive questions for this job role.`,
            "",
            `MCQ rules (${MCQ_COUNT} questions):`,
            "- Each MCQ has exactly 4 options.",
            "- Exactly one option is correct - set correctIndex to its 0-based position (0=A, 1=B, 2=C, 3=D).",
            "- Test factual knowledge, best practices, or role-specific technical concepts.",
            "- All 4 options must be plausible but only one is unambiguously correct.",
            "- Keep options concise and avoid repeating the same meaning in different words.",
            `- Return exactly ${MCQ_COUNT} MCQs. Do not generate extras, alternatives, or duplicate questions.`,
            "",
            `Descriptive rules (${DESC_COUNT} questions):`,
            "- Open-ended, requiring a written paragraph answer.",
            "- Test real-world experience, problem-solving, or behavioral scenarios for this role.",
            '- Each question must be a single sentence ending with "?".',
            `- Return exactly ${DESC_COUNT} descriptive questions and stop.`,
            "",
            "Output ONLY valid JSON with no markdown fences and no extra text:",
            `{"mcqQuestions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0}],"descriptiveQuestions":["...?"]}`,
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

      const rawText = typeof response.content === "string" ? response.content : "";
      const jsonMatch = /\{[\s\S]*\}/.exec(rawText);
      const result = QuestionsSchema.parse(JSON.parse(jsonMatch ? jsonMatch[0] : rawText));

      if (result.descriptiveQuestions.length < DESC_COUNT) {
        return {
          error: `AI generated only ${result.descriptiveQuestions.length}/${DESC_COUNT} descriptive questions. Please try again.`,
        };
      }

      const validMcq = result.mcqQuestions
        .map((question) => ({
          question: normalizeQuestionText(question.question),
          options: question.options.map(normalizeOptionText).filter(Boolean),
          correctIndex: Math.min(Math.max(Math.round(question.correctIndex), 0), 3),
        }))
        .filter(
          (question) =>
            question.question.length > 0 &&
            question.options.length >= 4 &&
            new Set(question.options.slice(0, 4).map((option) => option.toLowerCase())).size === 4
        )
        .slice(0, MCQ_COUNT);

      if (validMcq.length < MCQ_COUNT) {
        return {
          error: `AI generated only ${validMcq.length}/${MCQ_COUNT} valid MCQ questions. Please try again.`,
        };
      }

      const questions: ScreeningQuestion[] = [
        ...validMcq.map(
          (question): ScreeningQuestion => ({
            type: "mcq",
            text: question.question,
            options: question.options.slice(0, 4) as [string, string, string, string],
            correctIndex: question.correctIndex,
          })
        ),
        ...result.descriptiveQuestions.slice(0, DESC_COUNT).map(
          (question): ScreeningQuestion => ({
            type: "descriptive",
            text: normalizeQuestionText(question),
          })
        ),
      ];

      return { questions };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  { name: "generate_questions", run_type: "chain", tags: ["screening"] }
) as (state: ScreeningState) => Promise<Partial<ScreeningState>>;

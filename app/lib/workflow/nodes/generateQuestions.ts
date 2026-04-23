import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { webSearch } from "../../tavily";
import { traceable } from "langsmith/traceable";
import type { ScreeningQuestion, ScreeningState } from "../screeningState";

const MCQ_COUNT = 8;
const DESC_COUNT = 2;

const QuestionsSchema = z.object({
  mcqQuestions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number().min(0).max(3),
    })
  ),
  descriptiveQuestions: z.array(z.string()),
});

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
          "• Each MCQ has exactly 4 options.",
          "• Exactly one option is correct — set correctIndex to its 0-based position (0=A, 1=B, 2=C, 3=D).",
          "• Test factual knowledge, best practices, or role-specific technical concepts.",
          "• All 4 options must be plausible but only one is unambiguously correct.",
          "",
          `Descriptive rules (${DESC_COUNT} questions):`,
          "• Open-ended, requiring a written paragraph answer.",
          "• Test real-world experience, problem-solving, or behavioral scenarios for this role.",
          "• Each is a single sentence ending with '?'.",
          "",
          "Output ONLY valid JSON with no markdown fences, no extra text. Use this exact structure:",
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
    // Strip markdown code fences if the model wraps the output
    const jsonStr = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const result = QuestionsSchema.parse(JSON.parse(jsonStr));

    if (result.descriptiveQuestions.length < DESC_COUNT) {
      return { error: `AI generated only ${result.descriptiveQuestions.length}/${DESC_COUNT} descriptive questions. Please try again.` };
    }

    const validMcq = result.mcqQuestions
      .filter((q) => Array.isArray(q.options) && q.options.length >= 4)
      .slice(0, MCQ_COUNT);

    if (validMcq.length < MCQ_COUNT) {
      return { error: `AI generated only ${validMcq.length}/${MCQ_COUNT} valid MCQ questions. Please try again.` };
    }

    const questions: ScreeningQuestion[] = [
      ...validMcq.map(
        (q): ScreeningQuestion => ({
          type: "mcq",
          text: q.question.trim(),
          options: q.options.slice(0, 4) as [string, string, string, string],
          correctIndex: Math.min(q.correctIndex, 3),
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
  },
  { name: "generate_questions", run_type: "chain", tags: ["screening"] }
) as (state: ScreeningState) => Promise<Partial<ScreeningState>>;

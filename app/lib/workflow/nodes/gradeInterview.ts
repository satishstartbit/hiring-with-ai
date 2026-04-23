import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import type { InterviewState } from "../interviewState";

const GradeSchema = z.object({
  questionScores: z
    .array(z.number().min(0).max(10))
    .describe("Score 0-10 per question answer, same order as questions"),
  questionFeedback: z
    .array(z.string())
    .describe("One sentence of feedback per answer, same order as questions"),
  overallFeedback: z
    .string()
    .describe("2-3 sentence holistic assessment of the candidate"),
});

const NON_ANSWER_PATTERNS = [
  /^\(skipped\)$/i,
  /^skip$/i,
  /^no answer$/i,
  /^n\/a$/i,
  /\bi do not know\b/i,
  /\bdon'?t know\b/i,
  /\bnot sure\b/i,
] as const;

function isNonAnswer(answer: string): boolean {
  const normalized = answer.trim();

  if (!normalized) {
    return true;
  }

  return NON_ANSWER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function applyAnsweredScoreFloor(score: number, answer: string): number {
  if (isNonAnswer(answer)) {
    return 0;
  }

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  if (wordCount >= 15) {
    return Math.max(score, 6);
  }

  if (wordCount >= 8) {
    return Math.max(score, 5);
  }

  if (wordCount >= 3) {
    return Math.max(score, 4);
  }

  return Math.max(score, 2);
}

export const gradeInterviewNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const llm = createLLM({ maxTokens: 2048 });

      const qAndA = state.questions
        .map((question, index) => {
          const answer = state.answers[index] ?? "(no answer)";
          return `Q${index + 1}: ${question}\nA${index + 1}: ${answer.slice(0, 400)}`;
        })
        .join("\n\n");

      const response = await llm.invoke([
        new SystemMessage(
          [
            "You are a fair and encouraging hiring evaluator grading a mock interview for a technical role.",
            "Give credit generously for partial answers and visible effort.",
            "Do not penalize candidates for simple English, short wording, accent, filler words, or grammar mistakes.",
            "",
            "Score each answer 0-10 using this generous rubric:",
            "0-1  No answer, skipped answer, or complete silence",
            "2-3  Clearly off-topic or unrelated to the question",
            "4-5  Some relevant attempt, but still shallow or incomplete",
            "6-7  Mostly correct or relevant, even if brief, imperfect, or missing detail",
            "8-9  Strong answer with clear understanding and useful specifics",
            "10   Excellent answer with depth, clarity, and thoughtful detail",
            "",
            "IMPORTANT grading rules:",
            "- If an answer is relevant and mostly correct, default to 6 or above.",
            "- If an answer shows genuine understanding or experience, do not score below 4.",
            "- Only score below 4 when the answer is blank, skipped, or clearly unrelated.",
            "- For technical questions (questions 4-6), be extra generous with partially correct answers.",
            "- Keep feedback supportive, concise, and practical.",
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
      const jsonMatch = /\{[\s\S]*\}/.exec(rawText);
      const result = GradeSchema.parse(JSON.parse(jsonMatch ? jsonMatch[0] : rawText));

      const count = state.questions.length;
      const questionScores = Array.from({ length: count }, (_, index) => {
        const parsedScore =
          typeof result.questionScores[index] === "number"
            ? Math.round(result.questionScores[index])
            : 0;

        return applyAnsweredScoreFloor(parsedScore, state.answers[index] ?? "");
      });
      const totalScore = Math.round(
        (questionScores.reduce((sum, score) => sum + score, 0) / (count * 10)) * 100
      );

      return {
        questionScores,
        questionFeedback: Array.from(
          { length: count },
          (_, index) => result.questionFeedback[index] ?? ""
        ),
        overallFeedback: result.overallFeedback,
        totalScore,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  { name: "grade_interview", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

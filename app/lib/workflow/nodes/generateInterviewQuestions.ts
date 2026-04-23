import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { createLLM } from "../../groq";
import { INTERVIEW_QUESTION_COUNT } from "../../interviewConfig";
import type { InterviewState } from "../interviewState";

const INTRO_STYLES = [
  "start with a warm question about how they got into this kind of work",
  "start with a friendly question about what made this role interesting to them",
  "start with a simple question about the kind of work they enjoy most",
] as const;

const CONTEXTUAL_FOCUS_AREAS = [
  "recent projects",
  "teamwork",
  "ownership",
  "problem solving",
  "learning quickly",
  "customer communication",
] as const;

const TECHNICAL_FOCUS_AREAS = [
  "day-to-day tools",
  "debugging",
  "building features",
  "quality checks",
  "handling edge cases",
  "improving performance",
] as const;

function shuffleArray<T>(items: readonly T[]): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function uniqueItems(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function buildInterviewVariant(jobRequirements: string[]) {
  const shuffledRequirements = shuffleArray(uniqueItems(jobRequirements));
  const contextualFocus = uniqueItems([
    ...shuffledRequirements.slice(0, 2),
    ...shuffleArray(CONTEXTUAL_FOCUS_AREAS).slice(0, 2),
  ]).slice(0, 2);
  const technicalFocus = uniqueItems([
    ...shuffledRequirements,
    ...shuffleArray(TECHNICAL_FOCUS_AREAS),
  ]).slice(0, 3);

  return {
    introStyle: shuffleArray(INTRO_STYLES)[0],
    contextualFocus,
    technicalFocus,
    variantSeed: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export const generateInterviewQuestionsNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const llm = createLLM({ temperature: 0.85 });
      const variant = buildInterviewVariant(state.jobRequirements);

      const result = await llm.invoke([
        new SystemMessage(
          [
            `You are a friendly, encouraging interviewer. Generate exactly ${INTERVIEW_QUESTION_COUNT} easy, conversational interview questions.`,
            `Output ONLY ${INTERVIEW_QUESTION_COUNT} numbered questions, one per line (1. Question 2. Question etc.).`,
            `No headers, no extra text, no explanations - just ${INTERVIEW_QUESTION_COUNT} numbered lines.`,
            "",
            "Question structure (must follow this order):",
            "1. INTRODUCTION: A warm opening asking the candidate to introduce themselves.",
            "2-3. CONTEXTUAL (2 questions): Follow-up questions about their experience or background related to the role.",
            "4-6. TECHNICAL (3 questions): Job description-related technical questions drawn from the role and requirements.",
            "",
            "Variation requirements:",
            `- This interview must feel different from other attempts for the same role. Use this variant seed: ${variant.variantSeed}.`,
            `- Opening style for this run: ${variant.introStyle}.`,
            `- Contextual focus for questions 2-3 when relevant: ${variant.contextualFocus.join(", ")}.`,
            `- Technical focus for questions 4-6 when relevant: ${variant.technicalFocus.join(", ")}.`,
            '- Avoid overused stock phrasing like "Tell me about yourself" when you can ask the same idea in a fresher way.',
            "",
            "IMPORTANT rules for question style:",
            "- Use simple, everyday language - avoid jargon or complex technical terms.",
            "- Each question should be short (one sentence if possible).",
            "- Questions should feel like a friendly conversation, not a quiz.",
            "- Avoid questions that require memorising facts or deep technical knowledge.",
            "- Keep questions open-ended and easy to answer.",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job title: ${state.jobTitle}`,
            `Requirements: ${state.jobRequirements.join(", ")}`,
            `Job description: ${state.jobDescription.slice(0, 600)}`,
          ].join("\n")
        ),
      ]);

      const content = typeof result.content === "string" ? result.content.trim() : "";

      const questions = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+[.)]\s+/.test(line))
        .map((line) => line.replace(/^\d+[.)]\s+/, "").trim())
        .filter((question) => question.length > 10)
        .slice(0, INTERVIEW_QUESTION_COUNT);

      if (questions.length < INTERVIEW_QUESTION_COUNT) {
        return { error: "Failed to generate interview questions. Please try again." };
      }

      const firstQuestion = questions[0];
      const greeting = `Hi ${state.candidateName}! Welcome to your AI interview for the **${state.jobTitle}** role. I'll ask you ${questions.length} short questions - just answer naturally and take your time. You can skip any question you'd like.\n\n**Question 1 of ${questions.length}:** ${firstQuestion}`;

      return {
        questions,
        aiReply: greeting,
        currentQuestionIndex: 0,
        conversationHistory: [{ role: "assistant", content: greeting }],
        answers: [],
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  { name: "generate_interview_questions", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

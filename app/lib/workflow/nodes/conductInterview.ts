import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { traceable } from "langsmith/traceable";
import type { InterviewState } from "../interviewState";

const MIN_WORDS_TO_ADVANCE = 8;

const SKIP_PATTERNS = [
  /\bskip\b/i,
  /\bpass\b/i,
  /\bi\s+don'?t\s+know\b/i,
  /\bi\s+do\s+not\s+know\b/i,
  /\bno\s+idea\b/i,
  /\bnot\s+sure\b/i,
  /\bi'?m\s+not\s+sure\b/i,
  /\bnext\s+question\b/i,
  /\bmove\s+on\b/i,
  /\bcan'?t\s+answer\b/i,
  /\bno\s+answer\b/i,
  /\bi\s+have\s+no\s+idea\b/i,
  /\bi'?m\s+not\s+familiar\b/i,
  /\bdon'?t\s+have\s+(any\s+)?experience\b/i,
  /\bi\s+can'?t\s+think\b/i,
  /\bi\s+cannot\s+answer\b/i,
];

// Any match — regardless of sentence length — triggers a skip.
function isSkipIntent(text: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(text));
}

type PromptMode = "complete" | "skipped" | "advance" | "follow_up";

function resolveMode(isComplete: boolean, skipped: boolean, moveToNext: boolean): PromptMode {
  if (isComplete) return "complete";
  if (skipped) return "skipped";
  if (moveToNext) return "advance";
  return "follow_up";
}

function buildSystemPrompt(
  mode: PromptMode,
  nextIdx: number,
  totalQuestions: number,
  nextQuestion: string | null,
  currentQuestion: string,
  previousQA: string
): string {
  const context = previousQA ? `\n\nPrevious answers for context:\n${previousQA}` : "";

  switch (mode) {
    case "complete":
      return (
        "You are a warm, encouraging AI interviewer. The candidate just finished their last question. " +
        "Thank them genuinely in 2-3 friendly sentences. Mention they did well and results will come by email. " +
        "Keep it brief, warm, and positive. No score, no critique."
      );
    case "skipped":
      return (
        `You are a friendly, supportive AI interviewer. The candidate said they don't know or want to skip. ` +
        `Respond with ONE short, encouraging sentence (e.g. "No worries, let's move on!") ` +
        `then ask the next question naturally. ` +
        `Format it: "**Question ${nextIdx + 1} of ${totalQuestions}:** ${nextQuestion}"`
      );
    case "advance":
      return (
        `You are a friendly AI interviewer. The candidate gave a good answer. ` +
        `Acknowledge it warmly in ONE short sentence — optionally referencing something specific they said. ` +
        `Then ask the next question exactly as: "**Question ${nextIdx + 1} of ${totalQuestions}:** ${nextQuestion}"` +
        context
      );
    default:
      return (
        `You are a friendly, patient AI interviewer. The candidate's answer was very short. ` +
        `Ask ONE simple, gentle follow-up to help them expand on: "${currentQuestion}". ` +
        `If their reply hints at something interesting, gently explore it. ` +
        `One sentence only — make it feel safe and easy to answer.` +
        context
      );
  }
}

function buildPreviousQA(questions: string[], answers: string[], upToIndex: number): string {
  return questions
    .slice(0, upToIndex)
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] ?? "(skipped)"}`)
    .join("\n\n");
}

export const conductInterviewNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const llm = createLLM();
      const { questions, currentQuestionIndex: currentIdx, conversationHistory, answers } = state;
      const totalQuestions = questions.length;
      const userMsg = state.userMessage.trim();

      const skipped = isSkipIntent(userMsg);
      const moveToNext = skipped || userMsg.split(/\s+/).filter(Boolean).length >= MIN_WORDS_TO_ADVANCE;
      const isComplete = moveToNext && currentIdx >= totalQuestions - 1;
      const nextIdx = moveToNext ? currentIdx + 1 : currentIdx;
      const nextQuestion = !isComplete && moveToNext ? questions[nextIdx] : null;

      const mode = resolveMode(isComplete, skipped, moveToNext);
      const previousQA = buildPreviousQA(questions, answers, currentIdx);
      const systemPrompt = buildSystemPrompt(mode, nextIdx, totalQuestions, nextQuestion, questions[currentIdx], previousQA);

      const historyText = conversationHistory
        .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
        .join("\n\n");

      const result = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`Job: ${state.jobTitle}\n\nConversation so far:\n${historyText}\n\nCandidate's latest reply: ${userMsg}`),
      ]);

      const reply = typeof result.content === "string" ? result.content.trim() : "";

      const updatedAnswers = [...answers];
      if (moveToNext) updatedAnswers[currentIdx] = skipped ? "(skipped)" : userMsg;

      return {
        aiReply: reply,
        currentQuestionIndex: nextIdx,
        answers: updatedAnswers,
        conversationHistory: [...conversationHistory, { role: "user", content: userMsg }, { role: "assistant", content: reply }],
        isComplete,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  { name: "conduct_interview", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

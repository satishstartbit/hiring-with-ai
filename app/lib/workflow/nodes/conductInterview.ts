import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { traceable } from "langsmith/traceable";
import type { InterviewState } from "../interviewState";

const MIN_WORDS_TO_ADVANCE = 20;

export const conductInterviewNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const llm = createLLM();

      const totalQuestions = state.questions.length;
      const currentIdx = state.currentQuestionIndex;
      const isLastQuestion = currentIdx >= totalQuestions - 1;

      // Advance if the candidate wrote enough; otherwise ask a follow-up
      const wordCount = state.userMessage.trim().split(/\s+/).filter(Boolean).length;
      const moveToNext = wordCount >= MIN_WORDS_TO_ADVANCE;
      const isComplete = moveToNext && isLastQuestion;
      const nextIdx = moveToNext ? currentIdx + 1 : currentIdx;
      const nextQuestion = !isComplete && moveToNext ? state.questions[nextIdx] : null;

      const historyText = state.conversationHistory
        .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
        .join("\n\n");

      let systemPrompt: string;
      if (isComplete) {
        systemPrompt =
          "You are a professional AI interviewer. The candidate just answered the final question. " +
          "Acknowledge their answer briefly, then thank them warmly and let them know the interview is complete " +
          "and they will receive their results by email shortly. Be warm and encouraging.";
      } else if (moveToNext && nextQuestion) {
        systemPrompt =
          `You are a professional AI interviewer. The candidate's answer was sufficient. ` +
          `Acknowledge it in ONE short sentence, then immediately ask the next question. ` +
          `Format the next question exactly as: "**Question ${nextIdx + 1} of ${totalQuestions}:** ${nextQuestion}"`;
      } else {
        systemPrompt =
          `You are a professional AI interviewer. The candidate's answer was too brief. ` +
          `Ask ONE short follow-up to get more detail about: "${state.questions[currentIdx]}". ` +
          `Keep your follow-up under two sentences.`;
      }

      const result = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(
          [
            `Job: ${state.jobTitle}`,
            `Requirements: ${state.jobRequirements.join(", ")}`,
            "",
            "Conversation so far:",
            historyText,
            "",
            `Candidate's latest answer: ${state.userMessage}`,
          ].join("\n")
        ),
      ]);

      const reply = typeof result.content === "string" ? result.content.trim() : "";

      const updatedAnswers = [...state.answers];
      if (moveToNext) {
        updatedAnswers[currentIdx] = state.userMessage.trim();
      }

      const updatedHistory = [
        ...state.conversationHistory,
        { role: "user" as const, content: state.userMessage },
        { role: "assistant" as const, content: reply },
      ];

      return {
        aiReply: reply,
        currentQuestionIndex: nextIdx,
        answers: updatedAnswers,
        conversationHistory: updatedHistory,
        isComplete,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  { name: "conduct_interview", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

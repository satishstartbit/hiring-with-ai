import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { createLLM } from "../../groq";
import type { InterviewState } from "../interviewState";

const FALLBACK_CLOSING =
  "That's everything I have for you today — thanks for the thoughtful answers! We'll share the results by email shortly. Take care.";

/**
 * "Advance" node — also handles the closing turn when the interview is over.
 * Posts the next question prompt to the conversation, or a warm closing if
 * we're done.
 */
export const interviewCompletionNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    const idx = state.currentQuestionIndex;
    const nextIdx = idx + 1;
    const total = state.questions.length;
    const isFinal = state.nextAction === "complete" || nextIdx >= total;

    if (isFinal) {
      try {
        const llm = createLLM({ temperature: 0.6, maxTokens: 180 });
        const result = await llm.invoke([
          new SystemMessage(
            "You are a warm AI interviewer wrapping up an interview. " +
              "Thank the candidate genuinely in 2-3 friendly sentences, mention they did well, " +
              "and that results will arrive by email. No score, no critique."
          ),
          new HumanMessage(
            `Candidate name: ${state.candidateName}. Role: ${state.jobTitle}.`
          ),
        ]);
        const closing =
          typeof result.content === "string"
            ? result.content.trim() || FALLBACK_CLOSING
            : FALLBACK_CLOSING;

        return {
          aiReply: closing,
          conversationHistory: [
            ...state.conversationHistory,
            { role: "assistant", content: closing },
          ],
          isComplete: true,
          currentQuestionIndex: total,
          currentStage: "completed",
        };
      } catch {
        return {
          aiReply: FALLBACK_CLOSING,
          conversationHistory: [
            ...state.conversationHistory,
            { role: "assistant", content: FALLBACK_CLOSING },
          ],
          isComplete: true,
          currentQuestionIndex: total,
          currentStage: "completed",
        };
      }
    }

    // Advance to next question
    const nextQuestion = state.questions[nextIdx];
    if (!nextQuestion) {
      return {
        aiReply: FALLBACK_CLOSING,
        conversationHistory: [
          ...state.conversationHistory,
          { role: "assistant", content: FALLBACK_CLOSING },
        ],
        isComplete: true,
        currentQuestionIndex: total,
        currentStage: "completed",
      };
    }

    const acknowledgement =
      state.nextAction === "easier"
        ? "Thanks — let's try a different angle."
        : state.nextAction === "harder"
        ? "Nice answer — let's step it up a bit."
        : state.nextAction === "switch_topic"
        ? "Got it — let's switch tracks for a moment."
        : "Thanks for that.";

    const reply = `${acknowledgement}\n\n**Question ${nextIdx + 1} of ${total}:** ${nextQuestion.prompt}`;

    return {
      aiReply: reply,
      conversationHistory: [
        ...state.conversationHistory,
        { role: "assistant", content: reply },
      ],
      currentQuestionIndex: nextIdx,
      currentStage: "advanced",
    };
  },
  { name: "interview_completion", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { createLLM } from "../../groq";
import type { InterviewState } from "../interviewState";

/**
 * Generate a contextual, human-feeling follow-up to the candidate's last
 * answer. Does NOT advance currentQuestionIndex — we're drilling on the
 * same topic. The next AnswerEvaluation pass will run against the same
 * question slot. To avoid infinite loops, only one follow-up is allowed
 * per question: if the previous turn was already a follow-up the graph
 * routes to 'advance' instead (see graph wiring).
 */
export const followupQuestionNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const idx = state.currentQuestionIndex;
      const currentQuestion = state.questions[idx];
      const lastAnswer = state.answers[idx] ?? state.userMessage;
      const total = state.questions.length;

      const llm = createLLM({ temperature: 0.6, maxTokens: 200 });
      const result = await llm.invoke([
        new SystemMessage(
          [
            "You are a senior interviewer. The candidate gave a promising but shallow answer.",
            "Ask ONE concise, human-feeling follow-up that drills deeper on what they said.",
            "Rules:",
            "- Reference something specific from their answer (don't restate the original question).",
            "- One sentence, max 25 words.",
            "- Friendly, curious tone — not interrogative.",
            "- Do NOT renumber the question; this is a follow-up, not a new question.",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Original question (Q${idx + 1} of ${total}, ${currentQuestion.type}): ${currentQuestion.prompt}`,
            `Candidate's answer: ${lastAnswer.slice(0, 800)}`,
          ].join("\n")
        ),
      ]);

      const followup =
        typeof result.content === "string" ? result.content.trim() : "";
      const reply =
        followup ||
        `Can you walk through that in a bit more detail — what specifically did you do, and what was the outcome?`;

      return {
        aiReply: reply,
        conversationHistory: [
          ...state.conversationHistory,
          { role: "assistant", content: reply },
        ],
        currentStage: "followup_sent",
      };
    } catch (err) {
      const fallback =
        "Can you walk me through that in a little more detail? What did you actually do, and what was the outcome?";
      return {
        aiReply: fallback,
        conversationHistory: [
          ...state.conversationHistory,
          { role: "assistant", content: fallback },
        ],
        currentStage: "followup_sent",
        error: err instanceof Error ? err.message : undefined,
      };
    }
  },
  { name: "followup_question", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

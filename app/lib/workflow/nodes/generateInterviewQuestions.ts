import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { traceable } from "langsmith/traceable";
import type { InterviewState } from "../interviewState";

export const generateInterviewQuestionsNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const llm = createLLM();

      const result = await llm.invoke([
        new SystemMessage(
          [
            "You are a senior technical interviewer. Generate exactly 8 interview questions for the given role.",
            "Output ONLY 8 numbered questions, one per line (1. Question 2. Question etc.).",
            "No headers, no extra text, no explanations — just 8 numbered lines.",
            "",
            "Include this mix:",
            "- 3 technical/domain knowledge questions",
            "- 2 problem-solving or situational questions",
            "- 2 behavioral questions (encourage STAR-style answers)",
            "- 1 role-specific scenario question",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job title: ${state.jobTitle}`,
            `Requirements: ${state.jobRequirements.join(", ")}`,
            `Job description: ${state.jobDescription.slice(0, 800)}`,
          ].join("\n")
        ),
      ]);

      const content = typeof result.content === "string" ? result.content.trim() : "";

      const questions = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+[.)]\s+/.test(line))
        .map((line) => line.replace(/^\d+[.)]\s+/, "").trim())
        .filter((q) => q.length > 15)
        .slice(0, 8);

      if (questions.length < 4) {
        return { error: "Failed to generate interview questions. Please try again." };
      }

      const firstQuestion = questions[0];
      const greeting = `Hi ${state.candidateName}! Welcome to your AI mock interview for the **${state.jobTitle}** position. This will take about 10 minutes — I'll ask you ${questions.length} questions, one at a time. Answer naturally, just as you would in a real interview.\n\n**Question 1 of ${questions.length}:** ${firstQuestion}`;

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

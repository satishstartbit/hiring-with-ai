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
            "You are a friendly, encouraging interviewer. Generate exactly 5 easy, conversational interview questions for the given role.",
            "Output ONLY 5 numbered questions, one per line (1. Question 2. Question etc.).",
            "No headers, no extra text, no explanations — just 5 numbered lines.",
            "",
            "IMPORTANT rules for question style:",
            "- Use simple, everyday language — avoid jargon or complex technical terms.",
            "- Each question should be short (one sentence if possible).",
            "- Questions should feel like a friendly conversation, not a quiz.",
            "- Start with a warm intro question (e.g. background, why interested in role).",
            "- Then 2 light experience-based questions ('Have you ever...', 'Can you describe a time...').",
            "- Then 1 easy scenario question ('What would you do if...').",
            "- End with a simple forward-looking question ('What do you hope to learn...').",
            "- Avoid questions that require memorising facts or deep technical knowledge.",
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
        .filter((q) => q.length > 10)
        .slice(0, 5);

      if (questions.length < 3) {
        return { error: "Failed to generate interview questions. Please try again." };
      }

      const firstQuestion = questions[0];
      const greeting = `Hi ${state.candidateName}! Welcome to your AI interview for the **${state.jobTitle}** role. I'll ask you ${questions.length} short questions — just answer naturally and take your time. You can skip any question you'd like.\n\n**Question 1 of ${questions.length}:** ${firstQuestion}`;

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

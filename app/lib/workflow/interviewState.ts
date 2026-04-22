import { Annotation } from "@langchain/langgraph";

const last = <T>(a: T, b: T | undefined): T => b ?? a;

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

export const InterviewStateAnnotation = Annotation.Root({
  jobTitle: Annotation<string>({ reducer: last, default: () => "" }),
  jobDescription: Annotation<string>({ reducer: last, default: () => "" }),
  jobRequirements: Annotation<string[]>({ reducer: last, default: () => [] }),
  candidateName: Annotation<string>({ reducer: last, default: () => "" }),
  questions: Annotation<string[]>({ reducer: last, default: () => [] }),
  conversationHistory: Annotation<ChatMessage[]>({ reducer: last, default: () => [] }),
  userMessage: Annotation<string>({ reducer: last, default: () => "" }),
  currentQuestionIndex: Annotation<number>({ reducer: last, default: () => 0 }),
  answers: Annotation<string[]>({ reducer: last, default: () => [] }),
  aiReply: Annotation<string>({ reducer: last, default: () => "" }),
  isComplete: Annotation<boolean>({ reducer: last, default: () => false }),
  totalScore: Annotation<number>({ reducer: last, default: () => 0 }),
  questionScores: Annotation<number[]>({ reducer: last, default: () => [] }),
  questionFeedback: Annotation<string[]>({ reducer: last, default: () => [] }),
  overallFeedback: Annotation<string>({ reducer: last, default: () => "" }),
  error: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
});

export type InterviewState = typeof InterviewStateAnnotation.State;

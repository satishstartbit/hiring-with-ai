import { Annotation } from "@langchain/langgraph";

const last = <T>(a: T, b: T | undefined): T => b ?? a;

export const GradingStateAnnotation = Annotation.Root({
  jobTitle: Annotation<string>({ reducer: last, default: () => "" }),
  jobDescription: Annotation<string>({ reducer: last, default: () => "" }),
  jobRequirements: Annotation<string[]>({ reducer: last, default: () => [] }),
  questions: Annotation<string[]>({ reducer: last, default: () => [] }),
  answers: Annotation<string[]>({ reducer: last, default: () => [] }),
  questionScores: Annotation<number[]>({ reducer: last, default: () => [] }),
  questionFeedback: Annotation<string[]>({ reducer: last, default: () => [] }),
  totalScore: Annotation<number>({ reducer: last, default: () => 0 }),
  overallFeedback: Annotation<string>({ reducer: last, default: () => "" }),
  error: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
});

export type GradingState = typeof GradingStateAnnotation.State;

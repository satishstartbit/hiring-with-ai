import { Annotation } from "@langchain/langgraph";

const last = <T>(a: T, b: T | undefined): T => b ?? a;

export interface MCQQuestion {
  type: "mcq";
  text: string;
  options: [string, string, string, string];
  correctIndex: number; // 0-based index of the correct option
}

export interface DescriptiveQuestion {
  type: "descriptive";
  text: string;
}

export type ScreeningQuestion = MCQQuestion | DescriptiveQuestion;

export const ScreeningStateAnnotation = Annotation.Root({
  jobTitle: Annotation<string>({ reducer: last, default: () => "" }),
  jobDescription: Annotation<string>({ reducer: last, default: () => "" }),
  jobRequirements: Annotation<string[]>({ reducer: last, default: () => [] }),
  jobDepartment: Annotation<string>({ reducer: last, default: () => "" }),
  candidateName: Annotation<string>({ reducer: last, default: () => "" }),
  candidateTitle: Annotation<string>({ reducer: last, default: () => "" }),
  resumeText: Annotation<string>({ reducer: last, default: () => "" }),
  isMatch: Annotation<boolean>({ reducer: last, default: () => false }),
  matchScore: Annotation<number>({ reducer: last, default: () => 0 }),
  matchReason: Annotation<string>({ reducer: last, default: () => "" }),
  questions: Annotation<ScreeningQuestion[]>({ reducer: last, default: () => [] }),
  error: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
});

export type ScreeningState = typeof ScreeningStateAnnotation.State;

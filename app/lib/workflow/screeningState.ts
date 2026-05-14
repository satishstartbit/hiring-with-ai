import { Annotation } from "@langchain/langgraph";
import type {
  DifficultyLevel,
  QuestionType,
  QuestionCountMode,
} from "../constants/assessment";

const last = <T>(a: T, b: T | undefined): T => b ?? a;

export interface MCQQuestion {
  type: "mcq";
  text: string;
  options: [string, string, string, string];
  correctIndex: number; // 0-based index of the correct option
}

export interface MultiSelectQuestion {
  type: "multi_select";
  text: string;
  options: [string, string, string, string];
  /** Indices of all correct options. At least one, can be up to all four. */
  correctIndices: number[];
}

export interface DescriptiveQuestion {
  type: "descriptive";
  text: string;
}

export interface CodingQuestion {
  type: "coding";
  text: string;
  language: string;
  starterCode: string;
  referenceSolution: string;
}

export type ScreeningQuestion =
  | MCQQuestion
  | MultiSelectQuestion
  | DescriptiveQuestion
  | CodingQuestion;

export const ScreeningStateAnnotation = Annotation.Root({
  jobTitle: Annotation<string>({ reducer: last, default: () => "" }),
  jobDescription: Annotation<string>({ reducer: last, default: () => "" }),
  jobRequirements: Annotation<string[]>({ reducer: last, default: () => [] }),
  jobDepartment: Annotation<string>({ reducer: last, default: () => "" }),
  candidateName: Annotation<string>({ reducer: last, default: () => "" }),
  candidateTitle: Annotation<string>({ reducer: last, default: () => "" }),
  resumeText: Annotation<string>({ reducer: last, default: () => "" }),
  candidateSkills: Annotation<string[]>({ reducer: last, default: () => [] }),
  isMatch: Annotation<boolean>({ reducer: last, default: () => false }),
  matchScore: Annotation<number>({ reducer: last, default: () => 0 }),
  matchReason: Annotation<string>({ reducer: last, default: () => "" }),
  // Assessment config — when an HR-published config exists these drive what
  // the AI generates. Empty/zero values mean "fall back to defaults".
  difficulty: Annotation<DifficultyLevel | "">({ reducer: last, default: () => "" }),
  skills: Annotation<string[]>({ reducer: last, default: () => [] }),
  enabledQuestionTypes: Annotation<QuestionType[]>({ reducer: last, default: () => [] }),
  questionCount: Annotation<number>({ reducer: last, default: () => 0 }),
  questionCountMode: Annotation<QuestionCountMode | "">({ reducer: last, default: () => "" }),
  durationMinutes: Annotation<number>({ reducer: last, default: () => 0 }),
  /** Languages the HR config allows for coding questions. Empty = no coding generated. */
  codingLanguages: Annotation<string[]>({ reducer: last, default: () => [] }),
  questions: Annotation<ScreeningQuestion[]>({ reducer: last, default: () => [] }),
  error: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
});

export type ScreeningState = typeof ScreeningStateAnnotation.State;

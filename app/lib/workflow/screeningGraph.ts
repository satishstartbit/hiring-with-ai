import { StateGraph, START, END } from "@langchain/langgraph";
import { ScreeningStateAnnotation } from "./screeningState";
import { matchResumeNode } from "./nodes/matchResume";
import { generateQuestionsNode } from "./nodes/generateQuestions";
import { traceable } from "langsmith/traceable";
import type {
  DifficultyLevel,
  QuestionType,
  QuestionCountMode,
} from "../constants/assessment";

export type { ScreeningQuestion } from "./screeningState";

const DEFAULT_SCREENING_TIME_LIMIT_SECONDS = 20 * 60;

const compiledMatchGraph = new StateGraph(ScreeningStateAnnotation)
  .addNode("matchResume", matchResumeNode)
  .addEdge(START, "matchResume")
  .addEdge("matchResume", END)
  .compile();

const compiledQuestionsGraph = new StateGraph(ScreeningStateAnnotation)
  .addNode("generateQuestions", generateQuestionsNode)
  .addEdge(START, "generateQuestions")
  .addEdge("generateQuestions", END)
  .compile();

export interface MatchInput {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  jobDepartment: string;
  candidateName: string;
  candidateTitle: string;
  resumeText: string;
}

export interface MatchOutput {
  matched: boolean;
  matchScore: number;
  matchReason: string;
  candidateSkills: string[];
  error?: string;
}

export interface QuestionsInput {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  jobDepartment: string;
  /** Optional HR-configured assessment settings (from AssessmentConfig). */
  difficulty?: DifficultyLevel;
  skills?: string[];
  enabledQuestionTypes?: QuestionType[];
  questionCount?: number;
  questionCountMode?: QuestionCountMode;
  durationMinutes?: number;
}

export interface QuestionsOutput {
  questions: import("./screeningState").ScreeningQuestion[];
  timeLimitSeconds: number;
  error?: string;
}

export const runMatchWorkflow = traceable(
  async (input: MatchInput): Promise<MatchOutput> => {
    const finalState = await compiledMatchGraph.invoke(input);
    return {
      matched: finalState.isMatch,
      matchScore: finalState.matchScore,
      matchReason: finalState.matchReason,
      candidateSkills: finalState.candidateSkills,
      error: finalState.error,
    };
  },
  { name: "resume_match_workflow", run_type: "chain", tags: ["screening"] }
);

export const runQuestionsWorkflow = traceable(
  async (input: QuestionsInput): Promise<QuestionsOutput> => {
    const finalState = await compiledQuestionsGraph.invoke(input);
    const timeLimitSeconds =
      input.durationMinutes && input.durationMinutes > 0
        ? input.durationMinutes * 60
        : DEFAULT_SCREENING_TIME_LIMIT_SECONDS;
    return {
      questions: finalState.questions,
      timeLimitSeconds,
      error: finalState.error,
    };
  },
  { name: "questions_workflow", run_type: "chain", tags: ["screening"] }
);

import { StateGraph, START, END } from "@langchain/langgraph";
import { ScreeningStateAnnotation } from "./screeningState";
import { matchResumeNode } from "./nodes/matchResume";
import { generateQuestionsNode } from "./nodes/generateQuestions";

export type { ScreeningQuestion } from "./screeningState";

const SCREENING_TIME_LIMIT_SECONDS = 20 * 60;

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
  error?: string;
}

export interface QuestionsInput {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  jobDepartment: string;
}

export interface QuestionsOutput {
  questions: import("./screeningState").ScreeningQuestion[];
  timeLimitSeconds: number;
  error?: string;
}

export async function runMatchWorkflow(input: MatchInput): Promise<MatchOutput> {
  const finalState = await compiledMatchGraph.invoke(input);
  return {
    matched: finalState.isMatch,
    matchScore: finalState.matchScore,
    matchReason: finalState.matchReason,
    error: finalState.error,
  };
}

export async function runQuestionsWorkflow(
  input: QuestionsInput
): Promise<QuestionsOutput> {
  const finalState = await compiledQuestionsGraph.invoke(input);
  return {
    questions: finalState.questions,
    timeLimitSeconds: SCREENING_TIME_LIMIT_SECONDS,
    error: finalState.error,
  };
}

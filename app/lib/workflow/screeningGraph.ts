import { StateGraph, START, END } from "@langchain/langgraph";
import { ScreeningStateAnnotation, type ScreeningState } from "./screeningState";
import { matchResumeNode } from "./nodes/matchResume";
import { generateQuestionsNode } from "./nodes/generateQuestions";

export type { ScreeningQuestion } from "./screeningState";

const SCREENING_TIME_LIMIT_SECONDS = 20 * 60;

const graph = new StateGraph(ScreeningStateAnnotation)
  .addNode("matchResume", matchResumeNode)
  .addNode("generateQuestions", generateQuestionsNode)
  .addEdge(START, "matchResume")
  .addConditionalEdges("matchResume", (state: ScreeningState) =>
    state.error || !state.isMatch ? END : "generateQuestions"
  )
  .addEdge("generateQuestions", END);

const compiledScreeningGraph = graph.compile();

export interface ScreeningInput {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  jobDepartment: string;
  candidateName: string;
  candidateTitle: string;
  resumeText: string;
}

export interface ScreeningOutput {
  matched: boolean;
  matchScore: number;
  matchReason: string;
  questions: import("./screeningState").ScreeningQuestion[];
  timeLimitSeconds: number;
  error?: string;
}

export async function runScreeningWorkflow(
  input: ScreeningInput
): Promise<ScreeningOutput> {
  const finalState = await compiledScreeningGraph.invoke(input);
  return {
    matched: finalState.isMatch,
    matchScore: finalState.matchScore,
    matchReason: finalState.matchReason,
    questions: finalState.questions,
    timeLimitSeconds: SCREENING_TIME_LIMIT_SECONDS,
    error: finalState.error,
  };
}

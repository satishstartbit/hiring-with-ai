import { StateGraph, START, END } from "@langchain/langgraph";
import { GradingStateAnnotation } from "./gradingState";
import { gradeAnswersNode } from "./nodes/gradeAnswers";
import { traceable } from "langsmith/traceable";

const graph = new StateGraph(GradingStateAnnotation)
  .addNode("gradeAnswers", gradeAnswersNode)
  .addEdge(START, "gradeAnswers")
  .addEdge("gradeAnswers", END);

const compiledGradingGraph = graph.compile();

export interface GradingInput {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  questions: string[];
  answers: string[];
}

export interface GradingOutput {
  totalScore: number;
  questionScores: number[];
  questionFeedback: string[];
  overallFeedback: string;
  error?: string;
}

export const runGradingWorkflow = traceable(
  async (input: GradingInput): Promise<GradingOutput> => {
    const finalState = await compiledGradingGraph.invoke(input);
    return {
      totalScore: finalState.totalScore,
      questionScores: finalState.questionScores,
      questionFeedback: finalState.questionFeedback,
      overallFeedback: finalState.overallFeedback,
      error: finalState.error,
    };
  },
  { name: "grading_workflow", run_type: "chain", tags: ["grading"] }
);

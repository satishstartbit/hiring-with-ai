import { StateGraph, START, END } from "@langchain/langgraph";
import { InterviewStateAnnotation } from "./interviewState";
import { generateInterviewQuestionsNode } from "./nodes/generateInterviewQuestions";
import { conductInterviewNode } from "./nodes/conductInterview";
import { gradeInterviewNode } from "./nodes/gradeInterview";
import { traceable } from "langsmith/traceable";

const startGraph = new StateGraph(InterviewStateAnnotation)
  .addNode("generateQuestions", generateInterviewQuestionsNode)
  .addEdge(START, "generateQuestions")
  .addEdge("generateQuestions", END)
  .compile();

const messageGraph = new StateGraph(InterviewStateAnnotation)
  .addNode("conductInterview", conductInterviewNode)
  .addEdge(START, "conductInterview")
  .addEdge("conductInterview", END)
  .compile();

const gradeGraph = new StateGraph(InterviewStateAnnotation)
  .addNode("gradeInterview", gradeInterviewNode)
  .addEdge(START, "gradeInterview")
  .addEdge("gradeInterview", END)
  .compile();

export interface StartInterviewInput {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  candidateName: string;
}

export interface StartInterviewOutput {
  questions: string[];
  firstMessage: string;
  error?: string;
}

export const runStartInterview = traceable(
  async (input: StartInterviewInput): Promise<StartInterviewOutput> => {
    const state = await startGraph.invoke(input);
    return {
      questions: state.questions,
      firstMessage: state.aiReply,
      error: state.error,
    };
  },
  { name: "start_interview", run_type: "chain", tags: ["interview"] }
);

export interface SendMessageInput {
  jobTitle: string;
  jobRequirements: string[];
  candidateName: string;
  questions: string[];
  conversationHistory: { role: "assistant" | "user"; content: string }[];
  userMessage: string;
  currentQuestionIndex: number;
  answers: string[];
}

export interface SendMessageOutput {
  aiReply: string;
  currentQuestionIndex: number;
  answers: string[];
  conversationHistory: { role: "assistant" | "user"; content: string }[];
  isComplete: boolean;
  error?: string;
}

export const runSendMessage = traceable(
  async (input: SendMessageInput): Promise<SendMessageOutput> => {
    const state = await messageGraph.invoke(input);
    return {
      aiReply: state.aiReply,
      currentQuestionIndex: state.currentQuestionIndex,
      answers: state.answers,
      conversationHistory: state.conversationHistory,
      isComplete: state.isComplete,
      error: state.error,
    };
  },
  { name: "send_interview_message", run_type: "chain", tags: ["interview"] }
);

export interface GradeInterviewInput {
  jobTitle: string;
  jobRequirements: string[];
  questions: string[];
  answers: string[];
}

export interface GradeInterviewOutput {
  totalScore: number;
  questionScores: number[];
  questionFeedback: string[];
  overallFeedback: string;
  error?: string;
}

export const runGradeInterview = traceable(
  async (input: GradeInterviewInput): Promise<GradeInterviewOutput> => {
    const state = await gradeGraph.invoke(input);
    return {
      totalScore: state.totalScore,
      questionScores: state.questionScores,
      questionFeedback: state.questionFeedback,
      overallFeedback: state.overallFeedback,
      error: state.error,
    };
  },
  { name: "grade_interview", run_type: "chain", tags: ["interview"] }
);

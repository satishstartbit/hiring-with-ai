import { StateGraph, START, END } from "@langchain/langgraph";
import { traceable } from "langsmith/traceable";
import {
  InterviewStateAnnotation,
  type InterviewState,
  type ChatMessage,
  type DimensionScores,
  type FinalReport,
  type PlannedQuestion,
} from "./interviewState";
import { resumeAnalysisNode } from "./nodes/resumeAnalysis";
import { skillExtractionNode } from "./nodes/skillExtraction";
import { interviewPlanningNode } from "./nodes/interviewPlanning";
import { questionGenerationNode } from "./nodes/questionGeneration";
import { answerEvaluationNode } from "./nodes/answerEvaluation";
import { difficultyDecisionNode } from "./nodes/difficultyDecision";
import { followupQuestionNode } from "./nodes/followupQuestion";
import { interviewCompletionNode } from "./nodes/interviewCompletion";
import { finalReportNode } from "./nodes/finalReport";
import { vectorMemoryWriteNode } from "./nodes/vectorMemory";

// ---------------------------------------------------------------------------
// Graph 1: startGraph — runs once at interview start.
// ResumeAnalysis → SkillExtraction → InterviewPlanning → QuestionGeneration
// ---------------------------------------------------------------------------

const startGraph = new StateGraph(InterviewStateAnnotation)
  .addNode("resumeAnalysis", resumeAnalysisNode)
  .addNode("skillExtraction", skillExtractionNode)
  .addNode("interviewPlanning", interviewPlanningNode)
  .addNode("questionGeneration", questionGenerationNode)
  .addEdge(START, "resumeAnalysis")
  .addEdge("resumeAnalysis", "skillExtraction")
  .addEdge("skillExtraction", "interviewPlanning")
  .addEdge("interviewPlanning", "questionGeneration")
  .addEdge("questionGeneration", END)
  .compile();

// ---------------------------------------------------------------------------
// Graph 2: messageGraph — runs every candidate turn.
// AnswerEvaluation → VectorMemoryWrite → (conditional) Followup | Difficulty → Completion
// ---------------------------------------------------------------------------

function routeAfterMemory(state: InterviewState): "followup" | "difficulty" {
  // Followup is only allowed once per question — if the previous AI turn was
  // already a follow-up on the same index, advance instead. We detect this by
  // checking that the *previous* evaluation for this turn already routed to
  // followup. (We persist one eval per turn so a re-route stays simple.)
  if (state.nextAction === "followup") return "followup";
  return "difficulty";
}

function routeAfterDifficulty(): "completion" {
  return "completion";
}

const messageGraph = new StateGraph(InterviewStateAnnotation)
  .addNode("answerEvaluation", answerEvaluationNode)
  .addNode("vectorMemoryWrite", vectorMemoryWriteNode)
  .addNode("followupQuestion", followupQuestionNode)
  .addNode("difficultyDecision", difficultyDecisionNode)
  .addNode("interviewCompletion", interviewCompletionNode)
  .addEdge(START, "answerEvaluation")
  .addEdge("answerEvaluation", "vectorMemoryWrite")
  .addConditionalEdges("vectorMemoryWrite", routeAfterMemory, {
    followup: "followupQuestion",
    difficulty: "difficultyDecision",
  })
  .addEdge("followupQuestion", END)
  .addConditionalEdges("difficultyDecision", routeAfterDifficulty, {
    completion: "interviewCompletion",
  })
  .addEdge("interviewCompletion", END)
  .compile();

// ---------------------------------------------------------------------------
// Graph 3: completeGraph — runs once when the interview ends.
// FinalReport
// ---------------------------------------------------------------------------

const completeGraph = new StateGraph(InterviewStateAnnotation)
  .addNode("generateFinalReport", finalReportNode)
  .addEdge(START, "generateFinalReport")
  .addEdge("generateFinalReport", END)
  .compile();

// ---------------------------------------------------------------------------
// Public callable APIs — preserved shapes used by the existing routes.
// ---------------------------------------------------------------------------

export interface StartInterviewInput {
  candidateId: string;
  jobId: string;
  interviewSessionId: string;
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  candidateName: string;
  resumeText: string;
}

export interface StartInterviewOutput {
  questions: PlannedQuestion[];
  firstMessage: string;
  conversationHistory: ChatMessage[];
  plan: InterviewState["plan"];
  resumeIntelligence: InterviewState["resumeIntelligence"];
  skillMatch: InterviewState["skillMatch"];
  strongSkills: string[];
  weakSkills: string[];
  currentDifficulty: InterviewState["currentDifficulty"];
  error?: string;
}

export const runStartInterview = traceable(
  async (input: StartInterviewInput): Promise<StartInterviewOutput> => {
    const state = await startGraph.invoke({
      candidateId: input.candidateId,
      jobId: input.jobId,
      interviewSessionId: input.interviewSessionId,
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
      jobRequirements: input.jobRequirements,
      candidateName: input.candidateName,
      resumeText: input.resumeText,
    });
    return {
      questions: state.questions,
      firstMessage: state.aiReply,
      conversationHistory: state.conversationHistory,
      plan: state.plan,
      resumeIntelligence: state.resumeIntelligence,
      skillMatch: state.skillMatch,
      strongSkills: state.strongSkills,
      weakSkills: state.weakSkills,
      currentDifficulty: state.currentDifficulty,
      error: state.error,
    };
  },
  { name: "start_interview", run_type: "chain", tags: ["interview"] }
);

export interface SendMessageInput {
  candidateId: string;
  jobId: string;
  interviewSessionId: string;
  jobTitle: string;
  jobRequirements: string[];
  candidateName: string;
  resumeIntelligence: InterviewState["resumeIntelligence"];
  skillMatch: InterviewState["skillMatch"];
  strongSkills: string[];
  weakSkills: string[];
  questions: PlannedQuestion[];
  currentQuestionIndex: number;
  currentDifficulty: InterviewState["currentDifficulty"];
  conversationHistory: ChatMessage[];
  answers: string[];
  evaluations: InterviewState["evaluations"];
  runningScores: DimensionScores;
  userMessage: string;
}

export interface SendMessageOutput {
  aiReply: string;
  conversationHistory: ChatMessage[];
  questions: PlannedQuestion[];
  answers: string[];
  evaluations: InterviewState["evaluations"];
  currentQuestionIndex: number;
  currentDifficulty: InterviewState["currentDifficulty"];
  runningScores: DimensionScores;
  isComplete: boolean;
  error?: string;
}

export const runSendMessage = traceable(
  async (input: SendMessageInput): Promise<SendMessageOutput> => {
    const state = await messageGraph.invoke({
      candidateId: input.candidateId,
      jobId: input.jobId,
      interviewSessionId: input.interviewSessionId,
      jobTitle: input.jobTitle,
      jobRequirements: input.jobRequirements,
      candidateName: input.candidateName,
      resumeIntelligence: input.resumeIntelligence,
      skillMatch: input.skillMatch,
      strongSkills: input.strongSkills,
      weakSkills: input.weakSkills,
      questions: input.questions,
      currentQuestionIndex: input.currentQuestionIndex,
      currentDifficulty: input.currentDifficulty,
      conversationHistory: input.conversationHistory,
      answers: input.answers,
      evaluations: input.evaluations,
      runningScores: input.runningScores,
      userMessage: input.userMessage,
    });
    return {
      aiReply: state.aiReply,
      conversationHistory: state.conversationHistory,
      questions: state.questions,
      answers: state.answers,
      evaluations: state.evaluations,
      currentQuestionIndex: state.currentQuestionIndex,
      currentDifficulty: state.currentDifficulty,
      runningScores: state.runningScores,
      isComplete: state.isComplete,
      error: state.error,
    };
  },
  { name: "send_interview_message", run_type: "chain", tags: ["interview"] }
);

export interface GradeInterviewInput {
  jobTitle: string;
  jobRequirements: string[];
  questions: PlannedQuestion[];
  answers: string[];
  evaluations: InterviewState["evaluations"];
  strongSkills: string[];
  weakSkills: string[];
}

export interface GradeInterviewOutput {
  finalReport: FinalReport | null;
  dimensionScores: DimensionScores;
  overallScore: number;
  /** Legacy 0-10 per-question scores derived from dimension averages. */
  questionScores: number[];
  /** Legacy per-question feedback strings. */
  questionFeedback: string[];
  /** Legacy overall feedback (summary). */
  overallFeedback: string;
  error?: string;
}

function legacyScores(evaluations: InterviewState["evaluations"]): number[] {
  return evaluations.map((e) => {
    const weighted =
      e.scores.technical * 0.4 +
      e.scores.problemSolving * 0.3 +
      e.scores.communication * 0.2 +
      e.scores.architectureThinking * 0.1;
    return Math.max(0, Math.min(10, Math.round(weighted / 10)));
  });
}

export const runGradeInterview = traceable(
  async (input: GradeInterviewInput): Promise<GradeInterviewOutput> => {
    const state = await completeGraph.invoke({
      jobTitle: input.jobTitle,
      jobRequirements: input.jobRequirements,
      questions: input.questions,
      answers: input.answers,
      evaluations: input.evaluations,
      strongSkills: input.strongSkills,
      weakSkills: input.weakSkills,
    });
    const report = state.finalReport;
    const dimensionScores = report?.scores ?? state.runningScores;
    const overallScore = report?.overallScore ?? 0;
    return {
      finalReport: report,
      dimensionScores,
      overallScore,
      questionScores: legacyScores(state.evaluations),
      questionFeedback: state.evaluations.map((e) => e.feedback),
      overallFeedback: report?.summary ?? "",
      error: state.error,
    };
  },
  { name: "grade_interview", run_type: "chain", tags: ["interview"] }
);

import { Annotation } from "@langchain/langgraph";

/** Replace reducer — newer value wins. */
const last = <T>(a: T, b: T | undefined): T => b ?? a;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

export const QUESTION_TYPES = [
  "introduction",
  "contextual",
  "technical",
  "scenario",
  "system_design",
  "debugging",
  "communication",
  "behavioral",
  "leadership",
  "sql",
  "architecture",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface PlannedQuestion {
  type: QuestionType;
  difficulty: Difficulty;
  /** Skill area this question targets, free-form (e.g. "react", "system_design"). */
  skill?: string;
  /** Whether the question was generated lazily mid-interview vs. up-front. */
  generatedAdaptively: boolean;
  /** The final rendered question text. May be replaced by an adaptive variant. */
  prompt: string;
}

export interface DimensionScores {
  technical: number;
  communication: number;
  confidence: number;
  problemSolving: number;
  architectureThinking: number;
}

export const ZERO_SCORES: DimensionScores = {
  technical: 0,
  communication: 0,
  confidence: 0,
  problemSolving: 0,
  architectureThinking: 0,
};

export interface AnswerEvaluation {
  /** 0-100. */
  scores: DimensionScores;
  reasoning: string;
  /** One short feedback line shown to the recruiter per question. */
  feedback: string;
  /** "advance" → next planned question. "followup" → drill deeper.
   *  "harder" / "easier" → swap next question difficulty.
   *  "switch_topic" → adaptive replacement.
   *  "complete" → end interview now. */
  nextAction:
    | "advance"
    | "followup"
    | "harder"
    | "easier"
    | "switch_topic"
    | "complete";
}

export interface ResumeIntelligence {
  yearsOfExperience: number;
  technologies: string[];
  projects: string[];
  architectureExposure: string[];
  leadershipIndicators: string[];
  communicationIndicators: string[];
  strongAreas: string[];
  weakAreas: string[];
  summary: string;
}

export interface SkillMatch {
  matchedSkills: string[];
  missingSkills: string[];
  advancedOpportunities: string[];
  /** 0-100. */
  matchPercent: number;
}

export interface InterviewPlan {
  sections: { type: QuestionType; count: number }[];
  /** Initial overall difficulty. Can drift per-question via DifficultyDecisionNode. */
  startingDifficulty: Difficulty;
  /** Total questions to ask (planning may pick 6-12). */
  totalQuestions: number;
}

/**
 * Per-job AI-interview tuning sourced from `AssessmentConfig.interview`.
 * Passed in at start-time so the LangGraph nodes can shape the plan,
 * follow-up routing, and difficulty drift dynamically per job.
 */
export interface InterviewSettings {
  durationMinutes: number;
  questionCount: number;
  topics: QuestionType[];
  /** "adaptive" leaves the heuristic intact; others pin the baseline. */
  difficulty: "easy" | "medium" | "hard" | "adaptive";
  passingScore: number;
  allowFollowups: boolean;
  adaptiveDifficulty: boolean;
}

export interface FinalReport {
  passed: boolean;
  recommendation:
    | "strong_hire"
    | "proceed_to_technical"
    | "borderline"
    | "do_not_proceed";
  recommendationReason: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  skillBreakdown: { skill: string; score: number; notes?: string }[];
  failureReasons: string[];
  /** Per-dimension final scores 0-100. */
  scores: DimensionScores;
  /** Overall 0-100. */
  overallScore: number;
}

// ---------------------------------------------------------------------------
// LangGraph state annotation
// ---------------------------------------------------------------------------

export const InterviewStateAnnotation = Annotation.Root({
  // ── identity ──
  candidateId: Annotation<string>({ reducer: last, default: () => "" }),
  jobId: Annotation<string>({ reducer: last, default: () => "" }),
  interviewSessionId: Annotation<string>({ reducer: last, default: () => "" }),

  // ── job + candidate context ──
  jobTitle: Annotation<string>({ reducer: last, default: () => "" }),
  jobDescription: Annotation<string>({ reducer: last, default: () => "" }),
  jobRequirements: Annotation<string[]>({ reducer: last, default: () => [] }),
  candidateName: Annotation<string>({ reducer: last, default: () => "" }),
  resumeText: Annotation<string>({ reducer: last, default: () => "" }),

  // ── resume + skill intelligence (populated by nodes 1-2) ──
  resumeIntelligence: Annotation<ResumeIntelligence | null>({
    reducer: last,
    default: () => null,
  }),
  skillMatch: Annotation<SkillMatch | null>({ reducer: last, default: () => null }),
  strongSkills: Annotation<string[]>({ reducer: last, default: () => [] }),
  weakSkills: Annotation<string[]>({ reducer: last, default: () => [] }),

  // ── per-job tuning (set at start, immutable for the run) ──
  interviewSettings: Annotation<InterviewSettings | null>({
    reducer: last,
    default: () => null,
  }),

  // ── plan (node 3) ──
  plan: Annotation<InterviewPlan | null>({ reducer: last, default: () => null }),
  questions: Annotation<PlannedQuestion[]>({ reducer: last, default: () => [] }),

  // ── live state during interview ──
  currentQuestionIndex: Annotation<number>({ reducer: last, default: () => 0 }),
  currentDifficulty: Annotation<Difficulty>({ reducer: last, default: () => "medium" }),
  conversationHistory: Annotation<ChatMessage[]>({
    reducer: last,
    default: () => [],
  }),
  answers: Annotation<string[]>({ reducer: last, default: () => [] }),
  evaluations: Annotation<AnswerEvaluation[]>({
    reducer: last,
    default: () => [],
  }),
  userMessage: Annotation<string>({ reducer: last, default: () => "" }),
  aiReply: Annotation<string>({ reducer: last, default: () => "" }),

  // ── routing flags set by AnswerEvaluation/Difficulty nodes ──
  /** Set by AnswerEvaluation. The graph reads this to route next. */
  nextAction: Annotation<AnswerEvaluation["nextAction"]>({
    reducer: last,
    default: () => "advance",
  }),
  /** True when we've asked the last question and it's been evaluated. */
  isComplete: Annotation<boolean>({ reducer: last, default: () => false }),

  // ── running aggregated scores (mean of per-answer scores so far) ──
  runningScores: Annotation<DimensionScores>({
    reducer: last,
    default: () => ({ ...ZERO_SCORES }),
  }),
  candidateConfidence: Annotation<number>({ reducer: last, default: () => 50 }),

  // ── final report (node 10) ──
  finalReport: Annotation<FinalReport | null>({
    reducer: last,
    default: () => null,
  }),

  // ── misc ──
  currentStage: Annotation<string>({ reducer: last, default: () => "init" }),
  error: Annotation<string | undefined>({ reducer: last, default: () => undefined }),
});

export type InterviewState = typeof InterviewStateAnnotation.State;

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessage {
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

/** Per-question evaluation persisted on the session for recruiter replay. */
export interface IQuestionPlan {
  type: string;
  difficulty: "easy" | "medium" | "hard";
  skill?: string;
  generatedAdaptively: boolean;
  prompt: string;
}

export interface IDimensionScores {
  technical: number;
  communication: number;
  confidence: number;
  problemSolving: number;
  architectureThinking: number;
}

export interface IAnswerEvaluation {
  scores: IDimensionScores;
  reasoning: string;
  feedback: string;
  nextAction:
    | "advance"
    | "followup"
    | "harder"
    | "easier"
    | "switch_topic"
    | "complete";
}

export interface IResumeIntelligence {
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

export interface ISkillMatch {
  matchedSkills: string[];
  missingSkills: string[];
  advancedOpportunities: string[];
  matchPercent: number;
}

export interface IInterviewSession extends Document {
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  candidateName: string;
  candidateEmail: string;
  status: "scheduled" | "in_progress" | "completed";
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  /** Legacy plain-text questions kept for back-compat — drives UI progress counter. */
  questions: string[];
  /** New structured plan, parallel array to `questions`. */
  questionPlan?: IQuestionPlan[];

  conversationHistory: IMessage[];
  answers: string[];
  /** Parallel array to `questions` — per-question multi-dimensional evaluation. */
  evaluations?: IAnswerEvaluation[];
  currentQuestionIndex: number;
  currentDifficulty?: "easy" | "medium" | "hard";

  resumeIntelligence?: IResumeIntelligence;
  skillMatch?: ISkillMatch;
  strongSkills?: string[];
  weakSkills?: string[];

  /** Aggregated final scores (set by FinalReportNode). */
  totalScore?: number;
  dimensionScores?: IDimensionScores;
  /** Legacy parallel array — per-question 0-10. Kept to satisfy old email templates. */
  questionScores?: number[];
  questionFeedback?: string[];
  overallFeedback?: string;

  meetingUrl?: string;
  calBookingUid?: string;
  calBookingId?: number;
  calEventTypeId?: number;
  calStatus?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    role: { type: String, enum: ["assistant", "user"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DimensionScoresSchema = new Schema<IDimensionScores>(
  {
    technical: { type: Number, default: 0 },
    communication: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    problemSolving: { type: Number, default: 0 },
    architectureThinking: { type: Number, default: 0 },
  },
  { _id: false }
);

const QuestionPlanSchema = new Schema<IQuestionPlan>(
  {
    type: { type: String, required: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
    skill: { type: String },
    generatedAdaptively: { type: Boolean, default: false },
    prompt: { type: String, required: true },
  },
  { _id: false }
);

const AnswerEvaluationSchema = new Schema<IAnswerEvaluation>(
  {
    scores: { type: DimensionScoresSchema, default: () => ({}) },
    reasoning: { type: String, default: "" },
    feedback: { type: String, default: "" },
    nextAction: {
      type: String,
      enum: ["advance", "followup", "harder", "easier", "switch_topic", "complete"],
      default: "advance",
    },
  },
  { _id: false }
);

const ResumeIntelligenceSchema = new Schema<IResumeIntelligence>(
  {
    yearsOfExperience: { type: Number, default: 0 },
    technologies: { type: [String], default: [] },
    projects: { type: [String], default: [] },
    architectureExposure: { type: [String], default: [] },
    leadershipIndicators: { type: [String], default: [] },
    communicationIndicators: { type: [String], default: [] },
    strongAreas: { type: [String], default: [] },
    weakAreas: { type: [String], default: [] },
    summary: { type: String, default: "" },
  },
  { _id: false }
);

const SkillMatchSchema = new Schema<ISkillMatch>(
  {
    matchedSkills: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    advancedOpportunities: { type: [String], default: [] },
    matchPercent: { type: Number, default: 0 },
  },
  { _id: false }
);

const InterviewSessionSchema = new Schema<IInterviewSession>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobTitle: { type: String, required: true },
    jobDescription: { type: String, required: true },
    jobRequirements: [{ type: String }],
    candidateName: { type: String, required: true },
    candidateEmail: { type: String, required: true },
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed"],
      default: "scheduled",
    },
    scheduledAt: { type: Date, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    questions: [{ type: String }],
    questionPlan: { type: [QuestionPlanSchema], default: [] },
    conversationHistory: [MessageSchema],
    answers: [{ type: String }],
    evaluations: { type: [AnswerEvaluationSchema], default: [] },
    currentQuestionIndex: { type: Number, default: 0 },
    currentDifficulty: { type: String, enum: ["easy", "medium", "hard"] },

    resumeIntelligence: { type: ResumeIntelligenceSchema },
    skillMatch: { type: SkillMatchSchema },
    strongSkills: { type: [String], default: [] },
    weakSkills: { type: [String], default: [] },

    totalScore: { type: Number },
    dimensionScores: { type: DimensionScoresSchema },
    questionScores: [{ type: Number }],
    questionFeedback: [{ type: String }],
    overallFeedback: { type: String },
    meetingUrl: { type: String },
    calBookingUid: { type: String, index: true },
    calBookingId: { type: Number },
    calEventTypeId: { type: Number },
    calStatus: { type: String },
  },
  { timestamps: true }
);

// Drop the cached compiled model in dev so schema edits hot-reload cleanly.
if (process.env.NODE_ENV !== "production" && mongoose.models.InterviewSession) {
  mongoose.deleteModel("InterviewSession");
}

const InterviewSession: Model<IInterviewSession> =
  mongoose.models.InterviewSession ||
  mongoose.model<IInterviewSession>("InterviewSession", InterviewSessionSchema);

export default InterviewSession;

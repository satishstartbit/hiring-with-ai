import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  CODING_LANGUAGES,
  QUESTION_COUNT_MODES,
  INTERVIEW_TOPICS,
  type DifficultyLevel,
  type QuestionType,
  type CodingLanguage,
  type QuestionCountMode,
  type InterviewTopic,
} from "../../constants/assessment";

// Re-export so existing model imports (Assessment.ts, CandidateAnswer.ts, etc.) keep working.
export {
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  CODING_LANGUAGES,
  QUESTION_COUNT_MODES,
  INTERVIEW_TOPICS,
};
export type {
  DifficultyLevel,
  QuestionType,
  CodingLanguage,
  QuestionCountMode,
  InterviewTopic,
};

export interface ISectionMinimum {
  /** A QuestionType — required so HR can require, e.g., a 60% minimum in `coding`. */
  type: QuestionType;
  minPercent: number;
}

export interface IPassingCriteria {
  overallPercent: number;
  /** Per-type minimums. Empty means no per-section requirements. */
  sectionMinimums: ISectionMinimum[];
  /** Question types that MUST be present (no skipping allowed). */
  mandatoryTypes: QuestionType[];
}

export interface IAntiCheatSettings {
  tabSwitchDetection: boolean;
  fullscreenRequired: boolean;
  blockCopyPaste: boolean;
  webcamMonitoring: boolean;
  trackSuspiciousActivity: boolean;
  /** After this many violations the attempt is auto-terminated. 0 = never. */
  maxViolations: number;
}

export interface ICodingSettings {
  languages: CodingLanguage[];
  /** Per-question wall-clock limit, seconds. Capped well below Piston's free-tier limits. */
  timeoutSeconds: number;
  /** Whether AI is asked to score code quality / complexity beyond correctness. */
  enableQualityAnalysis: boolean;
}

export interface IInterviewSettings {
  /** Target wall-clock budget for the AI interview, shown to the candidate. */
  durationMinutes: number;
  /** Total questions the planner will produce (clamped at 4-15 server-side). */
  questionCount: number;
  /** Topic mix the planner will draw from. Empty array = planner picks. */
  topics: InterviewTopic[];
  /** Baseline difficulty handed to the planner. */
  difficulty: DifficultyLevel;
  /** Minimum 0-100 score to pass the AI interview. */
  passingScore: number;
  /** When false, the evaluator's "followup" hints are downgraded to "advance". */
  allowFollowups: boolean;
  /** When false, "harder"/"easier"/"switch_topic" routing is clamped to "advance". */
  adaptiveDifficulty: boolean;
}

export interface IAssessmentConfig extends Document {
  jobId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;

  difficulty: DifficultyLevel;
  enabledQuestionTypes: QuestionType[];
  durationMinutes: number;
  questionCountMode: QuestionCountMode;
  /** When mode = "fixed", this is the total. When "dynamic", treat as a soft target. */
  questionCount: number;
  skills: string[];

  passingCriteria: IPassingCriteria;
  antiCheat: IAntiCheatSettings;
  coding: ICodingSettings;
  interview: IInterviewSettings;

  /** True once HR has saved a complete config and assessment can be served to candidates. */
  isPublished: boolean;
  publishedAt?: Date;

  createdBy?: mongoose.Types.ObjectId;
  lastEditedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SectionMinimumSchema = new Schema<ISectionMinimum>(
  {
    type: { type: String, enum: QUESTION_TYPES, required: true },
    minPercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const PassingCriteriaSchema = new Schema<IPassingCriteria>(
  {
    overallPercent: { type: Number, default: 60, min: 0, max: 100 },
    sectionMinimums: { type: [SectionMinimumSchema], default: [] },
    mandatoryTypes: { type: [{ type: String, enum: QUESTION_TYPES }], default: [] },
  },
  { _id: false }
);

const AntiCheatSchema = new Schema<IAntiCheatSettings>(
  {
    tabSwitchDetection: { type: Boolean, default: true },
    fullscreenRequired: { type: Boolean, default: false },
    blockCopyPaste: { type: Boolean, default: true },
    webcamMonitoring: { type: Boolean, default: false },
    trackSuspiciousActivity: { type: Boolean, default: true },
    maxViolations: { type: Number, default: 3, min: 0, max: 50 },
  },
  { _id: false }
);

const CodingSettingsSchema = new Schema<ICodingSettings>(
  {
    languages: {
      type: [{ type: String, enum: CODING_LANGUAGES }],
      default: ["javascript", "python"],
    },
    timeoutSeconds: { type: Number, default: 10, min: 1, max: 60 },
    enableQualityAnalysis: { type: Boolean, default: true },
  },
  { _id: false }
);

const InterviewSettingsSchema = new Schema<IInterviewSettings>(
  {
    durationMinutes: { type: Number, default: 15, min: 1, max: 120 },
    questionCount: { type: Number, default: 8, min: 4, max: 15 },
    topics: {
      type: [{ type: String, enum: INTERVIEW_TOPICS }],
      default: ["introduction", "technical", "scenario", "behavioral"],
    },
    difficulty: { type: String, enum: DIFFICULTY_LEVELS, default: "medium" },
    passingScore: { type: Number, default: 20, min: 0, max: 100 },
    allowFollowups: { type: Boolean, default: true },
    adaptiveDifficulty: { type: Boolean, default: true },
  },
  { _id: false }
);

const AssessmentConfigSchema = new Schema<IAssessmentConfig>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, unique: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },

    difficulty: { type: String, enum: DIFFICULTY_LEVELS, default: "medium" },
    enabledQuestionTypes: {
      type: [{ type: String, enum: QUESTION_TYPES }],
      default: ["mcq", "short_answer", "scenario"],
    },
    durationMinutes: { type: Number, default: 30, min: 1, max: 480 },
    questionCountMode: { type: String, enum: QUESTION_COUNT_MODES, default: "fixed" },
    questionCount: { type: Number, default: 10, min: 1, max: 100 },
    skills: { type: [String], default: [] },

    passingCriteria: { type: PassingCriteriaSchema, default: () => ({}) },
    antiCheat: { type: AntiCheatSchema, default: () => ({}) },
    coding: { type: CodingSettingsSchema, default: () => ({}) },
    interview: { type: InterviewSettingsSchema, default: () => ({}) },

    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

AssessmentConfigSchema.index({ workspaceId: 1, jobId: 1 });
AssessmentConfigSchema.index({ companyId: 1 });

// Drop the cached compiled model in dev so schema edits hot-reload cleanly.
// Without this, adding new fields (e.g. `interview`) leaves the previously
// compiled model in `mongoose.models`, which silently strips unknown fields
// on save and returns `undefined` on read — masking config-driven behavior.
if (process.env.NODE_ENV !== "production" && mongoose.models.AssessmentConfig) {
  mongoose.deleteModel("AssessmentConfig");
}

const AssessmentConfig: Model<IAssessmentConfig> =
  mongoose.models.AssessmentConfig ||
  mongoose.model<IAssessmentConfig>("AssessmentConfig", AssessmentConfigSchema);

export default AssessmentConfig;

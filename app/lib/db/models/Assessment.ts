import mongoose, { Schema, Document, Model } from "mongoose";
import { DIFFICULTY_LEVELS, QUESTION_TYPES, type DifficultyLevel, type QuestionType } from "./AssessmentConfig";

export const ASSESSMENT_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "evaluated",
  "terminated",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

/**
 * A planned question within an assessment attempt. Populated by the AI engine
 * in Phase 2. For coding questions, `testCases` and `starterCode` are used.
 */
export interface IPlannedQuestion {
  questionId: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  skill?: string;
  prompt: string;
  /** MCQ / multi_select options. */
  options?: string[];
  /** For MCQ / multi_select, the indices of correct options. Hidden from candidate. */
  correctIndices?: number[];
  /** For coding/sql questions. */
  starterCode?: string;
  language?: string;
  testCases?: Array<{ input: string; expectedOutput: string; hidden: boolean }>;
  /** Soft time hint in seconds — UI shows a ticker but the overall duration is enforced. */
  timeHintSeconds?: number;
  /** True if AI generated this on-the-fly during the attempt (adaptive mode). */
  generatedDuringAttempt: boolean;
}

export interface IAssessment extends Document {
  jobId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  configId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;

  status: AssessmentStatus;
  questions: IPlannedQuestion[];
  currentQuestionIndex: number;

  startedAt?: Date;
  submittedAt?: Date;
  evaluatedAt?: Date;
  /** Hard deadline = startedAt + config.durationMinutes. Mirrored here for quick reads. */
  expiresAt?: Date;

  /** Counters mirrored from related collections for fast dashboard queries. */
  violationCount: number;
  /** Soft seed used by AI generator so the same candidate retrying gets a different paper. */
  generationSeed?: string;

  createdAt: Date;
  updatedAt: Date;
}

const PlannedQuestionSchema = new Schema<IPlannedQuestion>(
  {
    questionId: { type: String, required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    difficulty: { type: String, enum: DIFFICULTY_LEVELS, required: true },
    skill: { type: String },
    prompt: { type: String, required: true },
    options: { type: [String] },
    correctIndices: { type: [Number] },
    starterCode: { type: String },
    language: { type: String },
    testCases: [
      {
        _id: false,
        input: String,
        expectedOutput: String,
        hidden: { type: Boolean, default: true },
      },
    ],
    timeHintSeconds: { type: Number },
    generatedDuringAttempt: { type: Boolean, default: false },
  },
  { _id: false }
);

const AssessmentSchema = new Schema<IAssessment>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    configId: { type: Schema.Types.ObjectId, ref: "AssessmentConfig", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },

    status: { type: String, enum: ASSESSMENT_STATUSES, default: "not_started" },
    questions: { type: [PlannedQuestionSchema], default: [] },
    currentQuestionIndex: { type: Number, default: 0 },

    startedAt: { type: Date },
    submittedAt: { type: Date },
    evaluatedAt: { type: Date },
    expiresAt: { type: Date },

    violationCount: { type: Number, default: 0 },
    generationSeed: { type: String },
  },
  { timestamps: true }
);

AssessmentSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
AssessmentSchema.index({ workspaceId: 1, status: 1 });
AssessmentSchema.index({ expiresAt: 1 });

const Assessment: Model<IAssessment> =
  mongoose.models.Assessment || mongoose.model<IAssessment>("Assessment", AssessmentSchema);

export default Assessment;

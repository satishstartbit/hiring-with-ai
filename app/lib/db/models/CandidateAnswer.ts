import mongoose, { Schema, Document, Model } from "mongoose";
import { QUESTION_TYPES, type QuestionType } from "./AssessmentConfig";

/**
 * One answer per question per assessment attempt. Separated from Assessment so a
 * candidate's responses can be streamed in / retried atomically without
 * rewriting the whole attempt document.
 */
export interface ICandidateAnswer extends Document {
  assessmentId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;

  questionId: string;
  questionType: QuestionType;

  /** Text / scenario / debugging answers. */
  textAnswer?: string;
  /** MCQ — selected index. multi_select — array of indices. */
  selectedIndices?: number[];
  /** Coding/sql answers — points at a CodingSubmission doc with the run history. */
  codingSubmissionId?: mongoose.Types.ObjectId;
  /** Voice/video answers — storage key (S3 / Cloudinary path). Phase 3+. */
  mediaUrl?: string;

  startedAt?: Date;
  submittedAt?: Date;
  /** Time the candidate actively spent on this question, in seconds. */
  timeSpentSeconds: number;

  /** AI scoring results, populated by the evaluation step. */
  score?: number;
  maxScore?: number;
  aiFeedback?: string;
  /** Raw evaluator output (e.g. dimension scores) — opaque blob for now. */
  evaluationMeta?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const CandidateAnswerSchema = new Schema<ICandidateAnswer>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },

    questionId: { type: String, required: true },
    questionType: { type: String, enum: QUESTION_TYPES, required: true },

    textAnswer: { type: String },
    selectedIndices: { type: [Number] },
    codingSubmissionId: { type: Schema.Types.ObjectId, ref: "CodingSubmission" },
    mediaUrl: { type: String },

    startedAt: { type: Date },
    submittedAt: { type: Date },
    timeSpentSeconds: { type: Number, default: 0 },

    score: { type: Number },
    maxScore: { type: Number },
    aiFeedback: { type: String },
    evaluationMeta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

CandidateAnswerSchema.index({ assessmentId: 1, questionId: 1 }, { unique: true });
CandidateAnswerSchema.index({ candidateId: 1, jobId: 1 });

const CandidateAnswer: Model<ICandidateAnswer> =
  mongoose.models.CandidateAnswer ||
  mongoose.model<ICandidateAnswer>("CandidateAnswer", CandidateAnswerSchema);

export default CandidateAnswer;

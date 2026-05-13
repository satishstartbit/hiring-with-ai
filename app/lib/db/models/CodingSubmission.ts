import mongoose, { Schema, Document, Model } from "mongoose";
import { CODING_LANGUAGES, type CodingLanguage } from "./AssessmentConfig";

export interface ITestCaseResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  /** Hidden test cases are graded but not shown to the candidate. */
  hidden: boolean;
  runtimeMs?: number;
}

export interface ICodingRun {
  ranAt: Date;
  language: CodingLanguage;
  code: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  testResults: ITestCaseResult[];
  /** Total wall time the executor reported. */
  durationMs?: number;
}

/**
 * A coding answer's full run history. The candidate may "Run" many times and
 * "Submit" once; only the most recent run is considered the submission.
 */
export interface ICodingSubmission extends Document {
  assessmentId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;

  questionId: string;
  language: CodingLanguage;
  /** All "Run" attempts in chronological order. */
  runs: ICodingRun[];
  /** Final submitted code (denormalized for quick reads in HR review). */
  finalCode?: string;
  submittedAt?: Date;

  /** AI evaluation. */
  correctnessScore?: number;
  qualityScore?: number;
  complexityNotes?: string;
  approachNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const TestCaseResultSchema = new Schema<ITestCaseResult>(
  {
    input: String,
    expectedOutput: String,
    actualOutput: String,
    passed: { type: Boolean, default: false },
    hidden: { type: Boolean, default: true },
    runtimeMs: { type: Number },
  },
  { _id: false }
);

const CodingRunSchema = new Schema<ICodingRun>(
  {
    ranAt: { type: Date, default: Date.now },
    language: { type: String, enum: CODING_LANGUAGES, required: true },
    code: { type: String, required: true },
    stdout: { type: String, default: "" },
    stderr: { type: String, default: "" },
    exitCode: { type: Number, default: 0 },
    timedOut: { type: Boolean, default: false },
    testResults: { type: [TestCaseResultSchema], default: [] },
    durationMs: { type: Number },
  },
  { _id: false }
);

const CodingSubmissionSchema = new Schema<ICodingSubmission>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },

    questionId: { type: String, required: true },
    language: { type: String, enum: CODING_LANGUAGES, required: true },
    runs: { type: [CodingRunSchema], default: [] },
    finalCode: { type: String },
    submittedAt: { type: Date },

    correctnessScore: { type: Number },
    qualityScore: { type: Number },
    complexityNotes: { type: String },
    approachNotes: { type: String },
  },
  { timestamps: true }
);

CodingSubmissionSchema.index({ assessmentId: 1, questionId: 1 }, { unique: true });

const CodingSubmission: Model<ICodingSubmission> =
  mongoose.models.CodingSubmission ||
  mongoose.model<ICodingSubmission>("CodingSubmission", CodingSubmissionSchema);

export default CodingSubmission;

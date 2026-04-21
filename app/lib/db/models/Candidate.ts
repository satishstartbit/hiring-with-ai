import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICandidate extends Document {
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  skills: string[];
  jobId: mongoose.Types.ObjectId;
  jobTitle: string;
  status: "applied" | "reviewing" | "interviewing" | "offer" | "hired" | "rejected";
  source: "website" | "referral" | "manual";
  resumeData?: Buffer;
  resumeFilename?: string;
  resumeContentType?: string;
  screeningQuestions?: string[];
  screeningAnswers?: string[];
  resumeMatchScore?: number;
  resumeMatchReason?: string;
  screeningTimeLimitSeconds?: number;
  answerScore?: number;
  questionScores?: number[];
  questionFeedback?: string[];
  overallFeedback?: string;
  appliedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CandidateSchema = new Schema<ICandidate>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    currentTitle: { type: String },
    currentCompany: { type: String },
    skills: [{ type: String }],
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobTitle: { type: String, required: true },
    status: {
      type: String,
      enum: ["applied", "reviewing", "interviewing", "offer", "hired", "rejected"],
      default: "applied",
    },
    source: {
      type: String,
      enum: ["website", "referral", "manual"],
      default: "website",
    },
    resumeData: { type: Buffer },
    resumeFilename: { type: String },
    resumeContentType: { type: String },
    screeningQuestions: [{ type: String }],
    screeningAnswers: [{ type: String }],
    resumeMatchScore: { type: Number },
    resumeMatchReason: { type: String },
    screeningTimeLimitSeconds: { type: Number },
    answerScore: { type: Number },
    questionScores: [{ type: Number }],
    questionFeedback: [{ type: String }],
    overallFeedback: { type: String },
    appliedAt: { type: Date, default: Date.now },
    notes: { type: String },
  },
  { timestamps: true }
);

const Candidate: Model<ICandidate> =
  mongoose.models.Candidate ||
  mongoose.model<ICandidate>("Candidate", CandidateSchema);

export default Candidate;

import mongoose, { Schema, Document, Model } from "mongoose";

export const HIRING_RECOMMENDATIONS = [
  "strong_hire",
  "proceed_to_technical",
  "borderline",
  "do_not_proceed",
] as const;
export type HiringRecommendation = (typeof HIRING_RECOMMENDATIONS)[number];

export interface ISkillBreakdown {
  skill: string;
  score: number;
  notes?: string;
}

/**
 * Final AI-generated assessment report. One per Assessment, written by the
 * evaluation step. HR can also reject / approve and add reviewer notes.
 */
export interface IAIReport extends Document {
  assessmentId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;

  technicalScore: number;
  problemSolvingScore: number;
  communicationScore: number;
  codingScore: number;
  confidenceScore: number;
  overallScore: number;

  recommendation: HiringRecommendation;
  recommendationReason: string;

  strengths: string[];
  weaknesses: string[];
  skillBreakdown: ISkillBreakdown[];
  summary: string;

  passed: boolean;
  /** Reasons we marked them failed (e.g. missed section minimums). */
  failureReasons: string[];

  /** HR reviewer actions. */
  reviewerNotes?: string;
  reviewerDecision?: "approved" | "rejected" | "pending";
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SkillBreakdownSchema = new Schema<ISkillBreakdown>(
  {
    skill: { type: String, required: true },
    score: { type: Number, required: true },
    notes: { type: String },
  },
  { _id: false }
);

const AIReportSchema = new Schema<IAIReport>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true, unique: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },

    technicalScore: { type: Number, default: 0 },
    problemSolvingScore: { type: Number, default: 0 },
    communicationScore: { type: Number, default: 0 },
    codingScore: { type: Number, default: 0 },
    confidenceScore: { type: Number, default: 0 },
    overallScore: { type: Number, default: 0 },

    recommendation: { type: String, enum: HIRING_RECOMMENDATIONS, default: "borderline" },
    recommendationReason: { type: String, default: "" },

    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    skillBreakdown: { type: [SkillBreakdownSchema], default: [] },
    summary: { type: String, default: "" },

    passed: { type: Boolean, default: false },
    failureReasons: { type: [String], default: [] },

    reviewerNotes: { type: String },
    reviewerDecision: { type: String, enum: ["approved", "rejected", "pending"] },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

AIReportSchema.index({ workspaceId: 1, jobId: 1 });
AIReportSchema.index({ candidateId: 1 });

const AIReport: Model<IAIReport> =
  mongoose.models.AIReport || mongoose.model<IAIReport>("AIReport", AIReportSchema);

export default AIReport;

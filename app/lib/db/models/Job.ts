import mongoose, { Schema, Document, Model } from "mongoose";

export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "remote"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const JOB_STATUSES = ["draft", "ai_generated", "active", "closed", "filled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface ISalaryRange {
  min: number;
  max: number;
  currency: string;
  period: "year" | "month" | "hour";
}

export interface IInterviewRound {
  name: string;
  type: "screening" | "technical" | "system_design" | "behavioral" | "managerial" | "hr" | "other";
  durationMinutes?: number;
}

export const APPLICATION_QUESTION_KINDS = ["short_text", "long_text", "number"] as const;
export type ApplicationQuestionKind = (typeof APPLICATION_QUESTION_KINDS)[number];

export interface IApplicationQuestion {
  question: string;
  kind: ApplicationQuestionKind;
  placeholder?: string;
  required: boolean;
}

export interface IJob extends Document {
  title: string;
  department: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  preferredQualifications: string[];
  skills: string[];
  suggestedSkills: string[];
  experienceRequired: string;
  salary: ISalaryRange | null;
  location: string;
  workMode: WorkMode;
  type: EmploymentType;
  status: JobStatus;
  numberOfOpenings: number;
  interviewRounds: IInterviewRound[];
  screeningQuestions: string[];
  applicationQuestions: IApplicationQuestion[];
  interviewProcessSummary: string;
  applicantCount: number;

  // Tenancy (optional for back-compat with pre-Phase-2 data; required on create from new flow)
  companyId?: mongoose.Types.ObjectId;
  workspaceId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;

  workflowRunId?: string;
  aiGeneratedAt?: Date;
  postedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SalarySchema = new Schema<ISalaryRange>(
  {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    currency: { type: String, required: true, default: "USD" },
    period: { type: String, enum: ["year", "month", "hour"], default: "year" },
  },
  { _id: false }
);

const InterviewRoundSchema = new Schema<IInterviewRound>(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["screening", "technical", "system_design", "behavioral", "managerial", "hr", "other"],
      default: "technical",
    },
    durationMinutes: { type: Number },
  },
  { _id: false }
);

const ApplicationQuestionSchema = new Schema<IApplicationQuestion>(
  {
    question: { type: String, required: true, trim: true },
    kind: { type: String, enum: APPLICATION_QUESTION_KINDS, default: "short_text" },
    placeholder: { type: String, trim: true },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);

const JobSchema = new Schema<IJob>(
  {
    title: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    requirements: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    preferredQualifications: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    suggestedSkills: { type: [String], default: [] },
    experienceRequired: { type: String, default: "" },
    salary: { type: SalarySchema, default: null },
    location: { type: String, default: "Remote" },
    workMode: { type: String, enum: WORK_MODES, default: "remote" },
    type: { type: String, enum: EMPLOYMENT_TYPES, default: "full-time" },
    status: { type: String, enum: JOB_STATUSES, default: "draft" },
    numberOfOpenings: { type: Number, default: 1, min: 1 },
    interviewRounds: { type: [InterviewRoundSchema], default: [] },
    screeningQuestions: { type: [String], default: [] },
    applicationQuestions: { type: [ApplicationQuestionSchema], default: [] },
    interviewProcessSummary: { type: String, default: "" },
    applicantCount: { type: Number, default: 0 },

    companyId: { type: Schema.Types.ObjectId, ref: "Company" },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },

    workflowRunId: { type: String },
    aiGeneratedAt: { type: Date },
    postedAt: { type: Date },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

JobSchema.index({ workspaceId: 1, createdAt: -1 });
JobSchema.index({ companyId: 1 });
JobSchema.index({ status: 1 });

const Job: Model<IJob> = mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);

export default Job;

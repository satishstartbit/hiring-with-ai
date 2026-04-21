import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWorkflowStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  error?: string;
}

export interface IWorkflowRun extends Document {
  userRequest: string;
  jobId?: mongoose.Types.ObjectId;
  status: "running" | "completed" | "failed";
  steps: IWorkflowStep[];
  langsmithRunId?: string;
  analyzedRole?: string;
  analyzedDepartment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowStepSchema = new Schema<IWorkflowStep>(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    output: { type: String },
    error: { type: String },
  },
  { _id: false }
);

const WorkflowRunSchema = new Schema<IWorkflowRun>(
  {
    userRequest: { type: String, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    steps: [WorkflowStepSchema],
    langsmithRunId: { type: String },
    analyzedRole: { type: String },
    analyzedDepartment: { type: String },
  },
  { timestamps: true }
);

const WorkflowRun: Model<IWorkflowRun> =
  mongoose.models.WorkflowRun ||
  mongoose.model<IWorkflowRun>("WorkflowRun", WorkflowRunSchema);

export default WorkflowRun;

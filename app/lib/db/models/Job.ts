import mongoose, { Schema, Document, Model } from "mongoose";

export interface IJob extends Document {
  title: string;
  department: string;
  description: string;
  requirements: string[];
  location: string;
  type: "full-time" | "part-time" | "contract" | "remote";
  status: "draft" | "active" | "closed" | "filled";
  applicantCount: number;
  workflowRunId?: string;
  postedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    title: { type: String, required: true },
    department: { type: String, required: true },
    description: { type: String, required: true },
    requirements: [{ type: String }],
    location: { type: String, default: "Remote" },
    type: {
      type: String,
      enum: ["full-time", "part-time", "contract", "remote"],
      default: "full-time",
    },
    status: {
      type: String,
      enum: ["draft", "active", "closed", "filled"],
      default: "draft",
    },
    applicantCount: { type: Number, default: 0 },
    workflowRunId: { type: String },
    postedAt: { type: Date },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

const Job: Model<IJob> =
  mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);

export default Job;

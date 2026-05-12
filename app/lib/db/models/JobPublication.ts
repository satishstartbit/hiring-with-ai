import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { INTEGRATION_PROVIDERS } from "./Integration";

export const PUBLICATION_STATUSES = ["pending", "published", "failed", "removed"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

const JobPublicationSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: String, enum: INTEGRATION_PROVIDERS, required: true },
    status: { type: String, enum: PUBLICATION_STATUSES, default: "pending" },
    externalPostId: { type: String, default: "" },
    externalUrl: { type: String, default: "" },
    publisherAccountEmail: { type: String, default: "" },
    publisherAccountName: { type: String, default: "" },
    publishedAt: { type: Date },
    errorMessage: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

JobPublicationSchema.index({ jobId: 1, provider: 1 });
JobPublicationSchema.index({ workspaceId: 1, publishedAt: -1 });

export type JobPublicationDoc = InferSchemaType<typeof JobPublicationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const JobPublication: Model<JobPublicationDoc> =
  (mongoose.models.JobPublication as Model<JobPublicationDoc>) ||
  mongoose.model<JobPublicationDoc>("JobPublication", JobPublicationSchema);

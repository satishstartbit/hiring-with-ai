import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const WorkspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    brandingId: { type: Schema.Types.ObjectId, ref: "Branding" },
    memberCount: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

WorkspaceSchema.index({ slug: 1 }, { unique: true });
WorkspaceSchema.index({ companyId: 1 });
WorkspaceSchema.index({ deletedAt: 1 });

export type WorkspaceDoc = InferSchemaType<typeof WorkspaceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Workspace: Model<WorkspaceDoc> =
  (mongoose.models.Workspace as Model<WorkspaceDoc>) ||
  mongoose.model<WorkspaceDoc>("Workspace", WorkspaceSchema);

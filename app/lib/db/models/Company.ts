import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CompanySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    domain: { type: String, required: true, trim: true, lowercase: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    logoUrl: { type: String, default: "" },
    size: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
      required: true,
    },
    industry: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    timezone: { type: String, required: true, trim: true },
    primaryWorkspaceId: { type: Schema.Types.ObjectId, ref: "Workspace" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CompanySchema.index({ domain: 1 }, { unique: true });
CompanySchema.index({ deletedAt: 1 });

export type CompanyDoc = InferSchemaType<typeof CompanySchema> & { _id: mongoose.Types.ObjectId };

export const Company: Model<CompanyDoc> =
  (mongoose.models.Company as Model<CompanyDoc>) ||
  mongoose.model<CompanyDoc>("Company", CompanySchema);

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const BrandingSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    logoUrl: { type: String, default: "" },
    faviconUrl: { type: String, default: "" },
    primaryColor: { type: String, default: "#4f46e5" },
    accentColor: { type: String, default: "#a855f7" },
    emailHeader: { type: String, default: "" },
    emailFooter: { type: String, default: "" },
    careerPageTagline: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BrandingSchema.index({ workspaceId: 1 }, { unique: true });

export type BrandingDoc = InferSchemaType<typeof BrandingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Branding: Model<BrandingDoc> =
  (mongoose.models.Branding as Model<BrandingDoc>) ||
  mongoose.model<BrandingDoc>("Branding", BrandingSchema);

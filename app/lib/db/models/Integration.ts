import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from "../../constants/integrations";

export { INTEGRATION_PROVIDERS };
export type { IntegrationProvider };

const IntegrationSchema = new Schema(
  {
    provider: { type: String, enum: INTEGRATION_PROVIDERS, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    status: {
      type: String,
      enum: ["connected", "disconnected", "expired", "error"],
      default: "disconnected",
    },
    accountEmail: { type: String, default: "" },
    accountName: { type: String, default: "" },
    externalAccountId: { type: String, default: "" },
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    tokenExpiresAt: { type: Date, default: null },
    scope: { type: String, default: "" },
    lastSyncAt: { type: Date, default: null },
    profileSnapshot: { type: Schema.Types.Mixed, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

IntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });
IntegrationSchema.index({ workspaceId: 1 });
IntegrationSchema.index({ status: 1 });

export type IntegrationDoc = InferSchemaType<typeof IntegrationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Integration: Model<IntegrationDoc> =
  (mongoose.models.Integration as Model<IntegrationDoc>) ||
  mongoose.model<IntegrationDoc>("Integration", IntegrationSchema);

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from "../../constants/integrations";

export { INTEGRATION_PROVIDERS };
export type { IntegrationProvider };

const IntegrationConfigSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    provider: { type: String, enum: INTEGRATION_PROVIDERS, required: true },
    clientId: { type: String, default: "" },
    clientSecret: { type: String, default: "" },
    redirectUri: { type: String, default: "" },
    scope: { type: String, default: "" },
    configuredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    configuredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

IntegrationConfigSchema.index({ workspaceId: 1, provider: 1 }, { unique: true });

export type IntegrationConfigDoc = InferSchemaType<typeof IntegrationConfigSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const IntegrationConfig: Model<IntegrationConfigDoc> =
  (mongoose.models.IntegrationConfig as Model<IntegrationConfigDoc>) ||
  mongoose.model<IntegrationConfigDoc>("IntegrationConfig", IntegrationConfigSchema);

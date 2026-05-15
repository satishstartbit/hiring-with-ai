import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ROLES = [
  "super_admin",
  "company_admin",
  "recruiter",
  "hr_manager",
  "hiring_manager",
  "candidate",
] as const;

export type Role = (typeof ROLES)[number];

const UserSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: "" },
    role: { type: String, enum: ROLES, required: true, default: "recruiter" },
    // Identity verification (used by the proctoring identity gate).
    // The photo is stored as a Buffer to keep MVP infra simple (no Cloudinary/S3
    // yet) and the descriptor is the 128-d face-api.js embedding the gate
    // compares the live webcam frame against. These are user-level so a
    // candidate uploads once and the descriptor is reused for every job they
    // apply to.
    profilePhotoData: { type: Buffer, default: null, select: false },
    profilePhotoContentType: { type: String, default: null },
    profilePhotoUpdatedAt: { type: Date, default: null },
    faceDescriptor: { type: [Number], default: null, select: false },
    // Candidates have no company/workspace — these are HR-side concepts.
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    emailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String, default: null },
    emailVerifyTokenExpiresAt: { type: Date, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetTokenExpiresAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ workspaceId: 1 });
UserSchema.index({ companyId: 1 });
UserSchema.index({ deletedAt: 1 });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

// Drop the cached compiled model in dev so schema edits (new identity fields,
// indexes, etc.) hot-reload cleanly. Without this, mongoose silently strips
// unknown fields on save when the dev server hot-reloads a schema change.
if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  mongoose.deleteModel("User");
}

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) || mongoose.model<UserDoc>("User", UserSchema);

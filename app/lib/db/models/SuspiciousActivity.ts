import mongoose, { Schema, Document, Model } from "mongoose";

export const VIOLATION_TYPES = [
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "copy",
  "paste",
  "right_click",
  "devtools_open",
  "multiple_faces",
  "no_face",
  "looking_away",
  "background_voice",
  "other",
] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const VIOLATION_SEVERITY = ["low", "medium", "high", "critical"] as const;
export type ViolationSeverity = (typeof VIOLATION_SEVERITY)[number];

export interface ISuspiciousActivity extends Document {
  assessmentId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;

  type: ViolationType;
  severity: ViolationSeverity;
  /** Question the candidate was on when the violation fired. */
  questionId?: string;
  /** Free-form context (e.g. "user pressed Ctrl+C"). */
  detail?: string;
  /** Snapshot URL if webcam captured one. Phase 3+. */
  snapshotUrl?: string;

  occurredAt: Date;
  createdAt: Date;
}

const SuspiciousActivitySchema = new Schema<ISuspiciousActivity>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: "Assessment", required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },

    type: { type: String, enum: VIOLATION_TYPES, required: true },
    severity: { type: String, enum: VIOLATION_SEVERITY, default: "low" },
    questionId: { type: String },
    detail: { type: String },
    snapshotUrl: { type: String },

    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SuspiciousActivitySchema.index({ assessmentId: 1, occurredAt: 1 });
SuspiciousActivitySchema.index({ workspaceId: 1, jobId: 1 });

const SuspiciousActivity: Model<ISuspiciousActivity> =
  mongoose.models.SuspiciousActivity ||
  mongoose.model<ISuspiciousActivity>("SuspiciousActivity", SuspiciousActivitySchema);

export default SuspiciousActivity;

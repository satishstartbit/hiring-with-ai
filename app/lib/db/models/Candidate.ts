import mongoose, { Schema, Document, Model } from "mongoose";

export interface IApplicationAnswer {
  question: string;
  answer: string;
}

export interface IProctoringSnapshot {
  data: Buffer;
  contentType: string;
  capturedAt: Date;
}

export type ProctoringViolationType =
  | "camera_denied"
  | "camera_lost"
  | "tab_switch"
  | "window_blur"
  | "multi_face"
  | "no_face"
  | "voice_detected";

export interface IProctoringViolation {
  type: ProctoringViolationType;
  /** "warning" = first offence, user was warned. "terminate" = quiz force-closed. */
  level: "warning" | "terminate";
  at: Date;
}

/**
 * Where the candidate is in the multi-session apply pipeline.
 *
 * - screening: resume submitted, AI matched, but quiz not yet started
 * - quiz_in_progress: quiz generated and shown — questions are saved so
 *   closing the tab and coming back later replays the same set
 * - quiz_completed: quiz submitted and graded; interview can be started
 * - interview_in_progress: AI interview session created
 * - completed: interview finished and graded
 * - rejected: resume did not match (terminal)
 */
export type CandidateStage =
  | "screening"
  | "quiz_in_progress"
  | "quiz_completed"
  | "interview_in_progress"
  | "completed"
  | "rejected";

export type PersistedQuestionType = "mcq" | "multi_select" | "descriptive" | "coding";

export interface IPersistedQuizQuestion {
  type: PersistedQuestionType;
  text: string;
  /** mcq + multi_select */
  options?: string[];
  /** mcq only — index of the single correct option */
  correctIndex?: number;
  /** multi_select only — indices of all correct options (order doesn't matter) */
  correctIndices?: number[];
  /** coding only — language slug the candidate writes in (matches AssessmentConfig.coding.languages) */
  language?: string;
  /** coding only — pre-filled code stub shown to the candidate */
  starterCode?: string;
  /** coding only — sample reference solution kept server-side as grading context, never sent to candidate */
  referenceSolution?: string;
}

export interface ICandidate extends Document {
  /** Owner of the application — every candidate must be a logged-in User. */
  userId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  skills: string[];
  jobId: mongoose.Types.ObjectId;
  jobTitle: string;
  /** Multi-session pipeline state. Drives which CTA the candidate sees. */
  stage: CandidateStage;
  status: "applied" | "reviewing" | "interviewing" | "offer" | "hired" | "rejected";
  source: "website" | "referral" | "manual";
  resumeData?: Buffer;
  resumeFilename?: string;
  resumeContentType?: string;
  applicationAnswers?: IApplicationAnswer[];
  proctoringSnapshots?: IProctoringSnapshot[];
  proctoringViolations?: IProctoringViolation[];
  /** Set true when the quiz was force-closed by the proctoring system. */
  proctoringFlagged?: boolean;
  /** Quiz questions persisted on first open so the candidate replays the same set across sessions. */
  quizQuestions?: IPersistedQuizQuestion[];
  quizTimeLimitSeconds?: number;
  quizStartedAt?: Date;
  quizSubmittedAt?: Date;
  /** Texts (no correctIndex) of the questions the candidate answered. */
  screeningQuestions?: string[];
  screeningAnswers?: string[];
  resumeMatchScore?: number;
  resumeMatchReason?: string;
  screeningTimeLimitSeconds?: number;
  answerScore?: number;
  questionScores?: number[];
  questionFeedback?: string[];
  overallFeedback?: string;
  /** Linked InterviewSession id (Stage 3). */
  interviewSessionId?: mongoose.Types.ObjectId;
  appliedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PersistedQuizQuestionSchema = new Schema<IPersistedQuizQuestion>(
  {
    type: {
      type: String,
      enum: ["mcq", "multi_select", "descriptive", "coding"],
      required: true,
    },
    text: { type: String, required: true },
    options: { type: [String], default: undefined },
    correctIndex: { type: Number, default: undefined },
    correctIndices: { type: [Number], default: undefined },
    language: { type: String, default: undefined },
    starterCode: { type: String, default: undefined },
    referenceSolution: { type: String, default: undefined },
  },
  { _id: false }
);

const CandidateSchema = new Schema<ICandidate>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    currentTitle: { type: String },
    currentCompany: { type: String },
    skills: [{ type: String }],
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobTitle: { type: String, required: true },
    stage: {
      type: String,
      enum: [
        "screening",
        "quiz_in_progress",
        "quiz_completed",
        "interview_in_progress",
        "completed",
        "rejected",
      ],
      default: "screening",
    },
    status: {
      type: String,
      enum: ["applied", "reviewing", "interviewing", "offer", "hired", "rejected"],
      default: "applied",
    },
    source: {
      type: String,
      enum: ["website", "referral", "manual"],
      default: "website",
    },
    resumeData: { type: Buffer },
    resumeFilename: { type: String },
    resumeContentType: { type: String },
    applicationAnswers: {
      type: [
        new Schema<IApplicationAnswer>(
          {
            question: { type: String, required: true },
            answer: { type: String, default: "" },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    proctoringSnapshots: {
      type: [
        new Schema<IProctoringSnapshot>(
          {
            data: { type: Buffer, required: true },
            contentType: { type: String, default: "image/jpeg" },
            capturedAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    proctoringViolations: {
      type: [
        new Schema<IProctoringViolation>(
          {
            type: {
              type: String,
              enum: [
                "camera_denied",
                "camera_lost",
                "tab_switch",
                "window_blur",
                "multi_face",
                "no_face",
                "voice_detected",
              ],
              required: true,
            },
            level: { type: String, enum: ["warning", "terminate"], required: true },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    proctoringFlagged: { type: Boolean, default: false },
    quizQuestions: { type: [PersistedQuizQuestionSchema], default: undefined },
    quizTimeLimitSeconds: { type: Number },
    quizStartedAt: { type: Date },
    quizSubmittedAt: { type: Date },
    screeningQuestions: [{ type: String }],
    screeningAnswers: [{ type: String }],
    resumeMatchScore: { type: Number },
    resumeMatchReason: { type: String },
    screeningTimeLimitSeconds: { type: Number },
    answerScore: { type: Number },
    questionScores: [{ type: Number }],
    questionFeedback: [{ type: String }],
    overallFeedback: { type: String },
    interviewSessionId: { type: Schema.Types.ObjectId, ref: "InterviewSession" },
    appliedAt: { type: Date, default: Date.now },
    notes: { type: String },
  },
  { timestamps: true }
);

// One application per candidate per job. Both indexes exist so legacy
// email-keyed queries still work and the new userId-keyed flow blocks dupes.
CandidateSchema.index({ jobId: 1, userId: 1 }, { unique: true });
CandidateSchema.index({ userId: 1, createdAt: -1 });

// In dev, Next.js hot-reloads this module but Mongoose caches the compiled
// model on the persistent connection — so schema edits are silently ignored
// until a full process restart. Dropping the cached model here lets schema
// changes take effect on hot-reload. Production never hot-reloads, so the
// cache is kept untouched there.
if (process.env.NODE_ENV !== "production" && mongoose.models.Candidate) {
  mongoose.deleteModel("Candidate");
}

const Candidate: Model<ICandidate> =
  mongoose.models.Candidate ||
  mongoose.model<ICandidate>("Candidate", CandidateSchema);

export default Candidate;

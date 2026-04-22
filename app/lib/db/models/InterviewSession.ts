import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessage {
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

export interface IInterviewSession extends Document {
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string[];
  candidateName: string;
  candidateEmail: string;
  status: "scheduled" | "in_progress" | "completed";
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  questions: string[];
  conversationHistory: IMessage[];
  answers: string[];
  currentQuestionIndex: number;
  totalScore?: number;
  questionScores?: number[];
  questionFeedback?: string[];
  overallFeedback?: string;
  meetingUrl?: string;
  calBookingUid?: string;
  calBookingId?: number;
  calEventTypeId?: number;
  calStatus?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    role: { type: String, enum: ["assistant", "user"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InterviewSessionSchema = new Schema<IInterviewSession>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobTitle: { type: String, required: true },
    jobDescription: { type: String, required: true },
    jobRequirements: [{ type: String }],
    candidateName: { type: String, required: true },
    candidateEmail: { type: String, required: true },
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed"],
      default: "scheduled",
    },
    scheduledAt: { type: Date, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    questions: [{ type: String }],
    conversationHistory: [MessageSchema],
    answers: [{ type: String }],
    currentQuestionIndex: { type: Number, default: 0 },
    totalScore: { type: Number },
    questionScores: [{ type: Number }],
    questionFeedback: [{ type: String }],
    overallFeedback: { type: String },
    meetingUrl: { type: String },
    calBookingUid: { type: String, index: true },
    calBookingId: { type: Number },
    calEventTypeId: { type: Number },
    calStatus: { type: String },
  },
  { timestamps: true }
);

const InterviewSession: Model<IInterviewSession> =
  mongoose.models.InterviewSession ||
  mongoose.model<IInterviewSession>("InterviewSession", InterviewSessionSchema);

export default InterviewSession;

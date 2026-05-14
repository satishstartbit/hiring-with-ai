import mongoose, { Schema, Document, Model } from "mongoose";
import { EMBEDDING_DIMENSIONS } from "../../ai/embeddings";

export const MEMORY_KINDS = ["question", "answer", "evaluation", "followup"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/**
 * One row per atomic interview event we want to recall later (question asked,
 * answer given, AI evaluation note, follow-up suggestion). Atlas Vector Search
 * index on `embedding` powers adaptive retrieval inside the LangGraph nodes.
 *
 * One document = one chunk. Pinned to interviewSessionId + candidateId + jobId
 * so retrieval can be scoped narrowly (single session) or broadly (candidate
 * history across jobs).
 */
export interface IInterviewVectorMemory extends Document {
  interviewSessionId: mongoose.Types.ObjectId;
  candidateId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;

  kind: MemoryKind;
  /** Optional position in the interview flow (question index) for ordering replays. */
  turnIndex?: number;
  /** Plain-text content that was embedded. Useful for human review and debug. */
  text: string;
  /** 1536-dim vector. */
  embedding: number[];
  /** Arbitrary metadata — skill, difficulty, score, etc. */
  meta?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const InterviewVectorMemorySchema = new Schema<IInterviewVectorMemory>(
  {
    interviewSessionId: {
      type: Schema.Types.ObjectId,
      ref: "InterviewSession",
      required: true,
      index: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
      index: true,
    },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },

    kind: { type: String, enum: MEMORY_KINDS, required: true },
    turnIndex: { type: Number },
    text: { type: String, required: true },
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === EMBEDDING_DIMENSIONS,
        message: `embedding must be ${EMBEDDING_DIMENSIONS} dimensions`,
      },
    },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

InterviewVectorMemorySchema.index({ interviewSessionId: 1, turnIndex: 1 });
InterviewVectorMemorySchema.index({ candidateId: 1, kind: 1, createdAt: -1 });

const InterviewVectorMemory: Model<IInterviewVectorMemory> =
  mongoose.models.InterviewVectorMemory ||
  mongoose.model<IInterviewVectorMemory>(
    "InterviewVectorMemory",
    InterviewVectorMemorySchema
  );

export default InterviewVectorMemory;

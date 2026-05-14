import mongoose, { type PipelineStage } from "mongoose";
import { traceable } from "langsmith/traceable";
import InterviewVectorMemory, {
  type MemoryKind,
} from "../../db/models/InterviewVectorMemory";
import { embedText, hasEmbeddingConfig, VECTOR_INDEX_NAME } from "../../ai/embeddings";
import type { InterviewState } from "../interviewState";

/**
 * Persist the most recent question + answer pair into the Atlas Vector
 * Search collection. Runs after AnswerEvaluation so the embedding can
 * include the AI's reasoning too. Failures here NEVER block the interview
 * (embedding is best-effort; interview continues even if Atlas / OpenAI
 * are down).
 */
export const vectorMemoryWriteNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    if (!hasEmbeddingConfig() || !state.interviewSessionId || !state.candidateId) {
      return { currentStage: "memory_skipped" };
    }
    const idx = state.currentQuestionIndex;
    const question = state.questions[idx];
    const answer = state.answers[idx];
    const evaluation = state.evaluations[idx];
    if (!question || !answer) {
      return { currentStage: "memory_skipped" };
    }

    try {
      const sessionId = new mongoose.Types.ObjectId(state.interviewSessionId);
      const candidateId = new mongoose.Types.ObjectId(state.candidateId);
      const jobId = new mongoose.Types.ObjectId(state.jobId);

      const rows: {
        kind: MemoryKind;
        text: string;
        meta: Record<string, unknown>;
      }[] = [
        {
          kind: "question",
          text: question.prompt,
          meta: {
            type: question.type,
            difficulty: question.difficulty,
            skill: question.skill,
          },
        },
        {
          kind: "answer",
          text: answer,
          meta: { questionPrompt: question.prompt },
        },
      ];
      if (evaluation) {
        rows.push({
          kind: "evaluation",
          text: `${evaluation.reasoning}\n\nFeedback: ${evaluation.feedback}`,
          meta: { scores: evaluation.scores, nextAction: evaluation.nextAction },
        });
      }

      await Promise.all(
        rows.map(async (row) => {
          const embedding = await embedText(row.text);
          await InterviewVectorMemory.create({
            interviewSessionId: sessionId,
            candidateId,
            jobId,
            kind: row.kind,
            turnIndex: idx,
            text: row.text,
            embedding,
            meta: row.meta,
          });
        })
      );

      return { currentStage: "memory_written" };
    } catch (err) {
      console.error("[interview] vectorMemoryWrite failed:", err);
      return { currentStage: "memory_failed" };
    }
  },
  { name: "vector_memory_write", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

/**
 * $vectorSearch wrapper. Returns the top-k most similar memories for
 * `queryText`, scoped to a session or candidate. Not currently called from
 * the graph (we keep an in-state history per turn for adaptive routing
 * which is sufficient inside a single interview), but available to the API
 * routes for recruiter dashboards and longer-context retrieval.
 */
export async function recallSimilarMemory(args: {
  queryText: string;
  scope: { sessionId?: string; candidateId?: string };
  kind?: MemoryKind;
  topK?: number;
}): Promise<
  Array<{ text: string; kind: MemoryKind; turnIndex?: number; score: number; meta?: Record<string, unknown> }>
> {
  if (!hasEmbeddingConfig()) return [];
  const embedding = await embedText(args.queryText);
  const filter: Record<string, unknown> = {};
  if (args.scope.sessionId) {
    filter.interviewSessionId = new mongoose.Types.ObjectId(args.scope.sessionId);
  }
  if (args.scope.candidateId) {
    filter.candidateId = new mongoose.Types.ObjectId(args.scope.candidateId);
  }
  if (args.kind) filter.kind = args.kind;

  const pipeline: PipelineStage[] = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector: embedding,
        numCandidates: Math.max(50, (args.topK ?? 5) * 10),
        limit: args.topK ?? 5,
        filter,
      },
    } as unknown as PipelineStage,
    {
      $project: {
        _id: 0,
        text: 1,
        kind: 1,
        turnIndex: 1,
        meta: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  const docs = (await InterviewVectorMemory.aggregate(pipeline).exec()) as Array<{
    text: string;
    kind: MemoryKind;
    turnIndex?: number;
    score: number;
    meta?: Record<string, unknown>;
  }>;
  return docs;
}

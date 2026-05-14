// OpenAI text-embedding-3-small client (1536 dims) for the interview vector
// memory. Uses the existing `openai` SDK that's already in package.json.
//
// REQUIRED Atlas Vector Search index on the `interviewvectormemories` collection:
// {
//   "fields": [
//     { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
//     { "type": "filter", "path": "interviewSessionId" },
//     { "type": "filter", "path": "candidateId" },
//     { "type": "filter", "path": "jobId" },
//     { "type": "filter", "path": "kind" }
//   ]
// }
// Index name (configurable): MONGODB_VECTOR_INDEX_NAME, default "interview_memory_vector_index"

import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const VECTOR_INDEX_NAME =
  process.env.MONGODB_VECTOR_INDEX_NAME ?? "interview_memory_vector_index";

let cached: OpenAI | null = null;

function getClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set — required for interview vector memory");
  }
  cached = new OpenAI({ apiKey });
  return cached;
}

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return new Array(EMBEDDING_DIMENSIONS).fill(0);
  const client = getClient();
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  return res.data[0]?.embedding ?? [];
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  const inputs = texts.map((t) => t.trim().slice(0, 8000)).filter(Boolean);
  if (inputs.length === 0) return [];
  const client = getClient();
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });
  return res.data.map((d) => d.embedding);
}

export function hasEmbeddingConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

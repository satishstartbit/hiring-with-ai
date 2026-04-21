import { ChatGroq } from "@langchain/groq";

export const GROQ_MODEL = "llama-3.1-8b-instant";
export function createLLM() {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }

  return new ChatGroq({
    model: GROQ_MODEL,
    apiKey,
    temperature: 0,
  });
}

export function getGroqErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/bad auth|authentication failed|unauthorized|invalid api key|401/i.test(message)) {
    return "Groq authentication failed. Check GROQ_API_KEY in .env.local or .env, make sure it is a valid active Groq API key, then restart the Next.js dev server.";
  }

  return message;
}

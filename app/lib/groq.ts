import { ChatGroq } from "@langchain/groq";

export const GROQ_MODEL = "llama-3.3-70b-versatile";

export function createLLM() {
  return new ChatGroq({
    model: GROQ_MODEL,
    apiKey: process.env.GROQ_API_KEY,
    temperature: 0,
  });
}

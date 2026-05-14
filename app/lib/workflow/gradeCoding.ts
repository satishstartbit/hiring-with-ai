import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../groq";

export interface CodingItem {
  question: string;
  language: string;
  starterCode: string;
  referenceSolution: string;
  candidateCode: string;
}

export interface CodingGrade {
  score: number;
  feedback: string;
}

const CodingGradeSchema = z.object({
  results: z
    .array(
      z.object({
        score: z.number().min(0).max(10),
        feedback: z.string().min(1),
      })
    )
    .default([]),
});

function buildSystem(): string {
  return [
    "You are a senior engineer grading coding submissions for a screening assessment.",
    "For each problem you receive: the prompt, the starter code, a reference solution,",
    "and the candidate's submission. Score each submission from 0 to 10:",
    "  - 10: correct, idiomatic, handles edge cases, comparable to the reference.",
    "  - 7-9: correct or near-correct with minor style/efficiency issues.",
    "  - 4-6: solves the core case but has clear bugs, missing edge cases, or poor structure.",
    "  - 1-3: attempted but fundamentally wrong; demonstrates partial understanding.",
    "  - 0: blank, unrelated, or copies the starter without progress.",
    "Provide one short sentence of feedback per submission (under 25 words).",
    "Output only structured JSON for the schema requested.",
  ].join("\n");
}

function buildUser(items: CodingItem[]): string {
  return items
    .map((it, i) => {
      const sections = [
        `### Problem ${i + 1}`,
        `Language: ${it.language}`,
        `Prompt:\n${it.question}`,
        `Starter code:\n\`\`\`${it.language}\n${it.starterCode || "(none)"}\n\`\`\``,
      ];
      if (it.referenceSolution) {
        sections.push(`Reference solution (do NOT show to candidate):\n\`\`\`${it.language}\n${it.referenceSolution}\n\`\`\``);
      }
      sections.push(`Candidate submission:\n\`\`\`${it.language}\n${it.candidateCode || "(blank)"}\n\`\`\``);
      return sections.join("\n\n");
    })
    .join("\n\n---\n\n");
}

export const gradeCodingAnswers = traceable(
  async (items: CodingItem[]): Promise<CodingGrade[]> => {
    if (items.length === 0) return [];
    const llm = createLLM({ maxTokens: 1500, timeout: 20000 });
    const structured = llm.withStructuredOutput(CodingGradeSchema, { name: "GradedCoding" });
    try {
      const raw = await structured.invoke([
        new SystemMessage(buildSystem()),
        new HumanMessage(buildUser(items)),
      ]);
      const parsed = CodingGradeSchema.parse(raw);
      // Pad to the requested length so callers can zip with answers.
      const out: CodingGrade[] = items.map((_, i) => {
        const r = parsed.results[i];
        return r
          ? { score: Math.round(r.score), feedback: r.feedback }
          : { score: 0, feedback: "No grading result returned." };
      });
      return out;
    } catch (err) {
      console.error("[gradeCoding] failed:", err);
      return items.map(() => ({
        score: 0,
        feedback: "Automatic grading failed — flagged for manual review.",
      }));
    }
  },
  { name: "grade_coding", run_type: "chain", tags: ["grading"] }
);

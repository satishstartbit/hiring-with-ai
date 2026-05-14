import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { parseLooseJson } from "../../json";
import {
  ZERO_SCORES,
  type DimensionScores,
  type FinalReport,
  type InterviewState,
} from "../interviewState";

const FinalReportSchema = z.object({
  summary: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  skillBreakdown: z
    .array(
      z.object({
        skill: z.string(),
        score: z.number().min(0).max(100),
        notes: z.string().optional(),
      })
    )
    .default([]),
  failureReasons: z.array(z.string()).default([]),
  recommendation: z
    .enum(["strong_hire", "proceed_to_technical", "borderline", "do_not_proceed"])
    .default("borderline"),
  recommendationReason: z.string().default(""),
  passed: z.boolean().default(false),
});

function averageScores(per: DimensionScores[]): DimensionScores {
  if (per.length === 0) return { ...ZERO_SCORES };
  const sum = per.reduce(
    (acc, s) => ({
      technical: acc.technical + s.technical,
      communication: acc.communication + s.communication,
      confidence: acc.confidence + s.confidence,
      problemSolving: acc.problemSolving + s.problemSolving,
      architectureThinking: acc.architectureThinking + s.architectureThinking,
    }),
    { ...ZERO_SCORES }
  );
  return {
    technical: Math.round(sum.technical / per.length),
    communication: Math.round(sum.communication / per.length),
    confidence: Math.round(sum.confidence / per.length),
    problemSolving: Math.round(sum.problemSolving / per.length),
    architectureThinking: Math.round(sum.architectureThinking / per.length),
  };
}

function overallScore(s: DimensionScores): number {
  // Weighted average — technical and problem-solving matter most, communication
  // is the equal-third dimension for non-coding tracks too.
  return Math.round(
    s.technical * 0.3 +
      s.problemSolving * 0.25 +
      s.communication * 0.2 +
      s.architectureThinking * 0.15 +
      s.confidence * 0.1
  );
}

/**
 * Build the recruiter-facing hiring report. Aggregates per-answer
 * evaluations into final per-dimension scores + a recommendation, and asks
 * the LLM for strengths/weaknesses/breakdown using the full evaluation
 * reasoning as evidence.
 */
export const finalReportNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const perAnswerScores = state.evaluations.map((e) => e.scores);
      const avg = averageScores(perAnswerScores);
      const overall = overallScore(avg);

      const llm = createLLM({ temperature: 0.3, maxTokens: 1800 });
      const qaContext = state.questions
        .map((q, i) => {
          const e = state.evaluations[i];
          return [
            `Q${i + 1} (${q.type}/${q.difficulty}${q.skill ? `, ${q.skill}` : ""}): ${q.prompt}`,
            `A${i + 1}: ${state.answers[i]?.slice(0, 600) ?? "(no answer)"}`,
            e
              ? `→ scores T=${e.scores.technical} C=${e.scores.communication} Cf=${e.scores.confidence} PS=${e.scores.problemSolving} A=${e.scores.architectureThinking} | ${e.reasoning}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");

      const result = await llm.invoke([
        new SystemMessage(
          [
            "You are writing a recruiter-facing hiring report based on an AI interview.",
            "Use the per-answer scores and reasoning as evidence. Don't invent claims.",
            "",
            "Return strict JSON:",
            "{",
            '  "summary": "<3-5 sentence executive summary>",',
            '  "strengths": [<3-6 strengths>],',
            '  "weaknesses": [<2-5 weaknesses>],',
            '  "skillBreakdown": [{ "skill": "<name>", "score": <0-100>, "notes": "<one line>" }, ...],',
            '  "failureReasons": [<empty if passed, otherwise concrete reasons>],',
            '  "recommendation": "strong_hire" | "proceed_to_technical" | "borderline" | "do_not_proceed",',
            '  "recommendationReason": "<one paragraph reasoning for the recommendation>",',
            '  "passed": <true if recommendation is strong_hire or proceed_to_technical>',
            "}",
            "JSON only, no fences.",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job: ${state.jobTitle}`,
            `Requirements: ${state.jobRequirements.join(", ")}`,
            "",
            `Aggregate dimension scores (0-100): technical=${avg.technical}, communication=${avg.communication}, confidence=${avg.confidence}, problemSolving=${avg.problemSolving}, architectureThinking=${avg.architectureThinking}`,
            `Overall: ${overall}`,
            "",
            "Per-question Q&A and evaluator notes:",
            qaContext,
            "",
            "Resume-derived strong areas: " + (state.strongSkills.join(", ") || "(none)"),
            "Resume-derived weak areas: " + (state.weakSkills.join(", ") || "(none)"),
          ].join("\n")
        ),
      ]);

      const raw = typeof result.content === "string" ? result.content : "";
      const parsed = FinalReportSchema.parse(parseLooseJson(raw));

      const report: FinalReport = {
        ...parsed,
        scores: avg,
        overallScore: overall,
      };

      return {
        finalReport: report,
        runningScores: avg,
        isComplete: true,
        currentStage: "report_generated",
      };
    } catch (err) {
      console.error("[interview] finalReport failed:", err);
      return {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
  { name: "final_report", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

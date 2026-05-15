import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { parseLooseJson } from "../../json";
import {
  QUESTION_TYPES,
  type Difficulty,
  type InterviewPlan,
  type InterviewState,
  type QuestionType,
} from "../interviewState";

// Hard floor / ceiling regardless of HR config — keeps the LLM honest and
// prevents pathological 1-question or 50-question interviews.
const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 15;

const PlanSchema = z.object({
  sections: z
    .array(
      z.object({
        type: z.enum(QUESTION_TYPES),
        count: z.number().int().min(1).max(8),
      })
    )
    .min(1),
  startingDifficulty: z.enum(["easy", "medium", "hard"]),
  totalQuestions: z.number().int().min(MIN_QUESTIONS).max(MAX_QUESTIONS),
});

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Distribute `total` slots across `topics`, intro first if present. */
function distributeSections(
  topics: QuestionType[],
  total: number
): { type: QuestionType; count: number }[] {
  if (topics.length === 0) return [];
  const out: { type: QuestionType; count: number }[] = [];
  const hasIntro = topics.includes("introduction");
  const rest = topics.filter((t) => t !== "introduction");
  let remaining = total;
  if (hasIntro && remaining > 0) {
    out.push({ type: "introduction", count: 1 });
    remaining -= 1;
  }
  if (rest.length === 0) {
    // Only intro requested — pad to `remaining` with a sensible fallback.
    if (remaining > 0) out.push({ type: "technical", count: remaining });
    return out;
  }
  const base = Math.floor(remaining / rest.length);
  let extra = remaining - base * rest.length;
  for (const t of rest) {
    const count = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    if (count > 0) out.push({ type: t, count });
  }
  return out;
}

/**
 * Build the interview roadmap. Returns 6-12 sections, each with a type and
 * count. The starting difficulty leans on resume signal:
 *
 *   match% >= 75 && yoe >= 4  → hard
 *   match% >= 50              → medium
 *   else                      → easy
 *
 * Always opens with one "introduction" so the candidate gets a warm start.
 */
export const interviewPlanningNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const intelligence = state.resumeIntelligence;
      const skillMatch = state.skillMatch;
      const matchPercent = skillMatch?.matchPercent ?? 50;
      const yoe = intelligence?.yearsOfExperience ?? 0;

      const heuristicDifficulty: Difficulty =
        matchPercent >= 75 && yoe >= 4
          ? "hard"
          : matchPercent >= 50
          ? "medium"
          : "easy";

      // HR-config fast path — when the recruiter has any per-job tuning we
      // skip the LLM planner entirely and build a deterministic plan so the
      // configured questionCount + topic mix are honored exactly. If topics
      // were left blank (legacy configs only — the form now requires ≥1) we
      // fall back to a sensible default mix instead of dropping to the LLM
      // path, which would otherwise pick its own count and silently override
      // the HR setting.
      // Difficulty: "adaptive" defers to the resume heuristic; anything else
      // pins the baseline.
      const settings = state.interviewSettings;
      if (settings) {
        const topics =
          settings.topics.length > 0
            ? settings.topics
            : (["introduction", "technical", "scenario", "behavioral"] as const);
        const totalQuestions = clamp(
          settings.questionCount,
          MIN_QUESTIONS,
          MAX_QUESTIONS
        );
        const sections = distributeSections([...topics], totalQuestions);
        const baselineDifficulty: Difficulty =
          settings.difficulty === "adaptive"
            ? heuristicDifficulty
            : settings.difficulty;

        const plan: InterviewPlan = {
          sections,
          startingDifficulty: baselineDifficulty,
          totalQuestions,
        };

        return {
          plan,
          currentDifficulty: plan.startingDifficulty,
          currentStage: "planned",
        };
      }

      const llm = createLLM({ temperature: 0.3, maxTokens: 800 });
      const result = await llm.invoke([
        new SystemMessage(
          [
            "You are an enterprise hiring strategist. Design an interview roadmap.",
            "",
            `Allowed question types: ${QUESTION_TYPES.join(", ")}.`,
            `Pick a total of ${MIN_QUESTIONS}-${MAX_QUESTIONS} questions.`,
            "Always include exactly one 'introduction' as the first section.",
            "Bias toward question types relevant to the job requirements and the candidate's strong/weak areas.",
            "For senior/lead roles, include leadership + system_design.",
            "For backend/data roles, include sql + scenario + debugging.",
            "For frontend roles, include scenario + architecture + technical.",
            "",
            "Return strict JSON:",
            "{",
            '  "sections": [{ "type": "introduction", "count": 1 }, { "type": "technical", "count": 2 }, ...],',
            '  "startingDifficulty": "easy" | "medium" | "hard",',
            '  "totalQuestions": <sum of section counts>',
            "}",
            "Output ONLY the JSON.",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job title: ${state.jobTitle}`,
            `Job requirements: ${state.jobRequirements.join(", ")}`,
            `Candidate years of experience: ${yoe}`,
            `Skill match %: ${matchPercent}`,
            `Matched skills: ${skillMatch?.matchedSkills.join(", ") ?? ""}`,
            `Missing skills: ${skillMatch?.missingSkills.join(", ") ?? ""}`,
            `Strong areas: ${intelligence?.strongAreas.join(", ") ?? ""}`,
            `Weak areas: ${intelligence?.weakAreas.join(", ") ?? ""}`,
            `Heuristic difficulty: ${heuristicDifficulty}`,
          ].join("\n")
        ),
      ]);

      const raw = typeof result.content === "string" ? result.content : "";
      const parsedRaw = PlanSchema.parse(parseLooseJson(raw));

      // Validate sums match — if not, trust the section counts.
      const summed = parsedRaw.sections.reduce((s, sec) => s + sec.count, 0);
      const totalQuestions = Math.min(
        MAX_QUESTIONS,
        Math.max(MIN_QUESTIONS, summed || parsedRaw.totalQuestions)
      );

      // Force "introduction" at index 0.
      const sections = parsedRaw.sections;
      if (sections[0]?.type !== "introduction") {
        sections.unshift({ type: "introduction", count: 1 });
      }

      const plan: InterviewPlan = {
        sections,
        startingDifficulty: parsedRaw.startingDifficulty,
        totalQuestions,
      };

      return {
        plan,
        currentDifficulty: plan.startingDifficulty,
        currentStage: "planned",
      };
    } catch (err) {
      console.error("[interview] interviewPlanning failed:", err);
      // Fall back to a sensible default plan so the interview can proceed.
      const fallback: InterviewPlan = {
        sections: [
          { type: "introduction", count: 1 },
          { type: "contextual", count: 2 },
          { type: "technical", count: 3 },
        ],
        startingDifficulty: "medium",
        totalQuestions: 6,
      };
      return {
        plan: fallback,
        currentDifficulty: fallback.startingDifficulty,
        currentStage: "planned",
      };
    }
  },
  { name: "interview_planning", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

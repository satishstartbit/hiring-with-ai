import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { parseLooseJson } from "../../json";
import type { InterviewState, SkillMatch } from "../interviewState";

const SkillMatchOutputSchema = z.object({
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  advancedOpportunities: z.array(z.string()).default([]),
  matchPercent: z.number().min(0).max(100).default(0),
  frontend: z.array(z.string()).default([]),
  backend: z.array(z.string()).default([]),
  databases: z.array(z.string()).default([]),
  cloud: z.array(z.string()).default([]),
  devops: z.array(z.string()).default([]),
  leadership: z.array(z.string()).default([]),
  communication: z.array(z.string()).default([]),
});

function emptyMatch(): SkillMatch {
  return {
    matchedSkills: [],
    missingSkills: [],
    advancedOpportunities: [],
    matchPercent: 0,
  };
}

/**
 * Bucket the candidate's skills (resume + already-extracted intelligence)
 * into job-relevant categories, then compute a coarse match against the
 * job's stated requirements. The match drives planning difficulty.
 */
export const skillExtractionNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const intelligence = state.resumeIntelligence;
      if (!intelligence) {
        return { skillMatch: emptyMatch(), currentStage: "skills_extracted" };
      }

      const llm = createLLM({ temperature: 0.1, maxTokens: 1200 });
      const result = await llm.invoke([
        new SystemMessage(
          [
            "You are a skill-matching engine.",
            "Given a candidate's extracted skills and a job's stated requirements, return strict JSON:",
            "",
            "{",
            '  "matchedSkills": [<skills the candidate has that the job requires>],',
            '  "missingSkills": [<skills the job requires that the candidate lacks>],',
            '  "advancedOpportunities": [<skills the candidate has BEYOND what the job requires — chances to probe deeper>],',
            '  "matchPercent": <0-100 integer overall match>,',
            '  "frontend": [...], "backend": [...], "databases": [...], "cloud": [...], "devops": [...],',
            '  "leadership": [...], "communication": [...]',
            "}",
            "",
            "Output ONLY the JSON. No fences, no commentary.",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job: ${state.jobTitle}`,
            `Job requirements: ${state.jobRequirements.join(", ")}`,
            "",
            "Candidate technologies:",
            intelligence.technologies.join(", "),
            "",
            "Candidate strong areas:",
            intelligence.strongAreas.join(", "),
            "",
            "Candidate weak areas:",
            intelligence.weakAreas.join(", "),
          ].join("\n")
        ),
      ]);

      const raw = typeof result.content === "string" ? result.content : "";
      const parsed = SkillMatchOutputSchema.parse(parseLooseJson(raw));

      const matchPercent = Math.round(parsed.matchPercent);

      return {
        skillMatch: {
          matchedSkills: parsed.matchedSkills,
          missingSkills: parsed.missingSkills,
          advancedOpportunities: parsed.advancedOpportunities,
          matchPercent,
        },
        strongSkills: Array.from(
          new Set([
            ...state.strongSkills,
            ...parsed.matchedSkills,
            ...parsed.advancedOpportunities,
          ])
        ),
        weakSkills: Array.from(
          new Set([...state.weakSkills, ...parsed.missingSkills])
        ),
        currentStage: "skills_extracted",
      };
    } catch (err) {
      console.error("[interview] skillExtraction failed:", err);
      return { skillMatch: emptyMatch(), currentStage: "skills_extracted" };
    }
  },
  { name: "skill_extraction", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

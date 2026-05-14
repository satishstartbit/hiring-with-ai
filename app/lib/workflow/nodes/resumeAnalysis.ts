import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { parseLooseJson } from "../../json";
import type { InterviewState, ResumeIntelligence } from "../interviewState";

const ResumeIntelligenceSchema = z.object({
  yearsOfExperience: z.number().min(0).max(60).default(0),
  technologies: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  architectureExposure: z.array(z.string()).default([]),
  leadershipIndicators: z.array(z.string()).default([]),
  communicationIndicators: z.array(z.string()).default([]),
  strongAreas: z.array(z.string()).default([]),
  weakAreas: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

function emptyIntelligence(): ResumeIntelligence {
  return {
    yearsOfExperience: 0,
    technologies: [],
    projects: [],
    architectureExposure: [],
    leadershipIndicators: [],
    communicationIndicators: [],
    strongAreas: [],
    weakAreas: [],
    summary: "Resume could not be parsed.",
  };
}

/**
 * Deeply analyse the candidate's resume text and surface structured
 * intelligence the downstream planning + question nodes can use.
 *
 * Runs once at session start. Cheap and idempotent — if `resumeText` is empty
 * we skip the LLM call and return a degenerate object so the graph keeps
 * flowing.
 */
export const resumeAnalysisNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const text = state.resumeText.trim();
      if (!text) {
        return {
          resumeIntelligence: emptyIntelligence(),
          currentStage: "resume_analyzed",
        };
      }

      const llm = createLLM({ temperature: 0.2, maxTokens: 1500 });
      const result = await llm.invoke([
        new SystemMessage(
          [
            "You are a senior recruiter who reads resumes and extracts structured intelligence.",
            "Read the candidate's resume text and the job context, then return strict JSON.",
            "",
            "Schema:",
            "{",
            '  "yearsOfExperience": <number, best estimate from dates/seniority cues>,',
            '  "technologies": [<concrete tech names, e.g. "React", "PostgreSQL", "AWS Lambda">],',
            '  "projects": [<short project descriptions, max 6, each <= 80 chars>],',
            '  "architectureExposure": [<system-design concepts the candidate has touched, e.g. "microservices", "event-driven">],',
            '  "leadershipIndicators": [<phrases that suggest leadership, e.g. "led 4-person team">],',
            '  "communicationIndicators": [<phrases that suggest communication strength, e.g. "presented at conference">],',
            '  "strongAreas": [<skills the candidate clearly has depth in>],',
            '  "weakAreas": [<skills the job needs but the resume lacks evidence for>],',
            '  "summary": "<2-3 sentence neutral summary of the candidate>"',
            "}",
            "",
            "Rules: Output ONLY the JSON object. No prose, no markdown fences.",
            "Use [] for unknown arrays; do not invent technologies that are not in the text.",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job title: ${state.jobTitle}`,
            `Job requirements: ${state.jobRequirements.join(", ")}`,
            "",
            "Resume text:",
            text,
          ].join("\n")
        ),
      ]);

      const raw = typeof result.content === "string" ? result.content : "";
      const parsed = ResumeIntelligenceSchema.parse(parseLooseJson(raw));

      return {
        resumeIntelligence: parsed,
        strongSkills: parsed.strongAreas,
        weakSkills: parsed.weakAreas,
        currentStage: "resume_analyzed",
      };
    } catch (err) {
      // Don't fail the interview if resume analysis breaks — degrade
      // gracefully and let the downstream nodes work without it.
      console.error("[interview] resumeAnalysis failed:", err);
      return {
        resumeIntelligence: emptyIntelligence(),
        currentStage: "resume_analyzed",
      };
    }
  },
  { name: "resume_analysis", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

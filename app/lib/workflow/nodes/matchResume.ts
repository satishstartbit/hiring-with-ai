import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../../groq";
import { traceable } from "langsmith/traceable";
import { parseLooseJson } from "../../json";
import type { ScreeningState } from "../screeningState";

const ACCEPT_THRESHOLD = 55;
const ROLE_STOPWORDS = new Set([
  "and",
  "engineer",
  "developer",
  "manager",
  "lead",
  "senior",
  "junior",
  "associate",
  "specialist",
  "executive",
  "intern",
  "staff",
  "principal",
  "analyst",
  "officer",
]);

const RequirementReviewSchema = z.object({
  requirement: z.string().min(1),
  verdict: z.enum(["strong_match", "partial_match", "gap"]),
  matchedSkills: z.array(z.string().min(1)).default([]),
  evidence: z.string().default(""),
});

const MatchSchema = z.object({
  candidateSkills: z.array(z.string().min(1)).default([]),
  requirementReviews: z.array(RequirementReviewSchema).min(1),
});

type RequirementReview = z.infer<typeof RequirementReviewSchema>;

function toTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("\n");
}

function normalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const skill of skills) {
    const clean = skill.replace(/^[*-]\s*/, "").replace(/\s+/g, " ").trim();
    if (!clean) continue;

    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);

    if (out.length >= 20) break;
  }

  return out;
}

function tokenizeRoleText(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !ROLE_STOPWORDS.has(token))
    )
  );
}

function countOverlap(tokens: string[], target: Set<string>): number {
  return tokens.reduce((count, token) => count + (target.has(token) ? 1 : 0), 0);
}

function scoreRequirement(review: RequirementReview): number {
  if (review.verdict === "strong_match") return 1;
  if (review.verdict === "partial_match") return 0.75;
  return 0;
}

function computeCoverageScore(reviews: RequirementReview[]): number {
  if (reviews.length === 0) return 0;
  const weightedCoverage = reviews.reduce((sum, review) => sum + scoreRequirement(review), 0);
  return Math.round((weightedCoverage / reviews.length) * 100);
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function pickRequirements(
  reviews: RequirementReview[],
  verdict: RequirementReview["verdict"]
): string[] {
  return reviews
    .filter((review) => review.verdict === verdict)
    .map((review) => review.requirement.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildReason(candidateSkills: string[], reviews: RequirementReview[]): string {
  const strong = pickRequirements(reviews, "strong_match");
  const partial = pickRequirements(reviews, "partial_match");
  const gaps = pickRequirements(reviews, "gap");

  const skillsSentence = candidateSkills.length
    ? `Resume skills found: ${candidateSkills.slice(0, 8).join(", ")}.`
    : "No clear skill list could be extracted from the resume text, so the review relied on the readable resume content that was available.";

  const coverageParts: string[] = [];
  if (strong.length > 0) coverageParts.push(`strong matches for ${joinList(strong)}`);
  if (partial.length > 0) coverageParts.push(`partial matches for ${joinList(partial)}`);
  const coverageSentence =
    coverageParts.length > 0
      ? `Requirement coverage shows ${coverageParts.join(" and ")}.`
      : "Requirement coverage did not show any strong or partial matches against the role.";

  const gapSentence =
    gaps.length > 0
      ? `Main gaps: ${joinList(gaps)}.`
      : "No major requirement gaps were found in the reviewed skill set.";

  return [skillsSentence, coverageSentence, gapSentence].join(" ");
}

function hasSameRoleSignal(state: ScreeningState, candidateSkills: string[]): boolean {
  const jobTokens = tokenizeRoleText(state.jobTitle);
  if (jobTokens.length === 0) return false;

  const titleTokens = new Set(tokenizeRoleText(state.candidateTitle));
  const resumeTokens = new Set(
    tokenizeRoleText(`${candidateSkills.join(" ")} ${state.resumeText.slice(0, 1200)}`)
  );
  const titleOverlap = countOverlap(jobTokens, titleTokens);
  const resumeOverlap = countOverlap(jobTokens, resumeTokens);

  if (jobTokens.length === 1) {
    return titleOverlap + resumeOverlap >= 1;
  }

  return titleOverlap >= 1 || resumeOverlap >= Math.ceil(jobTokens.length / 2);
}

function adjustScoreForLeniency(
  baseScore: number,
  reviews: RequirementReview[],
  state: ScreeningState,
  candidateSkills: string[]
): number {
  const strongCount = reviews.filter((review) => review.verdict === "strong_match").length;
  const partialCount = reviews.filter((review) => review.verdict === "partial_match").length;
  const coveredCount = strongCount + partialCount;
  const sameRole = hasSameRoleSignal(state, candidateSkills);

  let adjusted = baseScore;

  if (sameRole && coveredCount >= 2) {
    adjusted = Math.max(adjusted, ACCEPT_THRESHOLD);
  }

  if (coveredCount >= Math.ceil(reviews.length * 0.5)) {
    adjusted = Math.max(adjusted, 60);
  }

  if (strongCount >= 2 && partialCount >= 1) {
    adjusted = Math.max(adjusted, 62);
  }

  return Math.min(100, adjusted);
}

export const matchResumeNode = traceable(
  async (state: ScreeningState): Promise<Partial<ScreeningState>> => {
    try {
      const llm = createLLM();
      const requirements = state.jobRequirements
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      const response = await llm.invoke([
        new SystemMessage(
          [
            "You are a fair and balanced hiring evaluator reviewing resume-to-job fit.",
            "First extract the candidate's real skills from the readable resume content.",
            "Then review each job requirement one by one against those candidate skills.",
            "",
            "Output ONLY valid JSON with no markdown fences.",
            'Shape: {"candidateSkills":["skill"],"requirementReviews":[{"requirement":"...","verdict":"strong_match|partial_match|gap","matchedSkills":["skill"]}]}',
          ].join(" ") 
        ),
        new HumanMessage(
          [
            `Job title: ${state.jobTitle}`,
            `Department: ${state.jobDepartment}`,
            requirements.length > 0
              ? `Requirements:\n- ${requirements.join("\n- ")}`
              : "Requirements: None provided explicitly. Infer them from the job description.",
            `Job description: ${state.jobDescription.slice(0, 1600)}`,
            "",
            `Candidate name: ${state.candidateName}`,
            `Current title: ${state.candidateTitle || "Not provided"}`,
            "",
            `Resume (extracted text): ${state.resumeText}`,
          ].join("\n")
        ),
      ]);

      const rawText = toTextContent(response.content);
      const result = MatchSchema.parse(parseLooseJson(rawText));
      const candidateSkills = normalizeSkills(
        result.candidateSkills.length > 0
          ? result.candidateSkills
          : result.requirementReviews.flatMap((review) => review.matchedSkills)
      );
      const score = adjustScoreForLeniency(
        computeCoverageScore(result.requirementReviews),
        result.requirementReviews,
        state,
        candidateSkills
      );
      const reason = buildReason(candidateSkills, result.requirementReviews);

      return {
        candidateSkills,
        isMatch: score >= ACCEPT_THRESHOLD,
        matchScore: score,
        matchReason: reason,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  { name: "match_resume", run_type: "chain", tags: ["screening"] }
) as (state: ScreeningState) => Promise<Partial<ScreeningState>>;

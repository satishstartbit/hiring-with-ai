import "server-only";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM, getGroqErrorMessage } from "../groq";

export type JobGenerationInput = {
  title: string;
  department: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  employmentType: "full-time" | "part-time" | "contract" | "remote";
  experienceRequired: string;
  numberOfOpenings: number;
  skills: string[];
  salary: { min: number; max: number; currency: string; period: string } | null;
  interviewRounds: { name: string; type: string }[];
  // Optional user-supplied content the AI should respect/enhance rather than ignore
  description?: string;
  requirements?: string[];
  responsibilities?: string[];
  preferredQualifications?: string[];
};

export type JobGenerationOutput = {
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  screeningQuestions: string[];
  suggestedSkills: string[];
  interviewProcessSummary: string;
};

const SYSTEM_PROMPT = `You are an elite technical recruiter and JD writer. You produce structured JSON for an AI hiring SaaS. Rules:
- Always output STRICT, valid JSON matching the requested schema. No prose, no markdown fences.
- Be specific to the role, level, and skills provided.
- Tone: professional, inclusive, modern SaaS recruiting voice.
- Lists should contain 4-7 items each unless otherwise specified.
- The description must be 2-3 paragraphs of plain text (no markdown headings).`;

function buildUserPrompt(input: JobGenerationInput): string {
  const userContent = [
    input.description ? `Existing draft description (use as basis, improve):\n${input.description}` : "",
    input.requirements?.length
      ? `User-provided requirements:\n- ${input.requirements.join("\n- ")}`
      : "",
    input.responsibilities?.length
      ? `User-provided responsibilities:\n- ${input.responsibilities.join("\n- ")}`
      : "",
    input.preferredQualifications?.length
      ? `User-provided preferred quals:\n- ${input.preferredQualifications.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `Generate a complete, professional job posting for this role.

Role: ${input.title}
Department: ${input.department}
Location: ${input.location}
Work mode: ${input.workMode}
Employment type: ${input.employmentType}
Experience: ${input.experienceRequired || "not specified"}
Openings: ${input.numberOfOpenings}
Required skills: ${input.skills.length ? input.skills.join(", ") : "infer from role"}
${
  input.salary
    ? `Salary: ${input.salary.currency} ${input.salary.min}-${input.salary.max} per ${input.salary.period}`
    : ""
}
${
  input.interviewRounds.length
    ? `Interview rounds (use these names): ${input.interviewRounds.map((r) => r.name).join(", ")}`
    : "Suggest a realistic 3-4 round interview process for this role."
}

${userContent}

Return JSON with EXACTLY these keys:
{
  "description": "2-3 paragraph plain-text JD body",
  "responsibilities": ["...", "..."],
  "requirements": ["...", "..."],
  "preferredQualifications": ["...", "..."],
  "screeningQuestions": ["short answer questions a recruiter asks at first screen", "..."],
  "suggestedSkills": ["skills you would add beyond what was provided", "..."],
  "interviewProcessSummary": "1-2 sentence overview of the interview process"
}`;
}

function safeArray(v: unknown, fallback: string[] = []): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : fallback;
}

function escapeControlCharsInStrings(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inString) {
      if (escaped) {
        out += c;
        escaped = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escaped = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inString = false;
        continue;
      }
      const code = c.charCodeAt(0);
      if (code < 0x20) {
        if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "\t") out += "\\t";
        else if (c === "\b") out += "\\b";
        else if (c === "\f") out += "\\f";
        else out += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      out += c;
    } else {
      out += c;
      if (c === '"') inString = true;
    }
  }
  return out;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip ```json fences if the model added them despite instructions
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = fenced ? fenced[1] : trimmed;
  // Find the first balanced JSON object
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI did not return JSON");
  }
  const sliced = body.slice(start, end + 1);
  try {
    return JSON.parse(sliced);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(sliced));
  }
}

export type LinkedInPostInput = {
  title: string;
  department: string;
  location: string;
  workMode: string;
  employmentType: string;
  experienceRequired: string;
  skills: string[];
  description: string;
  jobUrl: string;
  companyName?: string;
};

const LINKEDIN_SYSTEM_PROMPT = `You are an experienced tech recruiter writing for LinkedIn. You write posts that real people stop and read.
Rules:
- Plain text only. No markdown. No code fences.
- Open with one short hook line that names the role and what's exciting about it.
- Use short paragraphs separated by blank lines.
- Show, don't list — but a 3-5 item bullet list of must-have skills/experience is fine (use "• ").
- Keep total length under 1300 characters (LinkedIn truncates around that).
- Always end with a clear call to action that includes the application URL on its own line.
- Optionally append 2-4 relevant hashtags on the last line (e.g., #Hiring #ReactDeveloper). No more than 4.
- No emojis except a single 🚀 or 🔥 at the very start, optional.
- Do not invent salary, benefits, or location facts. Use only what's given.`;

function buildLinkedInUserPrompt(input: LinkedInPostInput): string {
  return `Write a LinkedIn job post for:

Role: ${input.title}
${input.companyName ? `Company: ${input.companyName}` : ""}
Department: ${input.department || "n/a"}
Location: ${input.location} (${input.workMode})
Employment type: ${input.employmentType}
Experience required: ${input.experienceRequired || "not specified"}
Top skills: ${input.skills.length ? input.skills.slice(0, 8).join(", ") : "infer from role"}

Role context:
${input.description?.slice(0, 1200) || "(no description provided — write a credible, generic summary for the role above)"}

Application URL (must appear in the post, on its own line, after the CTA):
${input.jobUrl}

Return only the post text, nothing else.`;
}

export async function generateLinkedInPostCopy(input: LinkedInPostInput): Promise<string> {
  const llm = createLLM({ temperature: 0.6, maxTokens: 700 });
  try {
    const result = await llm.invoke([
      new SystemMessage(LINKEDIN_SYSTEM_PROMPT),
      new HumanMessage(buildLinkedInUserPrompt(input)),
    ]);
    const raw = typeof result.content === "string" ? result.content : "";
    const cleaned = raw
      .replace(/^```[a-zA-Z]*\n?/g, "")
      .replace(/```$/g, "")
      .trim();
    // Hard cap at LinkedIn's 1300-char display limit.
    return cleaned.length > 1300 ? `${cleaned.slice(0, 1297)}…` : cleaned;
  } catch (err) {
    throw new Error(getGroqErrorMessage(err));
  }
}

export async function generateJobContent(
  input: JobGenerationInput
): Promise<JobGenerationOutput> {
  const llm = createLLM({ temperature: 0.3, maxTokens: 1500 });
  try {
    const result = await llm.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(buildUserPrompt(input)),
    ]);
    const raw = typeof result.content === "string" ? result.content : "";
    const parsed = extractJson(raw) as Partial<JobGenerationOutput>;
    return {
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : `We're hiring a ${input.title} in ${input.department}.`,
      responsibilities: safeArray(parsed.responsibilities),
      requirements: safeArray(parsed.requirements),
      preferredQualifications: safeArray(parsed.preferredQualifications),
      screeningQuestions: safeArray(parsed.screeningQuestions),
      suggestedSkills: safeArray(parsed.suggestedSkills),
      interviewProcessSummary:
        typeof parsed.interviewProcessSummary === "string"
          ? parsed.interviewProcessSummary.trim()
          : "",
    };
  } catch (err) {
    throw new Error(getGroqErrorMessage(err));
  }
}

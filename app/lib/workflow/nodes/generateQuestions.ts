import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { webSearch } from "../../tavily";
import type { QuestionType } from "../../constants/assessment";
import type {
  ScreeningQuestion,
  ScreeningState,
  MCQQuestion,
  MultiSelectQuestion,
  DescriptiveQuestion,
  CodingQuestion,
} from "../screeningState";

// Default fallback split (when no AssessmentConfig is present).
const DEFAULT_TOTAL = 10;
const DEFAULT_MCQ_COUNT = 8;
const DEFAULT_DESC_COUNT = 2;

// Per-section LLM budget. Each section is a small, focused call so it stays
// fast and reliable on the 8B model — far better than one giant request.
const SECTION_TIMEOUT_MS = 18000;

const MCQ_SET: ReadonlySet<QuestionType> = new Set(["mcq"]);
const MULTI_SET: ReadonlySet<QuestionType> = new Set(["multi_select"]);
const FREE_TEXT_SET: ReadonlySet<QuestionType> = new Set([
  "short_answer",
  "scenario",
  "debugging",
  "sql",
]);
const CODING_SET: ReadonlySet<QuestionType> = new Set(["coding"]);

// ── Per-section schemas — small and focused so the model rarely fails ──────
const McqSectionSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(5),
        options: z.array(z.string().min(1)).min(4),
        correctIndex: z.number().min(0).max(3),
      })
    )
    .default([]),
});
const MultiSectionSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(5),
        options: z.array(z.string().min(1)).min(4),
        correctIndices: z.array(z.number().min(0).max(3)).min(1).max(4),
      })
    )
    .default([]),
});
const DescriptiveSectionSchema = z.object({
  questions: z.array(z.string().min(5)).default([]),
});
const CodingSectionSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(10),
        starterCode: z.string().default(""),
        referenceSolution: z.string().default(""),
      })
    )
    .default([]),
});

interface CountPlan {
  mcqCount: number;
  multiCount: number;
  descCount: number;
  codingCount: number;
}

function normalizeQuestionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
function normalizeOptionText(option: string): string {
  return option.replace(/^[A-D][).:-]\s*/i, "").replace(/\s+/g, " ").trim();
}
function uniqueIndices(indices: number[]): number[] {
  const set = new Set<number>();
  for (const i of indices) {
    if (Number.isFinite(i) && i >= 0 && i <= 3) set.add(Math.round(i));
  }
  return Array.from(set).sort((a, b) => a - b);
}

function planCounts(state: ScreeningState): CountPlan {
  const enabled = state.enabledQuestionTypes ?? [];

  if (enabled.length === 0) {
    return {
      mcqCount: DEFAULT_MCQ_COUNT,
      multiCount: 0,
      descCount: DEFAULT_DESC_COUNT,
      codingCount: 0,
    };
  }

  const total =
    state.questionCount && state.questionCount > 0 ? state.questionCount : DEFAULT_TOTAL;

  const hasMcq = enabled.some((t) => MCQ_SET.has(t));
  const hasMulti = enabled.some((t) => MULTI_SET.has(t));
  const hasFree = enabled.some((t) => FREE_TEXT_SET.has(t));
  const hasCoding =
    enabled.some((t) => CODING_SET.has(t)) && (state.codingLanguages ?? []).length > 0;

  const buckets: { key: keyof CountPlan; weight: number }[] = [];
  if (hasMcq) buckets.push({ key: "mcqCount", weight: 4 });
  if (hasMulti) buckets.push({ key: "multiCount", weight: 2 });
  if (hasFree) buckets.push({ key: "descCount", weight: 2 });
  if (hasCoding) buckets.push({ key: "codingCount", weight: 1 });

  if (buckets.length === 0) {
    return {
      mcqCount: DEFAULT_MCQ_COUNT,
      multiCount: 0,
      descCount: DEFAULT_DESC_COUNT,
      codingCount: 0,
    };
  }

  const plan: CountPlan = { mcqCount: 0, multiCount: 0, descCount: 0, codingCount: 0 };
  const totalWeight = buckets.reduce((s, b) => s + b.weight, 0);
  let remaining = total;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (i === buckets.length - 1) {
      plan[b.key] = remaining;
    } else {
      const share = Math.max(1, Math.round((total * b.weight) / totalWeight));
      plan[b.key] = Math.min(share, remaining - (buckets.length - 1 - i));
      remaining -= plan[b.key];
    }
  }

  // Coding is expensive for the candidate — cap it unless it's the only type.
  if (plan.codingCount > 2 && buckets.length > 1) {
    const overflow = plan.codingCount - 2;
    plan.codingCount = 2;
    if (plan.mcqCount > 0) plan.mcqCount += overflow;
    else if (plan.descCount > 0) plan.descCount += overflow;
    else if (plan.multiCount > 0) plan.multiCount += overflow;
  }

  return plan;
}

function difficultyGuidance(difficulty: string): string {
  if (difficulty === "easy") return "Foundational concepts. Suitable for entry-level screening.";
  if (difficulty === "hard")
    return "Senior-level depth: architecture, optimisation, edge cases, trade-offs.";
  if (difficulty === "adaptive") return "Mix difficulty: 30% easy, 50% medium, 20% hard.";
  return "Mid-level depth, balanced across the listed skills.";
}

interface SectionPromptCtx {
  state: ScreeningState;
  skills: string[];
  difficulty: string;
  searchSection: string;
}

function jobContextBlock(ctx: SectionPromptCtx): string {
  const { state, skills } = ctx;
  return [
    `Job title: ${state.jobTitle}`,
    `Department: ${state.jobDepartment}`,
    `Requirements: ${state.jobRequirements.join(", ")}`,
    skills.length > 0 ? `Skills to test: ${skills.join(", ")}` : "",
    `Job description: ${state.jobDescription.slice(0, 1500)}`,
    ctx.searchSection,
  ]
    .filter(Boolean)
    .join("\n");
}

function commonSystemHeader(ctx: SectionPromptCtx): string[] {
  const lines = [`Difficulty: ${ctx.difficulty}.`, difficultyGuidance(ctx.difficulty)];
  if (ctx.skills.length > 0) {
    lines.push(`Distribute questions across these skills: ${ctx.skills.join(", ")}.`);
  }
  return lines;
}

// ── Normalizers / validators ──────────────────────────────────────────────
function normalizeMcq(raw: { question: string; options: string[]; correctIndex: number }) {
  return {
    question: normalizeQuestionText(raw.question),
    options: raw.options.map(normalizeOptionText).filter(Boolean),
    correctIndex: Math.min(Math.max(Math.round(raw.correctIndex), 0), 3),
  };
}
function isValidMcq(mcq: ReturnType<typeof normalizeMcq>): boolean {
  if (mcq.question.length === 0 || mcq.options.length < 4) return false;
  const distinct = new Set(mcq.options.slice(0, 4).map((o) => o.toLowerCase()));
  return distinct.size === 4;
}
function normalizeMulti(raw: { question: string; options: string[]; correctIndices: number[] }) {
  const options = raw.options.map(normalizeOptionText).filter(Boolean);
  return {
    question: normalizeQuestionText(raw.question),
    options,
    correctIndices: uniqueIndices(raw.correctIndices).filter((i) => i < options.length),
  };
}
function isValidMulti(multi: ReturnType<typeof normalizeMulti>): boolean {
  if (multi.question.length === 0 || multi.options.length < 4) return false;
  if (multi.correctIndices.length === 0) return false;
  const distinct = new Set(multi.options.slice(0, 4).map((o) => o.toLowerCase()));
  return distinct.size === 4;
}

// ── Fallback topic helpers ────────────────────────────────────────────────
function conciseTopic(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[.:;,]+$/g, "").slice(0, 80);
}
function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = conciseTopic(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}
function fallbackTopics(state: ScreeningState, skills: string[], needed: number): string[] {
  const explicit = uniqueItems(skills);
  if (explicit.length >= needed) return explicit.slice(0, needed);
  const requirements = uniqueItems(state.jobRequirements);
  const merged = uniqueItems([...explicit, ...requirements]);
  if (merged.length > 0) return merged;
  return uniqueItems([
    state.jobTitle,
    state.jobDepartment ? `${state.jobDepartment} responsibilities` : "",
    "problem solving",
    "communication",
    "quality and testing",
  ]).slice(0, Math.max(needed, 3));
}
function rotateOptions(options: string[], shift: number): { options: string[]; correctIndex: number } {
  const normalizedShift = shift % options.length;
  const rotated = options.slice(normalizedShift).concat(options.slice(0, normalizedShift));
  const correctIndex =
    options.length - normalizedShift === options.length ? 0 : options.length - normalizedShift;
  return { options: rotated, correctIndex };
}

// ── Deterministic fallback builders (used per-section on LLM failure) ──────
function buildFallbackMcq(topic: string, index: number): MCQQuestion {
  const templates = [
    {
      question: `When working with ${topic}, which approach is the safest starting point for a production change?`,
      options: [
        "Confirm requirements, review current behavior, and validate the change with tests",
        "Ship the quickest change first and verify later if something breaks",
        "Skip reviewing the existing system to save time",
        "Change multiple unrelated parts together to finish faster",
      ],
    },
    {
      question: `In a role that uses ${topic}, what is the best first step when investigating an unexpected issue?`,
      options: [
        "Reproduce the issue and inspect evidence such as logs, inputs, and recent changes",
        "Guess the root cause and deploy a fix immediately",
        "Disable alerts so the team can focus without noise",
        "Rewrite the feature before understanding the failure",
      ],
    },
    {
      question: `Which practice is most important when delivering work related to ${topic}?`,
      options: [
        "Make changes observable, testable, and easy to review",
        "Avoid documentation because speed matters more than clarity",
        "Prefer hidden one-off fixes over maintainable solutions",
        "Ignore edge cases until users report them",
      ],
    },
    {
      question: `For ${topic}, which behavior best reflects strong engineering judgement?`,
      options: [
        "Choose a solution that balances correctness, maintainability, and risk",
        "Always choose the fastest option even if it is fragile",
        "Avoid asking clarifying questions when requirements are unclear",
        "Treat testing as optional if the feature seems simple",
      ],
    },
  ];
  const template = templates[index % templates.length];
  const rotated = rotateOptions(template.options, index % 4);
  return {
    type: "mcq",
    text: template.question,
    options: rotated.options as [string, string, string, string],
    correctIndex: rotated.correctIndex,
  };
}
function buildFallbackMulti(topic: string, index: number): MultiSelectQuestion {
  const templates = [
    {
      question: `Which of the following are sound practices when working with ${topic}? (Select all that apply)`,
      options: [
        "Cover the critical paths with automated tests",
        "Skip code review for small changes",
        "Document non-obvious decisions and constraints",
        "Add observability around new behavior",
      ],
      correct: [0, 2, 3],
    },
    {
      question: `When designing a feature involving ${topic}, which trade-offs are worth weighing? (Select all that apply)`,
      options: [
        "Latency vs. cost",
        "Always pick the most familiar tool regardless of fit",
        "Maintainability vs. development speed",
        "Reliability vs. complexity",
      ],
      correct: [0, 2, 3],
    },
  ];
  const t = templates[index % templates.length];
  return {
    type: "multi_select",
    text: t.question,
    options: t.options as [string, string, string, string],
    correctIndices: t.correct,
  };
}
function buildFallbackDescriptive(topic: string, index: number): DescriptiveQuestion {
  const templates = [
    `Describe a project where you used ${topic} to solve a real problem. What was your approach and outcome?`,
    `How would you plan, test, and safely deliver a change related to ${topic} for this role?`,
    `What trade-offs would you consider when making an important decision involving ${topic}?`,
    `If you inherited a weak implementation related to ${topic}, how would you improve it step by step?`,
  ];
  return { type: "descriptive", text: templates[index % templates.length] };
}
function starterCodeFor(language: string, fnName: string, arg: string): string {
  switch (language) {
    case "python":
      return `def ${fnName}(${arg}):\n    # TODO: implement\n    pass\n`;
    case "java":
      return `public class Solution {\n    public static Object ${fnName}(Object ${arg}) {\n        // TODO: implement\n        return null;\n    }\n}\n`;
    case "cpp":
      return `#include <iostream>\n#include <vector>\n\n// TODO: implement ${fnName}\n\nint main() {\n    return 0;\n}\n`;
    case "sql":
      return `-- Write a query for the problem above.\nSELECT 1;\n`;
    case "typescript":
      return `export function ${fnName}(${arg}: unknown): unknown {\n  // TODO: implement\n  return null;\n}\n`;
    default:
      return `function ${fnName}(${arg}) {\n  // TODO: implement\n  return null;\n}\n`;
  }
}
function refSolutionFor(language: string, fnName: string): string {
  if (language === "python") {
    if (fnName === "sumOfEvens") return `def sumOfEvens(arr):\n    return sum(x for x in arr if x % 2 == 0)\n`;
    return `def reverseString(s):\n    return s[::-1]\n`;
  }
  if (fnName === "sumOfEvens") {
    return `function sumOfEvens(arr){ return arr.filter(x => x % 2 === 0).reduce((a,b)=>a+b, 0); }\n`;
  }
  return `function reverseString(s){ let r=''; for (let i=s.length-1;i>=0;i--) r+=s[i]; return r; }\n`;
}
function buildFallbackCoding(topic: string, language: string, index: number): CodingQuestion {
  const problems = [
    {
      question: `Write a function that takes an array of integers and returns the sum of all even numbers. Example: input [1, 2, 3, 4, 5] returns 6. Use ${language}.`,
      starter: starterCodeFor(language, "sumOfEvens", "arr"),
      ref: refSolutionFor(language, "sumOfEvens"),
    },
    {
      question: `Write a function that reverses a string without using built-in reverse helpers. Example: input "hello" returns "olleh". Use ${language}.`,
      starter: starterCodeFor(language, "reverseString", "s"),
      ref: refSolutionFor(language, "reverseString"),
    },
  ];
  const p = problems[index % problems.length];
  return {
    type: "coding",
    text: `${p.question} (Context: ${topic})`,
    language,
    starterCode: p.starter,
    referenceSolution: p.ref,
  };
}

// ── Per-section generators — each is one small, focused LLM call ───────────
async function generateMcqSection(
  ctx: SectionPromptCtx,
  count: number
): Promise<MCQQuestion[]> {
  const topics = fallbackTopics(ctx.state, ctx.skills, Math.max(count, 4));
  if (count <= 0) return [];
  try {
    const llm = createLLM({ maxTokens: 1600, timeout: SECTION_TIMEOUT_MS });
    const structured = llm.withStructuredOutput(McqSectionSchema, { name: "McqSection" });
    const system = [
      `Generate exactly ${count} single-correct multiple-choice questions for this job role.`,
      ...commonSystemHeader(ctx),
      "Rules: each MCQ has exactly 4 distinct options; exactly one is correct; correctIndex is 0-3.",
      "Return only structured data.",
    ].join("\n");
    const raw = await structured.invoke([
      new SystemMessage(system),
      new HumanMessage(jobContextBlock(ctx)),
    ]);
    const parsed = McqSectionSchema.parse(raw);
    const valid = parsed.questions
      .map(normalizeMcq)
      .filter(isValidMcq)
      .slice(0, count)
      .map(
        (q): MCQQuestion => ({
          type: "mcq",
          text: q.question,
          options: q.options.slice(0, 4) as [string, string, string, string],
          correctIndex: q.correctIndex,
        })
      );
    // Top up with deterministic questions if the model returned too few.
    while (valid.length < count) {
      valid.push(buildFallbackMcq(topics[valid.length % topics.length], valid.length));
    }
    return valid;
  } catch (err) {
    console.error("[generateQuestions] mcq section failed — using fallback:", err);
    return Array.from({ length: count }, (_, i) =>
      buildFallbackMcq(topics[i % topics.length], i)
    );
  }
}

async function generateMultiSection(
  ctx: SectionPromptCtx,
  count: number
): Promise<MultiSelectQuestion[]> {
  const topics = fallbackTopics(ctx.state, ctx.skills, Math.max(count, 4));
  if (count <= 0) return [];
  try {
    const llm = createLLM({ maxTokens: 1600, timeout: SECTION_TIMEOUT_MS });
    const structured = llm.withStructuredOutput(MultiSectionSchema, { name: "MultiSection" });
    const system = [
      `Generate exactly ${count} multi-select questions for this job role.`,
      ...commonSystemHeader(ctx),
      "Rules: each has exactly 4 distinct options; 1-4 options can be correct (usually 2-3);",
      "correctIndices is an array of unique 0-based indices.",
      "Return only structured data.",
    ].join("\n");
    const raw = await structured.invoke([
      new SystemMessage(system),
      new HumanMessage(jobContextBlock(ctx)),
    ]);
    const parsed = MultiSectionSchema.parse(raw);
    const valid = parsed.questions
      .map(normalizeMulti)
      .filter(isValidMulti)
      .slice(0, count)
      .map(
        (q): MultiSelectQuestion => ({
          type: "multi_select",
          text: q.question,
          options: q.options.slice(0, 4) as [string, string, string, string],
          correctIndices: q.correctIndices,
        })
      );
    while (valid.length < count) {
      valid.push(buildFallbackMulti(topics[valid.length % topics.length], valid.length));
    }
    return valid;
  } catch (err) {
    console.error("[generateQuestions] multi-select section failed — using fallback:", err);
    return Array.from({ length: count }, (_, i) =>
      buildFallbackMulti(topics[i % topics.length], i)
    );
  }
}

async function generateDescriptiveSection(
  ctx: SectionPromptCtx,
  count: number
): Promise<DescriptiveQuestion[]> {
  const topics = fallbackTopics(ctx.state, ctx.skills, Math.max(count, 4));
  if (count <= 0) return [];
  try {
    const llm = createLLM({ maxTokens: 1000, timeout: SECTION_TIMEOUT_MS });
    const structured = llm.withStructuredOutput(DescriptiveSectionSchema, {
      name: "DescriptiveSection",
    });
    const system = [
      `Generate exactly ${count} open-ended descriptive questions for this job role.`,
      ...commonSystemHeader(ctx),
      'Rules: each question requires a thoughtful written answer and is a single sentence ending with "?".',
      "Return only structured data.",
    ].join("\n");
    const raw = await structured.invoke([
      new SystemMessage(system),
      new HumanMessage(jobContextBlock(ctx)),
    ]);
    const parsed = DescriptiveSectionSchema.parse(raw);
    const valid = parsed.questions
      .map(normalizeQuestionText)
      .filter((t) => t.length >= 5)
      .slice(0, count)
      .map((text): DescriptiveQuestion => ({ type: "descriptive", text }));
    while (valid.length < count) {
      valid.push(buildFallbackDescriptive(topics[valid.length % topics.length], valid.length));
    }
    return valid;
  } catch (err) {
    console.error("[generateQuestions] descriptive section failed — using fallback:", err);
    return Array.from({ length: count }, (_, i) =>
      buildFallbackDescriptive(topics[i % topics.length], i)
    );
  }
}

async function generateCodingSection(
  ctx: SectionPromptCtx,
  count: number,
  language: string
): Promise<CodingQuestion[]> {
  const topics = fallbackTopics(ctx.state, ctx.skills, Math.max(count, 4));
  if (count <= 0) return [];
  try {
    const llm = createLLM({ maxTokens: 2000, timeout: SECTION_TIMEOUT_MS });
    const structured = llm.withStructuredOutput(CodingSectionSchema, { name: "CodingSection" });
    const system = [
      `Generate exactly ${count} coding problems in ${language} for this job role.`,
      ...commonSystemHeader(ctx),
      "For each: 'question' is the full problem statement (requirements, input, expected output, an example).",
      `'starterCode' is a short ${language} skeleton (~10 lines). 'referenceSolution' is a correct concise ${language} solution (~30 lines), kept hidden from the candidate.`,
      "Return only structured data.",
    ].join("\n");
    const raw = await structured.invoke([
      new SystemMessage(system),
      new HumanMessage(jobContextBlock(ctx)),
    ]);
    const parsed = CodingSectionSchema.parse(raw);
    const valid = parsed.questions
      .filter((c) => normalizeQuestionText(c.question).length >= 10)
      .slice(0, count)
      .map(
        (c): CodingQuestion => ({
          type: "coding",
          text: normalizeQuestionText(c.question),
          language,
          starterCode: c.starterCode || starterCodeFor(language, "solve", "input"),
          referenceSolution: c.referenceSolution || "",
        })
      );
    while (valid.length < count) {
      valid.push(buildFallbackCoding(topics[valid.length % topics.length], language, valid.length));
    }
    return valid;
  } catch (err) {
    console.error("[generateQuestions] coding section failed — using fallback:", err);
    return Array.from({ length: count }, (_, i) =>
      buildFallbackCoding(topics[i % topics.length], language, i)
    );
  }
}

function pickCodingLanguage(allowed: string[]): string {
  if (allowed.length === 0) return "javascript";
  const preferred = ["javascript", "python", "typescript"];
  for (const p of preferred) if (allowed.includes(p)) return p;
  return allowed[0];
}

export const generateQuestionsNode = traceable(
  async (state: ScreeningState): Promise<Partial<ScreeningState>> => {
    const plan = planCounts(state);
    const skills = state.skills ?? [];
    const difficulty = state.difficulty || "medium";
    const codingLanguage = pickCodingLanguage(state.codingLanguages ?? []);

    // One web search up front, shared by every section. It's hard-capped at
    // 8s in tavily.ts and degrades to "" on failure, so it can't stall us.
    let searchSection = "";
    try {
      const topicHint =
        skills.length > 0
          ? skills.slice(0, 5).join(", ")
          : `${state.jobTitle} ${state.jobDepartment}`;
      const searchContext = await webSearch(
        `${topicHint} ${difficulty} technical interview questions`,
        3
      );
      if (searchContext) {
        searchSection = `\n\nWeb context (use as inspiration only):\n${searchContext}`;
      }
    } catch {
      // search is optional — continue without it
    }

    const ctx: SectionPromptCtx = { state, skills, difficulty, searchSection };

    // Each section is an independent, small LLM call. Running them in parallel
    // means total latency ≈ the slowest section, not the sum — and any one
    // section failing only falls back that section, not the whole quiz.
    const [mcq, multi, desc, coding] = await Promise.all([
      generateMcqSection(ctx, plan.mcqCount),
      generateMultiSection(ctx, plan.multiCount),
      generateDescriptiveSection(ctx, plan.descCount),
      generateCodingSection(ctx, plan.codingCount, codingLanguage),
    ]);

    const questions: ScreeningQuestion[] = [...mcq, ...multi, ...desc, ...coding];
    return { questions };
  },
  { name: "generate_questions", run_type: "chain", tags: ["screening"] }
) as (state: ScreeningState) => Promise<Partial<ScreeningState>>;

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { webSearch } from "../../tavily";
import type { QuestionType } from "../../constants/assessment";
import type { ScreeningQuestion, ScreeningState } from "../screeningState";

// Default fallback split (when no AssessmentConfig is present).
const DEFAULT_TOTAL = 10;
const DEFAULT_MCQ_COUNT = 8;
const DEFAULT_DESC_COUNT = 2;

const QuestionsSchema = z.object({
  mcqQuestions: z
    .array(
      z.object({
        question: z.string().min(5),
        options: z.array(z.string().min(1)).min(4),
        correctIndex: z.number().min(0).max(3),
      })
    )
    .default([]),
  descriptiveQuestions: z.array(z.string().min(5)).default([]),
});

type ParsedQuestions = z.infer<typeof QuestionsSchema>;
type ParsedMcq = ParsedQuestions["mcqQuestions"][number];

const MCQ_TYPES: ReadonlySet<QuestionType> = new Set(["mcq", "multi_select"]);
const FREE_TEXT_TYPES: ReadonlySet<QuestionType> = new Set([
  "short_answer",
  "scenario",
  "debugging",
  "coding",
  "sql",
]);

interface CountPlan {
  mcqCount: number;
  descCount: number;
}

interface PromptContext extends CountPlan {
  difficulty: string;
  skills: string[];
  enabledLabels: string;
  strictJson?: boolean;
}

function normalizeQuestionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeOptionText(option: string): string {
  return option.replace(/^[A-D][).:-]\s*/i, "").replace(/\s+/g, " ").trim();
}

function planCounts(state: ScreeningState): CountPlan {
  const enabled = state.enabledQuestionTypes ?? [];
  const mcqEnabled = enabled.some((t) => MCQ_TYPES.has(t));
  const freeEnabled = enabled.some((t) => FREE_TEXT_TYPES.has(t));

  if (enabled.length === 0) {
    return { mcqCount: DEFAULT_MCQ_COUNT, descCount: DEFAULT_DESC_COUNT };
  }

  const total =
    state.questionCount && state.questionCount > 0 ? state.questionCount : DEFAULT_TOTAL;

  if (mcqEnabled && !freeEnabled) return { mcqCount: total, descCount: 0 };
  if (!mcqEnabled && freeEnabled) return { mcqCount: 0, descCount: total };
  if (!mcqEnabled && !freeEnabled) {
    return { mcqCount: DEFAULT_MCQ_COUNT, descCount: DEFAULT_DESC_COUNT };
  }

  const descCount = Math.max(1, Math.round(total * 0.2));
  const mcqCount = Math.max(1, total - descCount);
  return { mcqCount, descCount };
}

function difficultyGuidance(difficulty: string): string {
  if (difficulty === "easy") {
    return "Foundational concepts. Suitable for entry-level screening.";
  }
  if (difficulty === "hard") {
    return "Senior-level depth: architecture, optimisation, edge cases, trade-offs.";
  }
  if (difficulty === "adaptive") {
    return "Mix difficulty: 30% easy, 50% medium, 20% hard.";
  }
  return "Mid-level depth, balanced across the listed skills.";
}

function buildSystemPrompt(ctx: PromptContext): string {
  const { mcqCount, descCount, difficulty, skills, enabledLabels, strictJson } = ctx;
  const lines: string[] = [];

  if (mcqCount > 0 && descCount > 0) {
    lines.push(
      `Generate exactly ${mcqCount} multiple-choice questions and ${descCount} open-ended descriptive questions for this job role.`
    );
  } else if (mcqCount > 0) {
    lines.push(
      `Generate exactly ${mcqCount} multiple-choice questions for this job role. Do NOT generate any descriptive questions.`
    );
  } else {
    lines.push(
      `Generate exactly ${descCount} open-ended descriptive questions for this job role. Do NOT generate any multiple-choice questions.`
    );
  }

  lines.push("", `Difficulty: ${difficulty}.`, difficultyGuidance(difficulty));

  if (skills.length > 0) {
    lines.push(
      "",
      "Skills to test:",
      `- ${skills.join("\n- ")}`,
      "Distribute questions across the listed skills."
    );
  }

  if (enabledLabels) {
    lines.push(
      "",
      `Enabled question formats: ${enabledLabels}.`,
      "Multi-select formats must still be rendered as a single-correct MCQ.",
      "Coding/SQL/debugging formats must be phrased as written-answer prompts."
    );
  }

  if (mcqCount > 0) {
    lines.push(
      "",
      `MCQ rules (${mcqCount} questions):`,
      "- Each MCQ has exactly 4 options.",
      "- Exactly one option is correct.",
      "- correctIndex must be 0, 1, 2, or 3.",
      "- Keep all options concise and distinct."
    );
  }

  if (descCount > 0) {
    lines.push(
      "",
      `Descriptive rules (${descCount} questions):`,
      "- Each question must require a thoughtful written answer.",
      '- Each question must be a single sentence ending with "?".'
    );
  }

  lines.push(
    "",
    "Return only structured data for the schema requested.",
    strictJson
      ? "Do not add explanations, notes, or markdown before or after the structured result."
      : ""
  );

  return lines.join("\n");
}

function buildUserPrompt(state: ScreeningState, skills: string[], searchSection: string): string {
  return [
    `Job title: ${state.jobTitle}`,
    `Department: ${state.jobDepartment}`,
    `Requirements: ${state.jobRequirements.join(", ")}`,
    skills.length > 0 ? `Configured skills: ${skills.join(", ")}` : "",
    `Job description: ${state.jobDescription.slice(0, 2000)}`,
    searchSection,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeMcq(raw: ParsedMcq) {
  return {
    question: normalizeQuestionText(raw.question),
    options: raw.options.map(normalizeOptionText).filter(Boolean),
    correctIndex: Math.min(Math.max(Math.round(raw.correctIndex), 0), 3),
  };
}

function isValidMcq(mcq: ReturnType<typeof normalizeMcq>): boolean {
  if (mcq.question.length === 0 || mcq.options.length < 4) return false;
  const distinct = new Set(mcq.options.slice(0, 4).map((option) => option.toLowerCase()));
  return distinct.size === 4;
}

function collectMcqs(raw: ParsedMcq[], mcqCount: number) {
  if (mcqCount <= 0) return [];
  return raw.map(normalizeMcq).filter(isValidMcq).slice(0, mcqCount);
}

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
  const correctIndex = options.length - normalizedShift === options.length ? 0 : options.length - normalizedShift;
  return { options: rotated, correctIndex };
}

function buildFallbackMcq(topic: string, index: number): ScreeningQuestion {
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

function buildFallbackDescriptive(topic: string, index: number): ScreeningQuestion {
  const templates = [
    `Describe a project where you used ${topic} to solve a real problem. What was your approach and outcome?`,
    `How would you plan, test, and safely deliver a change related to ${topic} for this role?`,
    `What trade-offs would you consider when making an important decision involving ${topic}?`,
    `If you inherited a weak implementation related to ${topic}, how would you improve it step by step?`,
  ];

  return {
    type: "descriptive",
    text: templates[index % templates.length],
  };
}

function buildFallbackQuestions(
  state: ScreeningState,
  plan: CountPlan,
  skills: string[]
): ScreeningQuestion[] {
  const topics = fallbackTopics(state, skills, Math.max(plan.mcqCount, plan.descCount, 4));
  const questions: ScreeningQuestion[] = [];

  for (let i = 0; i < plan.mcqCount; i++) {
    questions.push(buildFallbackMcq(topics[i % topics.length] || state.jobTitle, i));
  }

  for (let i = 0; i < plan.descCount; i++) {
    questions.push(buildFallbackDescriptive(topics[i % topics.length] || state.jobTitle, i));
  }

  return questions;
}

async function generateQuestionsAttempt(
  state: ScreeningState,
  plan: CountPlan,
  skills: string[],
  difficulty: string,
  enabledLabels: string,
  searchSection: string,
  strictJson = false
): Promise<ParsedQuestions> {
  const llm = createLLM({ maxTokens: 2200, timeout: 15000 });
  const structured = llm.withStructuredOutput(QuestionsSchema, { name: "GeneratedQuestions" });

  const result = await structured.invoke([
    new SystemMessage(
      buildSystemPrompt({ ...plan, difficulty, skills, enabledLabels, strictJson })
    ),
    new HumanMessage(buildUserPrompt(state, skills, searchSection)),
  ]);

  return QuestionsSchema.parse(result);
}

function questionsFromParsed(parsed: ParsedQuestions, plan: CountPlan): ScreeningQuestion[] | null {
  if (plan.descCount > 0 && parsed.descriptiveQuestions.length < plan.descCount) return null;

  const validMcq = collectMcqs(parsed.mcqQuestions, plan.mcqCount);
  if (plan.mcqCount > 0 && validMcq.length < plan.mcqCount) return null;

  return [
    ...validMcq.map(
      (question): ScreeningQuestion => ({
        type: "mcq",
        text: question.question,
        options: question.options.slice(0, 4) as [string, string, string, string],
        correctIndex: question.correctIndex,
      })
    ),
    ...parsed.descriptiveQuestions.slice(0, plan.descCount).map(
      (question): ScreeningQuestion => ({
        type: "descriptive",
        text: normalizeQuestionText(question),
      })
    ),
  ];
}

export const generateQuestionsNode = traceable(
  async (state: ScreeningState): Promise<Partial<ScreeningState>> => {
    const plan = planCounts(state);
    const skills = state.skills ?? [];
    const difficulty = state.difficulty || "medium";
    const enabledLabels = (state.enabledQuestionTypes ?? [])
      .filter((t) => t !== "video" && t !== "voice")
      .join(", ");

    try {
      const topicHint =
        skills.length > 0
          ? skills.slice(0, 5).join(", ")
          : `${state.jobTitle} ${state.jobDepartment}`;
      const searchContext = await webSearch(
        `${topicHint} ${difficulty} technical interview questions`,
        3
      );
      const searchSection = searchContext
        ? `\n\nWeb context (use as inspiration for realistic questions):\n${searchContext}`
        : "";

      try {
        const parsed = await generateQuestionsAttempt(
          state,
          plan,
          skills,
          difficulty,
          enabledLabels,
          searchSection
        );
        const questions = questionsFromParsed(parsed, plan);
        if (questions) return { questions };
      } catch (err) {
        console.error("[generateQuestions] structured attempt failed:", err);
      }

      try {
        const parsed = await generateQuestionsAttempt(
          state,
          plan,
          skills,
          difficulty,
          enabledLabels,
          "",
          true
        );
        const questions = questionsFromParsed(parsed, plan);
        if (questions) return { questions };
      } catch (err) {
        console.error("[generateQuestions] strict retry failed:", err);
      }

      // Final safety net: generate a deterministic quiz locally so the
      // candidate is never blocked by malformed AI output.
      return { questions: buildFallbackQuestions(state, plan, skills) };
    } catch (err) {
      console.error("[generateQuestions] falling back after error:", err);
      return { questions: buildFallbackQuestions(state, plan, skills) };
    }
  },
  { name: "generate_questions", run_type: "chain", tags: ["screening"] }
) as (state: ScreeningState) => Promise<Partial<ScreeningState>>;

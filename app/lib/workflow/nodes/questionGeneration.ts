import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { parseLooseJson } from "../../json";
import {
  type Difficulty,
  type InterviewState,
  type PlannedQuestion,
  type QuestionType,
} from "../interviewState";

const QuestionListSchema = z.object({
  questions: z
    .array(
      z.object({
        type: z.string(),
        prompt: z.string().min(8),
        skill: z.string().optional(),
      })
    )
    .min(1),
});

const SingleQuestionSchema = z.object({
  prompt: z.string().min(8),
  skill: z.string().optional(),
});

function expandSections(
  plan: InterviewState["plan"]
): { type: QuestionType; index: number }[] {
  if (!plan) return [];
  const out: { type: QuestionType; index: number }[] = [];
  let i = 0;
  for (const section of plan.sections) {
    for (let k = 0; k < section.count; k++) {
      out.push({ type: section.type, index: i++ });
    }
  }
  return out;
}

function ensureIntroPrompt(name: string, jobTitle: string): string {
  return `Hi ${name}! Welcome to your AI interview for the **${jobTitle}** role. To start, can you walk me through your background and what drew you to this kind of work?`;
}

/**
 * Generate the full set of dynamic, production-grade questions for the
 * interview plan. Avoids textbook phrasings — every question is framed as a
 * real-world scenario the candidate would face on the job.
 */
export const questionGenerationNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      if (!state.plan) {
        return { error: "Interview plan missing — cannot generate questions" };
      }

      const slots = expandSections(state.plan);
      const introSlot = slots[0]?.type === "introduction" ? slots[0] : null;
      const nonIntroSlots = introSlot ? slots.slice(1) : slots;

      const llm = createLLM({ temperature: 0.85, maxTokens: 2200 });
      const result = await llm.invoke([
        new SystemMessage(
          [
            "You are a Staff Engineer who interviews candidates for a living.",
            "Generate REAL-WORLD interview questions, not textbook ones.",
            "",
            "STRICT rules:",
            "- Each question must be production-grade, scenario-based, and tied to actual work.",
            '- BAD: "What is React?"  GOOD: "How would you optimize re-renders in a 10k-row admin dashboard with websocket updates?"',
            '- BAD: "Explain CAP theorem"  GOOD: "Your read-heavy service is paginating 50M rows; design the cache + database split."',
            "- For 'behavioral'/'leadership': frame around a concrete situation the candidate likely faced.",
            "- For 'coding'/'debugging': describe the bug or feature in business terms; don't paste code in the prompt.",
            "- For 'sql': describe the dataset and the question; don't ask 'what is a JOIN'.",
            "- Match difficulty to the requested level.",
            "- Avoid repetition across questions.",
            "",
            "Return strict JSON:",
            '{ "questions": [ { "type": "<type>", "prompt": "<question>", "skill": "<optional skill tag>" }, ... ] }',
            `Generate exactly ${nonIntroSlots.length} question(s), in the order requested.`,
            "No fences, no commentary — JSON only.",
          ].join("\n")
        ),
        new HumanMessage(
          [
            `Job title: ${state.jobTitle}`,
            `Job requirements: ${state.jobRequirements.join(", ")}`,
            `Difficulty: ${state.plan.startingDifficulty}`,
            "",
            `Candidate matched skills: ${state.skillMatch?.matchedSkills.join(", ") ?? ""}`,
            `Candidate weak skills: ${state.skillMatch?.missingSkills.join(", ") ?? ""}`,
            `Advanced opportunities: ${state.skillMatch?.advancedOpportunities.join(", ") ?? ""}`,
            "",
            "Question slots to fill (in order):",
            nonIntroSlots
              .map((s, i) => `${i + 1}. type=${s.type}`)
              .join("\n"),
          ].join("\n")
        ),
      ]);

      const raw = typeof result.content === "string" ? result.content : "";
      const parsed = QuestionListSchema.parse(parseLooseJson(raw));

      const generatedQs: PlannedQuestion[] = nonIntroSlots.map((slot, i) => {
        const got = parsed.questions[i];
        return {
          type: slot.type,
          difficulty: state.plan!.startingDifficulty,
          skill: got?.skill,
          generatedAdaptively: false,
          prompt:
            got?.prompt?.trim() ||
            `Tell me about a specific time you worked on something related to ${slot.type}.`,
        };
      });

      const allQuestions: PlannedQuestion[] = [];
      if (introSlot) {
        allQuestions.push({
          type: "introduction",
          difficulty: "easy",
          generatedAdaptively: false,
          prompt: ensureIntroPrompt(state.candidateName, state.jobTitle),
        });
      }
      allQuestions.push(...generatedQs);

      const firstQuestion = allQuestions[0];
      const greeting = introSlot
        ? `${firstQuestion.prompt}\n\n_(${allQuestions.length} questions total — take your time on each.)_`
        : `Hi ${state.candidateName}! Welcome to your AI interview for **${state.jobTitle}**.\n\n**Question 1 of ${allQuestions.length}:** ${firstQuestion.prompt}`;

      return {
        questions: allQuestions,
        currentQuestionIndex: 0,
        conversationHistory: [{ role: "assistant", content: greeting }],
        aiReply: greeting,
        answers: [],
        evaluations: [],
        currentStage: "questions_generated",
      };
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? `Question generation failed: ${err.message}`
            : String(err),
      };
    }
  },
  { name: "question_generation", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

/**
 * Generate a single adaptive replacement question on-the-fly. Used by the
 * DifficultyDecision/FollowUp routing to swap in a fresh harder/easier or
 * topic-switched question without regenerating the whole plan.
 */
export async function generateSingleQuestion(
  state: InterviewState,
  spec: {
    type: QuestionType;
    difficulty: Difficulty;
    skill?: string;
    contextHint?: string;
  }
): Promise<PlannedQuestion> {
  try {
    const llm = createLLM({ temperature: 0.9, maxTokens: 400 });
    const result = await llm.invoke([
      new SystemMessage(
        [
          "Generate ONE interview question. Real-world, scenario-based, production-grade.",
          "Output strict JSON:",
          '{ "prompt": "<question>", "skill": "<tag>" }',
          "No fences. Avoid repeating any of the previous questions provided.",
        ].join("\n")
      ),
      new HumanMessage(
        [
          `Job: ${state.jobTitle}`,
          `Type: ${spec.type}`,
          `Difficulty: ${spec.difficulty}`,
          spec.skill ? `Target skill: ${spec.skill}` : "",
          spec.contextHint ? `Context: ${spec.contextHint}` : "",
          "",
          "Previous questions (do not repeat):",
          state.questions.map((q, i) => `${i + 1}. ${q.prompt}`).join("\n"),
        ]
          .filter(Boolean)
          .join("\n")
      ),
    ]);

    const raw = typeof result.content === "string" ? result.content : "";
    const parsed = SingleQuestionSchema.parse(parseLooseJson(raw));
    return {
      type: spec.type,
      difficulty: spec.difficulty,
      skill: spec.skill ?? parsed.skill,
      generatedAdaptively: true,
      prompt: parsed.prompt.trim(),
    };
  } catch {
    return {
      type: spec.type,
      difficulty: spec.difficulty,
      skill: spec.skill,
      generatedAdaptively: true,
      prompt: `Can you walk me through a concrete example of working with ${spec.skill ?? spec.type} in production?`,
    };
  }
}

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { traceable } from "langsmith/traceable";
import { z } from "zod";
import { createLLM } from "../../groq";
import { parseLooseJson } from "../../json";
import {
  ZERO_SCORES,
  type AnswerEvaluation,
  type DimensionScores,
  type InterviewState,
} from "../interviewState";

const DimensionSchema = z.object({
  technical: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  problemSolving: z.number().min(0).max(100),
  architectureThinking: z.number().min(0).max(100),
});

const EvaluationSchema = z.object({
  scores: DimensionSchema,
  reasoning: z.string().default(""),
  feedback: z.string().default(""),
  nextAction: z
    .enum(["advance", "followup", "harder", "easier", "switch_topic", "complete"])
    .default("advance"),
});

const NON_ANSWER_PATTERNS = [
  /^\(skipped\)$/i,
  /^skip$/i,
  /^no answer$/i,
  /^n\/?a$/i,
  /^i\s+don'?t\s+know$/i,
];

function isNonAnswer(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  return NON_ANSWER_PATTERNS.some((p) => p.test(t));
}

/** Cheap communication-quality heuristic to backstop the LLM. */
function communicationFloor(answer: string): number {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  if (words.length < 8) return 25;
  if (words.length < 20) return 45;
  if (words.length < 50) return 60;
  return 75;
}

function rollingMean(prev: DimensionScores, next: DimensionScores, n: number): DimensionScores {
  const lerp = (a: number, b: number) => Math.round((a * (n - 1) + b) / n);
  return {
    technical: lerp(prev.technical, next.technical),
    communication: lerp(prev.communication, next.communication),
    confidence: lerp(prev.confidence, next.confidence),
    problemSolving: lerp(prev.problemSolving, next.problemSolving),
    architectureThinking: lerp(prev.architectureThinking, next.architectureThinking),
  };
}

/**
 * Evaluate the candidate's most recent answer along five dimensions and
 * decide the routing hint for the next step. The graph's conditional edges
 * read `nextAction` to pick the next node.
 */
export const answerEvaluationNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    try {
      const idx = state.currentQuestionIndex;
      const question = state.questions[idx];
      const userMsg = state.userMessage.trim();

      if (!question) {
        return { error: "No active question to evaluate against" };
      }

      const skipped = isNonAnswer(userMsg);
      let evaluation: AnswerEvaluation;

      if (skipped) {
        evaluation = {
          scores: { ...ZERO_SCORES },
          reasoning: "Candidate skipped or declined to answer.",
          feedback: "No answer provided.",
          nextAction: idx >= state.questions.length - 1 ? "complete" : "advance",
        };
      } else {
        const llm = createLLM({ temperature: 0.2, maxTokens: 900 });
        const previousQA = state.questions
          .slice(0, idx)
          .map(
            (q, i) =>
              `Q${i + 1} (${q.type}/${q.difficulty}): ${q.prompt}\nA${i + 1}: ${
                state.answers[i] ?? "(skipped)"
              }`
          )
          .join("\n\n");

        const result = await llm.invoke([
          new SystemMessage(
            [
              "You are a senior engineering interviewer grading an answer along FIVE dimensions.",
              "All scores are 0-100. Be fair but discerning — don't inflate.",
              "",
              "Dimensions:",
              "- technical: factual correctness, depth, specifics, real-world fluency",
              "- communication: clarity, structure, professionalism (ignore accent / grammar)",
              "- confidence: assertiveness vs. hedging, ownership of opinions",
              "- problemSolving: reasoning quality, trade-off awareness, approach",
              "- architectureThinking: systems thinking, scale considerations, design choices",
              "",
              "Also decide nextAction:",
              "- 'advance' = move to next planned question",
              "- 'followup' = the answer was promising but shallow; probe deeper on this same topic",
              "- 'harder' = the candidate nailed it; raise difficulty",
              "- 'easier' = the candidate struggled badly; lower difficulty for the next one",
              "- 'switch_topic' = answer suggests a strength elsewhere worth exploring",
              "- 'complete' = answer is so strong AND we are near the planned end that we can stop early",
              "",
              "Return strict JSON:",
              "{",
              '  "scores": { "technical": <0-100>, "communication": <0-100>, "confidence": <0-100>, "problemSolving": <0-100>, "architectureThinking": <0-100> },',
              '  "reasoning": "<2-3 sentence reasoning for the scores>",',
              '  "feedback": "<one short sentence the recruiter sees>",',
              '  "nextAction": "<one of the values above>"',
              "}",
              "JSON only, no fences.",
            ].join("\n")
          ),
          new HumanMessage(
            [
              `Job: ${state.jobTitle}`,
              `Requirements: ${state.jobRequirements.join(", ")}`,
              "",
              `Current question (${question.type}/${question.difficulty}): ${question.prompt}`,
              `Candidate's answer: ${userMsg.slice(0, 1500)}`,
              "",
              previousQA ? `Previous Q&A:\n${previousQA}` : "",
            ].join("\n")
          ),
        ]);

        const raw = typeof result.content === "string" ? result.content : "";
        const parsed = EvaluationSchema.parse(parseLooseJson(raw));

        // Floor communication score by length so word-counts can't beat language model fluctuations.
        const commFloor = communicationFloor(userMsg);
        const scores: DimensionScores = {
          technical: Math.round(parsed.scores.technical),
          communication: Math.max(commFloor, Math.round(parsed.scores.communication)),
          confidence: Math.round(parsed.scores.confidence),
          problemSolving: Math.round(parsed.scores.problemSolving),
          architectureThinking: Math.round(parsed.scores.architectureThinking),
        };

        // Force 'complete' when we're at the planned last question regardless of model intent.
        const isLast = idx >= state.questions.length - 1;
        let nextAction = parsed.nextAction;
        if (isLast && nextAction !== "complete") nextAction = "complete";

        // Honor HR-configured toggles. allowFollowups=false → no drill-downs.
        // adaptiveDifficulty=false → no harder/easier/switch_topic detours.
        // Both downgrade to "advance" so the interview marches through the
        // fixed plan exactly as configured.
        const settings = state.interviewSettings;
        if (settings) {
          if (!settings.allowFollowups && nextAction === "followup") {
            nextAction = "advance";
          }
          if (
            !settings.adaptiveDifficulty &&
            (nextAction === "harder" ||
              nextAction === "easier" ||
              nextAction === "switch_topic")
          ) {
            nextAction = "advance";
          }
        }

        evaluation = {
          scores,
          reasoning: parsed.reasoning,
          feedback: parsed.feedback,
          nextAction,
        };
      }

      // Persist evaluation + answer
      const evaluations = [...state.evaluations];
      evaluations[idx] = evaluation;
      const answers = [...state.answers];
      answers[idx] = skipped ? "(skipped)" : userMsg;

      const turnCount = idx + 1;
      const runningScores = rollingMean(state.runningScores, evaluation.scores, turnCount);

      return {
        answers,
        evaluations,
        nextAction: evaluation.nextAction,
        runningScores,
        candidateConfidence: evaluation.scores.confidence,
        conversationHistory: [
          ...state.conversationHistory,
          { role: "user", content: userMsg },
        ],
        currentStage: "evaluated",
      };
    } catch (err) {
      console.error("[interview] answerEvaluation failed:", err);
      // Degrade: record raw answer with zero scores and advance.
      const idx = state.currentQuestionIndex;
      const answers = [...state.answers];
      answers[idx] = state.userMessage.trim();
      const evaluations = [...state.evaluations];
      evaluations[idx] = {
        scores: { ...ZERO_SCORES },
        reasoning: "Evaluator error — skipped scoring.",
        feedback: "",
        nextAction: idx >= state.questions.length - 1 ? "complete" : "advance",
      };
      return {
        answers,
        evaluations,
        nextAction: evaluations[idx].nextAction,
        conversationHistory: [
          ...state.conversationHistory,
          { role: "user", content: state.userMessage.trim() },
        ],
        currentStage: "evaluated",
      };
    }
  },
  { name: "answer_evaluation", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

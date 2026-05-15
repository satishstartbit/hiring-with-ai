import { traceable } from "langsmith/traceable";
import { generateSingleQuestion } from "./questionGeneration";
import { type Difficulty, type InterviewState } from "../interviewState";

function bumpDifficulty(current: Difficulty, direction: "up" | "down"): Difficulty {
  const order: Difficulty[] = ["easy", "medium", "hard"];
  const i = order.indexOf(current);
  if (direction === "up") return order[Math.min(order.length - 1, i + 1)];
  return order[Math.max(0, i - 1)];
}

/**
 * Apply the routing hint from AnswerEvaluation to the upcoming question:
 *   - harder       → swap next question prompt with a harder adaptive variant
 *   - easier       → swap with an easier adaptive variant
 *   - switch_topic → swap to a fresh topic (uses candidate's advanced
 *                    opportunities or weak skills if available)
 *
 * No-op for "advance" / "followup" / "complete" — those are handled by
 * other nodes / graph edges.
 */
export const difficultyDecisionNode = traceable(
  async (state: InterviewState): Promise<Partial<InterviewState>> => {
    const action = state.nextAction;
    const nextIdx = state.currentQuestionIndex + 1;

    if (action === "advance" || action === "followup" || action === "complete") {
      return { currentStage: `decided_${action}` };
    }
    if (nextIdx >= state.questions.length) {
      return { currentStage: "decided_advance" };
    }
    // HR pinned the difficulty curve — skip adaptive question swaps entirely.
    // Belt-and-braces: answerEvaluation should already downgrade these to
    // "advance", but if it slipped through we no-op here.
    if (state.interviewSettings?.adaptiveDifficulty === false) {
      return { currentStage: "decided_advance" };
    }

    const nextSlot = state.questions[nextIdx];
    const direction: "up" | "down" =
      action === "harder" ? "up" : action === "easier" ? "down" : "up";
    const newDifficulty = bumpDifficulty(nextSlot.difficulty, direction);

    let targetSkill = nextSlot.skill;
    let targetType = nextSlot.type;
    if (action === "switch_topic") {
      const candidateStrong = state.strongSkills[0];
      const candidateWeak = state.weakSkills[0];
      targetSkill = candidateStrong ?? candidateWeak ?? targetSkill;
      // Keep the slot type but bias towards a scenario-style probe.
      if (targetType === "introduction") targetType = "scenario";
    }

    const replacement = await generateSingleQuestion(state, {
      type: targetType,
      difficulty: newDifficulty,
      skill: targetSkill,
      contextHint:
        action === "switch_topic"
          ? "The previous answer suggested switching topic. Pick a different angle."
          : action === "harder"
          ? "The previous answer was very strong. Make the next one materially harder."
          : "The previous answer struggled. Make the next one approachable.",
    });

    const updatedQuestions = [...state.questions];
    updatedQuestions[nextIdx] = replacement;

    return {
      questions: updatedQuestions,
      currentDifficulty: newDifficulty,
      currentStage: `decided_${action}`,
    };
  },
  { name: "difficulty_decision", run_type: "chain", tags: ["interview"] }
) as (state: InterviewState) => Promise<Partial<InterviewState>>;

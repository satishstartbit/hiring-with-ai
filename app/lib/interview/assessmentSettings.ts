import type { IAntiCheatSettings, IInterviewSettings } from "../db/models/AssessmentConfig";
import type { InterviewSettings, QuestionType } from "../workflow/interviewState";

const DEFAULT_TOPICS: QuestionType[] = [
  "introduction",
  "technical",
  "scenario",
  "behavioral",
];

/** Map AssessmentConfig.interview → LangGraph InterviewSettings. */
export function resolveInterviewSettings(
  interview: IInterviewSettings | null | undefined
): InterviewSettings | null {
  if (!interview) return null;
  return {
    durationMinutes: interview.durationMinutes ?? 15,
    questionCount: interview.questionCount ?? 8,
    topics: (interview.topics as QuestionType[])?.length
      ? (interview.topics as QuestionType[])
      : DEFAULT_TOPICS,
    difficulty: interview.difficulty ?? "medium",
    passingScore: interview.passingScore ?? 20,
    allowFollowups: interview.allowFollowups ?? true,
    adaptiveDifficulty: interview.adaptiveDifficulty ?? true,
  };
}

export interface ClientAntiCheat {
  tabSwitchDetection: boolean;
  blockCopyPaste: boolean;
  fullscreenRequired: boolean;
  webcamMonitoring: boolean;
  maxViolations: number;
}

export function resolveAntiCheat(
  antiCheat: IAntiCheatSettings | null | undefined
): ClientAntiCheat {
  return {
    tabSwitchDetection: antiCheat?.tabSwitchDetection ?? true,
    blockCopyPaste: antiCheat?.blockCopyPaste ?? false,
    fullscreenRequired: antiCheat?.fullscreenRequired ?? false,
    webcamMonitoring: antiCheat?.webcamMonitoring ?? false,
    maxViolations: antiCheat?.maxViolations ?? 3,
  };
}

/** Wall-clock seconds left for an in-progress interview (server-authoritative). */
export function computeInterviewTimeLimitSeconds(
  durationMinutes: number,
  status: string,
  startedAt: Date | string | null | undefined
): number {
  const fullSeconds = Math.max(0, durationMinutes) * 60;
  if (status === "completed") return 0;
  if (status === "in_progress" && startedAt) {
    const elapsedSec = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000
    );
    return Math.max(0, fullSeconds - elapsedSec);
  }
  return fullSeconds;
}

export function isInterviewTimeExpired(
  durationMinutes: number,
  status: string,
  startedAt: Date | string | null | undefined
): boolean {
  return (
    status === "in_progress" &&
    computeInterviewTimeLimitSeconds(durationMinutes, status, startedAt) <= 0
  );
}

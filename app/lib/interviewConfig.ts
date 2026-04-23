export const INTERVIEW_QUESTION_COUNT = 6;
export const INTERVIEW_PASSING_SCORE = 20;

export function isInterviewPassed(score: number | null | undefined): boolean {
  return (score ?? 0) >= INTERVIEW_PASSING_SCORE;
}

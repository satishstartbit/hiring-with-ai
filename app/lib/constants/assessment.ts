export const DIFFICULTY_LEVELS = ["easy", "medium", "hard", "adaptive"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const QUESTION_TYPES = [
  "mcq",
  "multi_select",
  "coding",
  "short_answer",
  "scenario",
  "debugging",
  "sql",
  "video",
  "voice",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const CODING_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp",
  "sql",
] as const;
export type CodingLanguage = (typeof CODING_LANGUAGES)[number];

export const QUESTION_COUNT_MODES = ["fixed", "dynamic"] as const;
export type QuestionCountMode = (typeof QUESTION_COUNT_MODES)[number];

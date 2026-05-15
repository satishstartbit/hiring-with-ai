/** Client-safe types/constants for the workspace candidates list (no Mongoose). */

export type WorkspaceCandidateStage =
  | "screening"
  | "quiz_in_progress"
  | "quiz_completed"
  | "interview_in_progress"
  | "completed"
  | "rejected";

/** Cleared the screening quiz and may continue to interview. */
export const QUIZ_PASSED_STAGES: WorkspaceCandidateStage[] = [
  "quiz_completed",
  "interview_in_progress",
  "completed",
];

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export const SORT_FIELDS = [
  "updatedAt",
  "appliedAt",
  "quizSubmittedAt",
  "name",
  "jobTitle",
  "resumeMatchScore",
  "answerScore",
  "stage",
  "interviewScore",
  "passed",
] as const;

export type SortField = (typeof SORT_FIELDS)[number];

export interface CandidateListRow {
  id: string;
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  jobTitle: string;
  stage: WorkspaceCandidateStage;
  /** True when the candidate cleared the screening quiz (or beyond). */
  passed: boolean;
  passLabel: string;
  resumeFilename?: string;
  resumeMatchScore?: number | null;
  answerScore?: number | null;
  interviewScore: number | null;
  proctoringFlagged?: boolean;
  appliedAt?: string | null;
  quizSubmittedAt?: string | null;
  updatedAt: string;
}

/** @deprecated Use CandidateListRow */
export type PassedCandidateRow = CandidateListRow;

export interface ListCandidatesResult {
  candidates: CandidateListRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sort: SortField;
  order: "asc" | "desc";
  search: string;
}

/** @deprecated Use ListCandidatesResult */
export type ListPassedCandidatesResult = ListCandidatesResult;

export function getPassInfo(stage: WorkspaceCandidateStage): {
  passed: boolean;
  passLabel: string;
} {
  if (stage === "rejected") {
    return { passed: false, passLabel: "Not passed" };
  }
  if (QUIZ_PASSED_STAGES.includes(stage)) {
    return { passed: true, passLabel: "Passed" };
  }
  return { passed: false, passLabel: "In progress" };
}

export function parseSortField(raw?: string): SortField {
  if (raw && (SORT_FIELDS as readonly string[]).includes(raw)) {
    return raw as SortField;
  }
  return "updatedAt";
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export function parseListParams(
  raw: Record<string, string | string[] | undefined>
): {
  page: number;
  limit: number;
  search: string;
  sort: SortField;
  order: "asc" | "desc";
} {
  const pageRaw = pickString(raw.page);
  const limitRaw = pickString(raw.limit);
  const page = Math.max(1, Number.parseInt(pageRaw ?? "", 10) || DEFAULT_PAGE);
  const parsedLimit = Number.parseInt(limitRaw ?? "", 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, parsedLimit));
  const search = pickString(raw.q)?.trim() ?? pickString(raw.search)?.trim() ?? "";
  const sort = parseSortField(pickString(raw.sort));
  const order = pickString(raw.order) === "asc" ? "asc" : "desc";
  return { page, limit, search, sort, order };
}

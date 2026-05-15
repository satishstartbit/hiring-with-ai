import "server-only";

import mongoose, { type FilterQuery } from "mongoose";
import Candidate, { type ICandidate } from "@/app/lib/db/models/Candidate";
import InterviewSession from "@/app/lib/db/models/InterviewSession";
import {
  QUIZ_PASSED_STAGES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getPassInfo,
  parseListParams,
  parseSortField,
  type ListCandidatesResult,
  type CandidateListRow,
  type WorkspaceCandidateStage,
} from "./passedCandidatesShared";

export {
  QUIZ_PASSED_STAGES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PAGE_SIZE_OPTIONS,
  SORT_FIELDS,
  getPassInfo,
  parseListParams,
  parseSortField,
  type SortField,
  type CandidateListRow,
  type PassedCandidateRow,
  type ListCandidatesResult,
  type ListPassedCandidatesResult,
  type WorkspaceCandidateStage,
} from "./passedCandidatesShared";

/** @deprecated Use QUIZ_PASSED_STAGES */
export { QUIZ_PASSED_STAGES as PASSED_STAGES } from "./passedCandidatesShared";

export interface ListWorkspaceCandidatesParams {
  jobIds: mongoose.Types.ObjectId[];
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

/** @deprecated Use ListWorkspaceCandidatesParams */
export type ListPassedCandidatesParams = ListWorkspaceCandidatesParams;

const CANDIDATE_SELECT =
  "_id name email currentTitle currentCompany jobTitle stage resumeFilename resumeMatchScore answerScore proctoringFlagged interviewSessionId appliedAt quizSubmittedAt updatedAt";

const PASSED_STAGE_VALUES = QUIZ_PASSED_STAGES;

function buildFilter(
  jobIds: mongoose.Types.ObjectId[],
  search: string
): FilterQuery<ICandidate> {
  const filter: FilterQuery<ICandidate> = {
    jobId: { $in: jobIds },
  };
  if (search) {
    const rx = { $regex: search, $options: "i" };
    filter.$or = [
      { name: rx },
      { email: rx },
      { jobTitle: rx },
      { currentTitle: rx },
      { currentCompany: rx },
    ];
  }
  return filter;
}

function mapRow(
  c: {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    currentTitle?: string;
    currentCompany?: string;
    jobTitle: string;
    stage: WorkspaceCandidateStage;
    resumeFilename?: string;
    resumeMatchScore?: number;
    answerScore?: number;
    proctoringFlagged?: boolean;
    appliedAt?: Date;
    quizSubmittedAt?: Date;
    updatedAt: Date;
  },
  interviewScore: number | null
): CandidateListRow {
  const stage = c.stage;
  const { passed, passLabel } = getPassInfo(stage);
  return {
    id: String(c._id),
    name: c.name,
    email: c.email,
    currentTitle: c.currentTitle,
    currentCompany: c.currentCompany,
    jobTitle: c.jobTitle,
    stage,
    passed,
    passLabel,
    resumeFilename: c.resumeFilename,
    resumeMatchScore: c.resumeMatchScore ?? null,
    answerScore: c.answerScore ?? null,
    interviewScore,
    proctoringFlagged: c.proctoringFlagged,
    appliedAt: c.appliedAt?.toISOString() ?? null,
    quizSubmittedAt: c.quizSubmittedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function attachInterviewScores(
  candidates: Array<{
    interviewSessionId?: mongoose.Types.ObjectId;
    [key: string]: unknown;
  }>
): Promise<Map<string, number | null>> {
  const sessionIds = candidates
    .map((c) => c.interviewSessionId)
    .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
  if (sessionIds.length === 0) return new Map();

  const interviews = await InterviewSession.find({ _id: { $in: sessionIds } })
    .select("_id totalScore")
    .lean();
  return new Map(interviews.map((i) => [String(i._id), i.totalScore ?? null]));
}

type AggRow = Parameters<typeof mapRow>[0] & {
  interviewScore?: number | null;
};

async function listWithAggregation(
  filter: FilterQuery<ICandidate>,
  sort: "interviewScore" | "passed",
  sortDir: 1 | -1,
  skip: number,
  limit: number
): Promise<{ rows: AggRow[]; total: number }> {
  const collection = InterviewSession.collection.name;
  const addFields: Record<string, unknown> = {};

  if (sort === "interviewScore") {
    addFields._sortKey = {
      $ifNull: [{ $arrayElemAt: ["$_interview.totalScore", 0] }, -1],
    };
  } else {
    addFields._sortKey = {
      $cond: [{ $in: ["$stage", PASSED_STAGE_VALUES] }, 1, 0],
    };
  }

  const sortKey = "_sortKey";

  const [facet] = await Candidate.aggregate<{
    meta: { total: number }[];
    data: AggRow[];
  }>([
    { $match: filter },
    {
      $facet: {
        meta: [{ $count: "total" }],
        data: [
          {
            $lookup: {
              from: collection,
              localField: "interviewSessionId",
              foreignField: "_id",
              as: "_interview",
            },
          },
          { $addFields: addFields },
          { $sort: { [sortKey]: sortDir, updatedAt: -1, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
              currentTitle: 1,
              currentCompany: 1,
              jobTitle: 1,
              stage: 1,
              resumeFilename: 1,
              resumeMatchScore: 1,
              answerScore: 1,
              proctoringFlagged: 1,
              interviewSessionId: 1,
              appliedAt: 1,
              quizSubmittedAt: 1,
              updatedAt: 1,
              interviewScore: {
                $ifNull: [{ $arrayElemAt: ["$_interview.totalScore", 0] }, null],
              },
            },
          },
        ],
      },
    },
  ]);

  return {
    rows: facet?.data ?? [],
    total: facet?.meta[0]?.total ?? 0,
  };
}

export async function listWorkspaceCandidates(
  params: ListWorkspaceCandidatesParams
): Promise<ListCandidatesResult> {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? DEFAULT_LIMIT));
  const search = params.search?.trim() ?? "";
  const sort = parseSortField(params.sort);
  const order = params.order === "asc" ? "asc" : "desc";

  const filter = buildFilter(params.jobIds, search);
  const skip = (page - 1) * limit;
  const sortDir = order === "asc" ? 1 : -1;

  if (sort === "interviewScore" || sort === "passed") {
    const { rows, total } = await listWithAggregation(filter, sort, sortDir, skip, limit);
    const candidates = rows.map((c) => mapRow(c, c.interviewScore ?? null));
    return {
      candidates,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      sort,
      order,
      search,
    };
  }

  const mongoSort: Record<string, 1 | -1> = { [sort]: sortDir };
  if (sort !== "updatedAt") mongoSort.updatedAt = -1;
  mongoSort._id = 1;

  const [found, total] = await Promise.all([
    Candidate.find(filter).select(CANDIDATE_SELECT).sort(mongoSort).skip(skip).limit(limit).lean(),
    Candidate.countDocuments(filter),
  ]);
  const scoreMap = await attachInterviewScores(found);
  const candidates = found.map((c) =>
    mapRow(
      c as Parameters<typeof mapRow>[0],
      c.interviewSessionId ? scoreMap.get(String(c.interviewSessionId)) ?? null : null
    )
  );

  return {
    candidates,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    sort,
    order,
    search,
  };
}

/** @deprecated Use listWorkspaceCandidates */
export const listPassedCandidates = listWorkspaceCandidates;

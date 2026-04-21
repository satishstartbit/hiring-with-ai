import mongoose from "mongoose";
import { connectDB } from "../db/connection";
import Candidate from "../db/models/Candidate";
import Job from "../db/models/Job";

export interface JobSummary {
  _id: string;
  title: string;
  department: string;
  description?: string;
  requirements: string[];
  location: string;
  type: string;
  status: string;
  applicantCount: number;
  createdAt: string;
  postedAt?: string;
}

export interface CandidateSummary {
  _id: string;
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  jobId: string;
  jobTitle: string;
  status: string;
  source: string;
  resumeFilename?: string;
  resumeContentType?: string;
  screeningQuestions?: string[];
  screeningAnswers?: string[];
  resumeMatchScore?: number;
  resumeMatchReason?: string;
  screeningTimeLimitSeconds?: number;
  appliedAt?: string;
  createdAt: string;
}

interface LeanJob {
  _id: mongoose.Types.ObjectId;
  title: string;
  department: string;
  description?: string;
  requirements?: string[];
  location?: string;
  type?: string;
  status?: string;
  applicantCount?: number;
  createdAt?: Date;
  postedAt?: Date;
}

interface LeanCandidate {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  jobId: mongoose.Types.ObjectId;
  jobTitle: string;
  status?: string;
  source?: string;
  resumeFilename?: string;
  resumeContentType?: string;
  screeningQuestions?: string[];
  screeningAnswers?: string[];
  resumeMatchScore?: number;
  resumeMatchReason?: string;
  screeningTimeLimitSeconds?: number;
  appliedAt?: Date;
  createdAt?: Date;
}

function dateToString(date?: Date): string {
  return date ? date.toISOString() : new Date(0).toISOString();
}

function optionalDateToString(date?: Date): string | undefined {
  return date ? date.toISOString() : undefined;
}

function serializeJob(job: LeanJob): JobSummary {
  return {
    _id: job._id.toString(),
    title: job.title,
    department: job.department,
    description: job.description,
    requirements: job.requirements ?? [],
    location: job.location ?? "Remote",
    type: job.type ?? "full-time",
    status: job.status ?? "draft",
    applicantCount: job.applicantCount ?? 0,
    createdAt: dateToString(job.createdAt),
    postedAt: optionalDateToString(job.postedAt),
  };
}

function serializeCandidate(candidate: LeanCandidate): CandidateSummary {
  return {
    _id: candidate._id.toString(),
    name: candidate.name,
    email: candidate.email,
    currentTitle: candidate.currentTitle,
    currentCompany: candidate.currentCompany,
    jobId: candidate.jobId.toString(),
    jobTitle: candidate.jobTitle,
    status: candidate.status ?? "applied",
    source: candidate.source ?? "website",
    resumeFilename: candidate.resumeFilename,
    resumeContentType: candidate.resumeContentType,
    screeningQuestions: candidate.screeningQuestions,
    screeningAnswers: candidate.screeningAnswers,
    resumeMatchScore: candidate.resumeMatchScore,
    resumeMatchReason: candidate.resumeMatchReason,
    screeningTimeLimitSeconds: candidate.screeningTimeLimitSeconds,
    appliedAt: optionalDateToString(candidate.appliedAt),
    createdAt: dateToString(candidate.createdAt),
  };
}

export async function getJobSummaries(limit = 100): Promise<JobSummary[]> {
  await connectDB();
  const jobs = (await Job.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()) as unknown as LeanJob[];

  return jobs.map(serializeJob);
}

export async function getJobById(id: string): Promise<JobSummary | null> {
  if (!mongoose.isValidObjectId(id)) return null;

  await connectDB();
  const job = (await Job.findById(id).lean()) as unknown as LeanJob | null;
  return job ? serializeJob(job) : null;
}

export async function getCandidates(jobId?: string): Promise<CandidateSummary[]> {
  await connectDB();
  const query =
    jobId && mongoose.isValidObjectId(jobId)
      ? { jobId: new mongoose.Types.ObjectId(jobId) }
      : {};
  const candidates = (await Candidate.find(query)
    .select("-resumeData")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()) as unknown as LeanCandidate[];

  return candidates.map(serializeCandidate);
}

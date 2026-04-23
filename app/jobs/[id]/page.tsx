"use client";

import { useState, useEffect, useCallback, use } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import ApplicantsTable from "../../components/ApplicantsTable";
import ApplyJobButton from "../../components/ApplyJobButton";

interface Job {
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

interface Candidate {
  _id: string;
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  jobTitle: string;
  status: string;
  resumeFilename?: string;
  resumeMatchScore?: number;
  answerScore?: number;
  screeningAnswers?: string[];
  appliedAt?: string;
  createdAt: string;
}

interface CandidatesResponse {
  candidates: Candidate[];
  total: number;
  page: number;
  totalPages: number;
}

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  draft: { badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  open: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  closed: { badge: "bg-red-100 text-red-700", dot: "bg-red-400" },
  paused: { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
};

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [candidatesData, setCandidatesData] = useState<CandidatesResponse>({
    candidates: [],
    total: 0,
    page: 1,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const handlePageChange = useCallback((newPage: number) => {
    setCandidatesData(prev => ({ ...prev, page: newPage }));
  }, []);

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
    setCandidatesData(prev => ({ ...prev, page: 1 })); // Reset to first page on search
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        if (!jobResponse.ok) {
          if (jobResponse.status === 404) {
            notFound();
            return;
          }
          throw new Error("Failed to fetch job");
        }
        const jobData = await jobResponse.json();
        setJob(jobData.job);

        // Fetch candidates data
        const candidatesFetchResponse = await fetch(
          `/api/candidates?jobId=${id}&page=${candidatesData.page}&limit=10${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`
        );
        if (!candidatesFetchResponse.ok) {
          throw new Error("Failed to fetch candidates");
        }
        const candidatesResult = await candidatesFetchResponse.json();
        setCandidatesData(candidatesResult);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, candidatesData.page, searchTerm]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600 mx-auto"></div>
          <p className="mt-2 text-sm text-slate-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    notFound();
  }

  const statusStyle = STATUS_STYLES[job.status] ?? STATUS_STYLES.draft;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      {/* Header */}
      <div className="mb-8">
        <nav className="mb-4 flex items-center gap-2 text-sm">
          <Link
            href="/jobs"
            className="flex items-center gap-1.5 font-semibold text-slate-500 transition-colors hover:text-slate-800"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
              <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" />
            </svg>
            Job Positions
          </Link>
          <span className="text-slate-300">/</span>
          <span className="truncate font-semibold text-slate-800">{job.title}</span>
        </nav>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-950">{job.title}</h1>
              <p className="mt-1 text-sm text-slate-600">
                {job.department} • {job.location} • {job.type}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyle.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                {job.status}
              </span>
              {job.status === "active" && (
                <ApplyJobButton jobId={job._id} jobTitle={job.title} />
              )}
            </div>
          </div>
        </div>
      </div>

      {(job.description || job.requirements?.length > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="space-y-6">
            {job.description && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <h2 className="text-base font-bold text-slate-950">Job description</h2>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-700">
                  {job.description}
                </p>
              </div>
            )}

            {job.requirements?.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <h2 className="text-base font-bold text-slate-950">Requirements</h2>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {job.requirements.map((req) => (
                    <li
                      key={req}
                      className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700"
                    >
                      <span className="mt-0.5 h-4 w-4 shrink-0 text-blue-500">•</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Role overview
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex justify-between text-slate-500">
                  <span>Department</span>
                  <span className="font-semibold text-slate-900">{job.department}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Location</span>
                  <span className="font-semibold text-slate-900">{job.location}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Type</span>
                  <span className="font-semibold text-slate-900">{job.type}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Status</span>
                  <span className="font-semibold text-slate-900 capitalize">{job.status}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Applicants Table */}
      <ApplicantsTable
        candidates={candidatesData.candidates}
        total={candidatesData.total}
        page={candidatesData.page}
        totalPages={candidatesData.totalPages}
        onPageChange={handlePageChange}
        onSearchChange={handleSearchChange}
        searchTerm={searchTerm}
      />
    </main>
  );
}

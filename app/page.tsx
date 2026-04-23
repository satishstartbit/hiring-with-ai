"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import WorkflowStatus from "./components/WorkflowStatus";

interface WorkflowStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  error?: string;
}

interface WorkflowResult {
  success: boolean;
  workflowRunId: string;
  steps: WorkflowStep[];
  jobId?: string;
  error?: string;
}

interface Job {
  _id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  status: string;
  applicantCount: number;
  createdAt: string;
}

interface Candidate {
  _id: string;
  name: string;
  email: string;
  currentTitle?: string;
  currentCompany?: string;
  jobTitle: string;
  resumeFilename?: string;
  appliedAt?: string;
  createdAt: string;
}

interface Analytics {
  jobs: { total: number; active: number; filled: number };
  candidates: {
    total: number;
    interviewing: number;
    hired: number;
    interviewRate: number;
  };
  workflows: { total: number; completed: number };
}

const EXAMPLE_REQUESTS = [
  "I need a Senior Backend Engineer with Go and Kubernetes experience",
  "Hire a Product Designer for our mobile team",
  "Looking for a DevOps Engineer, remote, full-time",
  "We need a Data Scientist with Python and ML background",
];

export default function Dashboard() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void fetchJobs();
    void fetchAnalytics();
    void fetchCandidates();
  }, []);

  async function fetchJobs() {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      // Dashboard data is best-effort on first load.
    }
  }

  async function fetchCandidates() {
    try {
      const res = await fetch("/api/candidates");
      if (!res.ok) return;
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch {
      // Dashboard data is best-effort on first load.
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) return;
      const data = await res.json();
      setAnalytics(data);
    } catch {
      // Dashboard data is best-effort on first load.
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setResult({
      success: false,
      workflowRunId: "",
      steps: [
        { name: "Analyze Request", status: "running" },
        { name: "Generate Job Description", status: "pending" },
        { name: "Post Job", status: "pending" },
        { name: "Open for Applications", status: "pending" },
      ],
    });

    try {
      const res = await fetch("/api/hiring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRequest: input }),
      });

      const data: WorkflowResult = await res.json();
      setResult(data);

      if (data.success) {
        setInput("");
        await Promise.all([fetchJobs(), fetchAnalytics(), fetchCandidates()]);
      }
    } catch {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              error: "Network error - please try again",
              steps: prev.steps.map((step) =>
                step.status === "running"
                  ? { ...step, status: "failed" as const, error: "Network error" }
                  : step
              ),
            }
          : null
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleExample(example: string) {
    setInput(example);
    inputRef.current?.focus();
  }

  const resumeCount = candidates.filter((candidate) => candidate.resumeFilename).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-700">Dashboard</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              Hiring command center
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Create job positions, monitor applicants, and review submitted resumes.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
         
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Job Positions" value={jobs.length} accent="blue" />
        <SummaryCard
          label="Active Positions"
          value={analytics?.jobs.active ?? 0}
          accent="blue"
        />
        <SummaryCard label="Applications" value={candidates.length} accent="red" />
        <SummaryCard label="Resumes Uploaded" value={resumeCount} accent="red" />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <h2 className="text-lg font-bold text-slate-950">Create a job position</h2>
            </div>
            <p className="text-sm text-slate-600">
              Describe the role and the workflow will analyze, write, and publish it.
            </p>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {EXAMPLE_REQUESTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExample(example)}
                className="group rounded-md border border-slate-200 bg-white p-3 text-left text-sm font-medium text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 hover:shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 text-slate-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{example}</span>
                </div>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Example: I need a Senior Backend Engineer who knows Go and AWS..."
              rows={4}
              className="w-full resize-none rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45 hover:shadow-md"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Running workflow...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Start Hiring Workflow
                </>
              )}
            </button>
          </form>

          {result && (
            <div className="mt-5 space-y-4">
              <WorkflowStatus steps={result.steps ?? []} isRunning={isLoading} />

              {result.success && (
                <div className="rounded-md border border-green-200 bg-green-50 p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-bold text-green-800">
                        Job posted successfully.
                      </p>
                      <p className="mt-1 text-sm text-green-700">
                        The listing is live on the Job Positions page.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {result.error && !isLoading && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-red-700">
                        Error: {result.error}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {analytics && <AnalyticsDashboard analytics={analytics} />}

          <DashboardPanel
            title="Recent job positions"
            actionHref="/jobs"
            actionLabel="All jobs"
          >
            {jobs.slice(0, 5).length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No positions have been created.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {jobs.slice(0, 5).map((job) => (
                  <Link
                    key={job._id}
                    href={`/jobs/${job._id}`}
                    className="block py-3 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">
                          {job.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {job.department} / {job.location}
                        </p>
                      </div>
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                        {job.applicantCount} applicants
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </DashboardPanel>

          <DashboardPanel
            title="Recent applications"
            actionHref="/jobs"
            actionLabel="All jobs"
          >
            {candidates.slice(0, 5).length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No applications yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {candidates.slice(0, 5).map((candidate) => (
                  <div key={candidate._id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">
                          {candidate.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {candidate.email} / {candidate.jobTitle}
                        </p>
                      </div>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-bold ${
                          candidate.resumeFilename
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {candidate.resumeFilename ? "Resume" : "No file"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardPanel>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "blue" | "red";
}) {
  const gradientClass = accent === "blue" 
    ? "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200" 
    : "bg-gradient-to-br from-red-50 to-red-100 border-red-200";
  
  const textClass = accent === "blue" ? "text-blue-700" : "text-red-700";
  
  const icon = accent === "blue" ? (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div className={`rounded-lg border ${gradientClass} p-4 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-bold ${textClass}`}>
            {value}
          </p>
        </div>
        <div className={textClass}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function DashboardPanel({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 transition-colors"
        >
          {actionLabel}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
      {children}
    </section>
  );
}

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
        <div>
          <p className="text-sm font-semibold text-blue-700">Dashboard</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Hiring command center
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Create job positions, monitor applicants, and review submitted resumes.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/jobs"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View Jobs
          </Link>
          <Link
            href="/resumes"
            className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            View Resumes
          </Link>
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
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-950">Create a job position</h2>
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
                className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
              >
                {example}
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
              className="w-full rounded-md bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoading ? "Running workflow..." : "Start Hiring Workflow"}
            </button>
          </form>

          {result && (
            <div className="mt-5 space-y-4">
              <WorkflowStatus steps={result.steps ?? []} isRunning={isLoading} />

              {result.success && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-bold text-blue-800">
                    Job posted successfully.
                  </p>
                  <p className="mt-1 text-sm text-blue-700">
                    The listing is live on the Job Positions page.
                  </p>
                </div>
              )}

              {result.error && !isLoading && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">
                    Error: {result.error}
                  </p>
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
            title="Latest resumes"
            actionHref="/resumes"
            actionLabel="All resumes"
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
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-bold ${
          accent === "blue" ? "text-blue-700" : "text-red-700"
        }`}
      >
        {value}
      </p>
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
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        <Link
          href={actionHref}
          className="rounded-md px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50"
        >
          {actionLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

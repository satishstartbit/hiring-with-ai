"use client";

import { useState, useRef, useEffect } from "react";
import WorkflowStatus from "./components/WorkflowStatus";
import JobCard from "./components/JobCard";
import AnalyticsDashboard from "./components/AnalyticsDashboard";

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

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "jobs" | "analytics">("chat");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchJobs();
    fetchAnalytics();
  }, []);

  async function fetchJobs() {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      // silently fail on initial load
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) return;
      const data = await res.json();
      setAnalytics(data);
    } catch {
      // silently fail on initial load
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);

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
        fetchJobs();
        fetchAnalytics();
        setActiveTab("jobs");
      }
    } catch {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              error: "Network error — please try again",
              steps: prev.steps.map((s) =>
                s.status === "running"
                  ? { ...s, status: "failed" as const, error: "Network error" }
                  : s
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

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">HireAI</h1>
            <p className="text-xs text-gray-500">AI-Powered Hiring Automation</p>
          </div>
          <nav className="flex gap-1">
            {(["chat", "jobs", "analytics"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  activeTab === tab
                    ? "bg-white text-gray-900"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Chat Tab */}
        {activeTab === "chat" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">What role do you need to fill?</h2>
              <p className="text-gray-400 text-sm">
                Describe the position and the AI will generate a job description and
                publish it — candidates apply directly on this site.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {EXAMPLE_REQUESTS.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleExample(ex)}
                  className="text-left p-3 rounded-lg border border-gray-700 hover:border-gray-500 text-sm text-gray-300 hover:text-white transition-colors bg-gray-900/50 hover:bg-gray-800"
                >
                  {ex}
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
                placeholder="e.g. I need a Senior Backend Engineer who knows Go and AWS..."
                rows={3}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none text-sm"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="w-full py-3 px-6 bg-white text-gray-900 font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors text-sm"
              >
                {isLoading ? "Running Workflow…" : "Start Hiring Workflow →"}
              </button>
            </form>

            {result && (
              <div className="space-y-4">
                <WorkflowStatus steps={result.steps ?? []} isRunning={isLoading} />

                {result.success && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-1">
                    <p className="text-green-400 font-semibold text-sm">
                      ✓ Job posted successfully
                    </p>
                    <p className="text-sm text-gray-400">
                      The listing is live — candidates can apply from the Jobs tab.
                    </p>
                  </div>
                )}

                {result.error && !isLoading && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <p className="text-red-400 text-sm">✕ Error: {result.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Jobs Tab */}
        {activeTab === "jobs" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Job Postings</h2>
              <span className="text-sm text-gray-500">{jobs.length} jobs</span>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p className="text-4xl mb-3">📋</p>
                <p>No job postings yet.</p>
                <button
                  onClick={() => setActiveTab("chat")}
                  className="mt-3 text-sm text-blue-400 hover:underline"
                >
                  Start a hiring workflow →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobs.map((job) => (
                  <JobCard key={job._id} job={job} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div className="max-w-2xl space-y-6">
            <h2 className="text-xl font-bold">Analytics & Insights</h2>
            {analytics ? (
              <AnalyticsDashboard analytics={analytics} />
            ) : (
              <p className="text-gray-500">Loading analytics…</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

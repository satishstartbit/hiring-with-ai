"use client";

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

const StatCard = ({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) => (
  <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-2xl font-bold ${color || "text-white"}`}>{value}</p>
    {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
  </div>
);

export default function AnalyticsDashboard({ analytics }: { analytics: Analytics }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Analytics
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Active Jobs"
          value={analytics.jobs.active}
          sub={`${analytics.jobs.total} total`}
          color="text-green-400"
        />
        <StatCard
          label="Applicants"
          value={analytics.candidates.total}
          sub={`${analytics.candidates.interviewing} in interview`}
          color="text-blue-400"
        />
        <StatCard
          label="Interview Rate"
          value={`${analytics.candidates.interviewRate}%`}
          sub="applied → interviewing"
          color="text-purple-400"
        />
        <StatCard
          label="Hired"
          value={analytics.candidates.hired}
          sub={`${analytics.workflows.completed} workflows done`}
          color="text-yellow-400"
        />
      </div>
    </div>
  );
}

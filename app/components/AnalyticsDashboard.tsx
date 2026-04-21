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
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className={`text-2xl font-bold ${color || "text-slate-950"}`}>{value}</p>
    {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
  </div>
);

export default function AnalyticsDashboard({ analytics }: { analytics: Analytics }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
        Analytics snapshot
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Active Jobs"
          value={analytics.jobs.active}
          sub={`${analytics.jobs.total} total`}
          color="text-blue-700"
        />
        <StatCard
          label="Applicants"
          value={analytics.candidates.total}
          sub={`${analytics.candidates.interviewing} in interview`}
          color="text-red-700"
        />
        <StatCard
          label="Interview Rate"
          value={`${analytics.candidates.interviewRate}%`}
          sub="applied to interviewing"
          color="text-blue-700"
        />
        <StatCard
          label="Hired"
          value={analytics.candidates.hired}
          sub={`${analytics.workflows.completed} workflows done`}
          color="text-red-700"
        />
      </div>
    </div>
  );
}

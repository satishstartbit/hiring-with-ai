"use client";

interface WorkflowStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  error?: string;
}

interface WorkflowStatusProps {
  steps: WorkflowStep[];
  isRunning: boolean;
}

const STATUS_ICON: Record<WorkflowStep["status"], string> = {
  pending: "o",
  running: "*",
  completed: "done",
  failed: "x",
};

const STATUS_COLOR: Record<WorkflowStep["status"], string> = {
  pending: "text-slate-400",
  running: "text-blue-600",
  completed: "text-blue-700",
  failed: "text-red-600",
};

export default function WorkflowStatus({ steps, isRunning }: WorkflowStatusProps) {
  if (steps.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Workflow Progress
        </h3>
        {isRunning && (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
            Running
          </span>
        )}
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={`${step.name}-${index}`} className="flex items-start gap-3">
            <span
              className={`mt-0.5 text-base leading-none ${STATUS_COLOR[step.status]} ${
                step.status === "running" ? "animate-spin" : ""
              }`}
              style={step.status === "running" ? { animationDuration: "1.5s" } : {}}
            >
              {STATUS_ICON[step.status]}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-semibold ${
                  step.status === "completed"
                    ? "text-slate-950"
                    : step.status === "running"
                    ? "text-blue-700"
                    : step.status === "failed"
                    ? "text-red-700"
                    : "text-slate-500"
                }`}
              >
                {step.name}
              </p>
              {step.output && (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {step.output}
                </p>
              )}
              {step.error && (
                <p className="mt-0.5 text-xs text-red-700">{step.error}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

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
  pending: "○",
  running: "◌",
  completed: "●",
  failed: "✕",
};

const STATUS_COLOR: Record<WorkflowStep["status"], string> = {
  pending: "text-gray-400",
  running: "text-blue-500",
  completed: "text-green-500",
  failed: "text-red-500",
};

export default function WorkflowStatus({ steps, isRunning }: WorkflowStatusProps) {
  if (steps.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Workflow Progress
        </h3>
        {isRunning && (
          <span className="inline-flex items-center gap-1 text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            Running
          </span>
        )}
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-0.5 text-base leading-none ${STATUS_COLOR[step.status]} ${
                step.status === "running" ? "animate-spin" : ""
              }`}
              style={step.status === "running" ? { animationDuration: "1.5s" } : {}}
            >
              {STATUS_ICON[step.status]}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${
                  step.status === "completed"
                    ? "text-white"
                    : step.status === "running"
                    ? "text-blue-300"
                    : step.status === "failed"
                    ? "text-red-400"
                    : "text-gray-500"
                }`}
              >
                {step.name}
              </p>
              {step.output && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{step.output}</p>
              )}
              {step.error && (
                <p className="text-xs text-red-400 mt-0.5">{step.error}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

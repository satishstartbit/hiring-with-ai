import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/app/lib/auth/dal";
import { PERMISSIONS } from "@/app/lib/auth/permissions";
import { connectDB } from "@/app/lib/db/connection";
import Job from "@/app/lib/db/models/Job";
import AssessmentConfig from "@/app/lib/db/models/AssessmentConfig";
import AssessmentConfigForm, { type InitialConfig } from "./AssessmentConfigForm";

export const metadata = { title: "Assessment configuration — HireAI" };

const DEFAULT_CONFIG: InitialConfig = {
  difficulty: "medium",
  enabledQuestionTypes: ["mcq", "short_answer", "scenario"],
  durationMinutes: 30,
  questionCountMode: "fixed",
  questionCount: 10,
  skills: [],
  passingCriteria: {
    overallPercent: 60,
    sectionMinimums: [],
    mandatoryTypes: [],
  },
  antiCheat: {
    tabSwitchDetection: true,
    fullscreenRequired: false,
    blockCopyPaste: true,
    webcamMonitoring: false,
    trackSuspiciousActivity: true,
    maxViolations: 3,
  },
  coding: {
    languages: ["javascript", "python"],
    timeoutSeconds: 10,
    enableQualityAnalysis: true,
  },
  interview: {
    durationMinutes: 15,
    questionCount: 8,
    topics: ["introduction", "technical", "scenario", "behavioral"],
    difficulty: "medium",
    passingScore: 20,
    allowFollowups: true,
    adaptiveDifficulty: true,
  },
  isPublished: false,
};

export default async function AssessmentConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.JOB_MANAGE);
  const { id } = await params;
  await connectDB();

  const job = await Job.findOne({ _id: id, workspaceId: session.workspaceId })
    .select("_id title department skills")
    .lean();
  if (!job) notFound();

  const existing = await AssessmentConfig.findOne({ jobId: id }).lean();

  const initial: InitialConfig = existing
    ? {
        difficulty: existing.difficulty,
        enabledQuestionTypes: existing.enabledQuestionTypes,
        durationMinutes: existing.durationMinutes,
        questionCountMode: existing.questionCountMode,
        questionCount: existing.questionCount,
        skills: existing.skills,
        passingCriteria: {
          overallPercent: existing.passingCriteria?.overallPercent ?? 60,
          sectionMinimums: existing.passingCriteria?.sectionMinimums ?? [],
          mandatoryTypes: existing.passingCriteria?.mandatoryTypes ?? [],
        },
        antiCheat: {
          tabSwitchDetection: existing.antiCheat?.tabSwitchDetection ?? true,
          fullscreenRequired: existing.antiCheat?.fullscreenRequired ?? false,
          blockCopyPaste: existing.antiCheat?.blockCopyPaste ?? true,
          webcamMonitoring: existing.antiCheat?.webcamMonitoring ?? false,
          trackSuspiciousActivity: existing.antiCheat?.trackSuspiciousActivity ?? true,
          maxViolations: existing.antiCheat?.maxViolations ?? 3,
        },
        coding: {
          languages: existing.coding?.languages ?? ["javascript", "python"],
          timeoutSeconds: existing.coding?.timeoutSeconds ?? 10,
          enableQualityAnalysis: existing.coding?.enableQualityAnalysis ?? true,
        },
        interview: {
          durationMinutes: existing.interview?.durationMinutes ?? 15,
          questionCount: existing.interview?.questionCount ?? 8,
          topics:
            existing.interview?.topics ??
            ["introduction", "technical", "scenario", "behavioral"],
          difficulty: existing.interview?.difficulty ?? "medium",
          passingScore: existing.interview?.passingScore ?? 20,
          allowFollowups: existing.interview?.allowFollowups ?? true,
          adaptiveDifficulty: existing.interview?.adaptiveDifficulty ?? true,
        },
        isPublished: existing.isPublished,
      }
    : { ...DEFAULT_CONFIG, skills: job.skills ?? [] };

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href="/dashboard/jobs" className="hover:text-indigo-600">
          Jobs
        </Link>{" "}
        /{" "}
        <Link href={`/dashboard/jobs/${id}`} className="hover:text-indigo-600">
          {job.title}
        </Link>{" "}
        / <span className="text-slate-700">Assessment</span>
      </nav>

      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Assessment</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configure the AI assessment
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Set difficulty, question mix, anti-cheat, and passing criteria. The AI engine
            will generate questions from your selected skills when candidates start the
            assessment.
          </p>
        </div>
        {existing?.isPublished && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            Live
          </span>
        )}
      </header>

      <AssessmentConfigForm
        jobId={id}
        jobTitle={job.title}
        jobSkills={job.skills ?? []}
        initial={initial}
      />
    </div>
  );
}

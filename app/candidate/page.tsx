import Link from "next/link";
import { requireCandidate } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Candidate, { type CandidateStage } from "@/app/lib/db/models/Candidate";
import InterviewSession from "@/app/lib/db/models/InterviewSession";

export const dynamic = "force-dynamic";

const STAGE_META: Record<
  CandidateStage,
  { label: string; tone: string; cta: string | null; href: (id: string) => string }
> = {
  screening: {
    label: "Resume submitted",
    tone: "bg-slate-100 text-slate-700",
    cta: "Continue",
    href: (id) => `/candidate/applications/${id}`,
  },
  quiz_in_progress: {
    label: "Quiz pending",
    tone: "bg-amber-100 text-amber-700",
    cta: "Take quiz",
    href: (id) => `/candidate/applications/${id}/quiz`,
  },
  quiz_completed: {
    label: "Interview pending",
    tone: "bg-indigo-100 text-indigo-700",
    cta: "Start interview",
    href: (id) => `/candidate/applications/${id}/interview`,
  },
  interview_in_progress: {
    label: "Interview in progress",
    tone: "bg-indigo-100 text-indigo-700",
    cta: "Resume interview",
    href: (id) => `/candidate/applications/${id}/interview`,
  },
  completed: {
    label: "Completed",
    tone: "bg-emerald-100 text-emerald-700",
    cta: null,
    href: (id) => `/candidate/applications/${id}`,
  },
  rejected: {
    label: "Not a match",
    tone: "bg-rose-100 text-rose-700",
    cta: null,
    href: (id) => `/candidate/applications/${id}`,
  },
};

export default async function CandidateHomePage() {
  const session = await requireCandidate();
  await connectDB();
  const apps = await Candidate.find({ userId: session.userId })
    .select(
      "_id jobId jobTitle stage createdAt updatedAt resumeMatchScore answerScore interviewSessionId"
    )
    .sort({ updatedAt: -1 })
    .lean();

  // Pull interview scores in one query so each row can show the AI interview number.
  const sessionIds = apps
    .map((a) => a.interviewSessionId)
    .filter((id): id is NonNullable<typeof id> => Boolean(id));
  const sessions = sessionIds.length
    ? await InterviewSession.find({ _id: { $in: sessionIds } })
        .select("_id totalScore status")
        .lean()
    : [];
  const interviewById = new Map(sessions.map((s) => [String(s._id), s]));

  // Calculate application stats
  const stats = {
    total: apps.length,
    inProgress: apps.filter((a) => 
      a.stage !== "completed" && a.stage !== "rejected"
    ).length,
    completed: apps.filter((a) => a.stage === "completed").length,
    rejected: apps.filter((a) => a.stage === "rejected").length,
  };

  return (
    <div className="space-y-6">
      {/* User Status Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-600">
              You&apos;re signed in as <span className="font-medium text-slate-900">{session.email}</span>
            </p>
          </div>
          <div className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            ✓ Logged in
          </div>
        </div>
      </div>

      {/* Application Stats Section */}
      {apps.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your application progress
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <StatCard label="Total applications" value={stats.total} tone="slate" />
            <StatCard label="In progress" value={stats.inProgress} tone="indigo" />
            <StatCard label="Completed" value={stats.completed} tone="emerald" />
            <StatCard label="Not a match" value={stats.rejected} tone="rose" />
          </div>
        </div>
      )}

      {/* Header for Applied Jobs Section */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Your applied jobs</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pick up where you left off — the quiz and AI interview don&apos;t have to be done in one sitting.
        </p>
      </div>

      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-base font-medium text-slate-900">No applications yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Browse open roles and apply when you find one you like.
          </p>
          <Link
            href="/jobs"
            className="mt-5 inline-flex rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Browse jobs
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((app) => {
            const id = String(app._id);
            const meta = STAGE_META[app.stage as CandidateStage] ?? STAGE_META.screening;
            const interview = app.interviewSessionId
              ? interviewById.get(String(app.interviewSessionId))
              : undefined;
            return (
              <li
                key={id}
                className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.tone}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      Applied {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Link
                    href={`/candidate/applications/${id}`}
                    className="mt-1 block truncate text-base font-semibold text-slate-900 hover:text-indigo-600"
                  >
                    {app.jobTitle}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ScorePill label="Resume" score={app.resumeMatchScore} />
                    <ScorePill label="Quiz" score={app.answerScore} />
                    <ScorePill label="Interview" score={interview?.totalScore} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/candidate/applications/${id}`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Details
                  </Link>
                  {meta.cta && (
                    <Link
                      href={meta.href(id)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      {meta.cta}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScorePill({
  label,
  score,
}: Readonly<{ label: string; score: number | null | undefined }>) {
  if (score == null) {
    return (
      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        {label}: —
      </span>
    );
  }
  let tone: string;
  if (score >= 75) {
    tone = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (score >= 50) {
    tone = "bg-amber-50 text-amber-700 border-amber-200";
  } else {
    tone = "bg-rose-50 text-rose-700 border-rose-200";
  }
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {label}: <span className="font-bold">{score}/100</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  tone,
}: Readonly<{
  label: string;
  value: number;
  tone: "slate" | "indigo" | "emerald" | "rose";
}>) {
  const toneClasses: Record<string, string> = {
    slate: "text-slate-900",
    indigo: "text-indigo-700",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}

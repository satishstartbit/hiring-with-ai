import Link from "next/link";
import { getCurrentCandidate } from "@/app/lib/auth/dal";
import { connectDB } from "@/app/lib/db/connection";
import Candidate, { type CandidateStage } from "@/app/lib/db/models/Candidate";
import InterviewSession from "@/app/lib/db/models/InterviewSession";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profile — HireAI" };

interface Stats {
  total: number;
  inProgress: number;
  completed: number;
  rejected: number;
  bestResumeScore: number | null;
  bestQuizScore: number | null;
  bestInterviewScore: number | null;
}

function countApplicationsByStage(
  apps: { stage: CandidateStage }[]
): { inProgress: number; completed: number; rejected: number } {
  let inProgress = 0;
  let completed = 0;
  let rejected = 0;
  for (const a of apps) {
    if (a.stage === "rejected") rejected++;
    else if (a.stage === "completed") completed++;
    else inProgress++;
  }
  return { inProgress, completed, rejected };
}

function findBestScore(scores: (number | undefined)[]): number | null {
  let best: number | null = null;
  for (const s of scores) {
    if (typeof s === "number") {
      best = best == null ? s : Math.max(best, s);
    }
  }
  return best;
}

function summarize(
  apps: { stage: CandidateStage; resumeMatchScore?: number; answerScore?: number }[],
  interviewScores: (number | undefined)[]
): Stats {
  const stageCounts = countApplicationsByStage(apps);
  const resumeScores = apps.map((a) => a.resumeMatchScore).filter((s) => s != null);
  const quizScores = apps.map((a) => a.answerScore).filter((s) => s != null);
  
  return {
    total: apps.length,
    ...stageCounts,
    bestResumeScore: findBestScore(resumeScores),
    bestQuizScore: findBestScore(quizScores),
    bestInterviewScore: findBestScore(interviewScores),
  };
}

export default async function CandidateProfilePage() {
  const user = await getCurrentCandidate();
  await connectDB();

  const apps = await Candidate.find({ userId: user.id })
    .select("_id stage resumeMatchScore answerScore interviewSessionId")
    .lean();

  const sessionIds = apps
    .map((a) => a.interviewSessionId)
    .filter((id): id is NonNullable<typeof id> => Boolean(id));
  const sessions = sessionIds.length
    ? await InterviewSession.find({ _id: { $in: sessionIds } })
        .select("_id totalScore")
        .lean()
    : [];
  const interviewScores = sessions.map((s) => s.totalScore ?? undefined);

  const stats = summarize(
    apps.map((a) => ({
      stage: a.stage as CandidateStage,
      resumeMatchScore: a.resumeMatchScore,
      answerScore: a.answerScore,
    })),
    interviewScores
  );

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your account details and a summary of how your applications are doing.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-lg font-medium text-white">
            {(user.name.split(/\s+/)
              .filter(Boolean)
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()) || "U"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-slate-900">{user.name}</p>
            <p className="text-sm text-slate-600">{user.email}</p>
            <p className="mt-1 text-xs text-slate-500">
              Candidate · Member since {memberSince}
              {user.emailVerified ? (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Email verified
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Email not verified
                </span>
              )}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Application activity
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <StatCard label="Applications" value={stats.total} tone="slate" />
          <StatCard label="In progress" value={stats.inProgress} tone="indigo" />
          <StatCard label="Completed" value={stats.completed} tone="emerald" />
          <StatCard label="Not a match" value={stats.rejected} tone="rose" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your best scores
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ScoreCard label="Resume fit" score={stats.bestResumeScore} />
          <ScoreCard label="Screening quiz" score={stats.bestQuizScore} />
          <ScoreCard label="AI interview" score={stats.bestInterviewScore} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Scores are out of 100. They show your highest result across all applications — they aren’t
          visible to the hiring team out of context.
        </p>
      </section>

      {apps.length === 0 && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-base font-medium text-slate-900">No applications yet</p>
          <p className="mt-1 text-sm text-slate-600">Browse open roles to get started.</p>
          <Link
            href="/jobs"
            className="mt-4 inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Browse jobs
          </Link>
        </section>
      )}
    </div>
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

function ScoreCard({ label, score }: Readonly<{ label: string; score: number | null }>) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {score == null ? (
        <p className="mt-1 text-sm text-slate-500">No score yet</p>
      ) : (
        <p className="mt-1 text-3xl font-bold text-slate-900">
          {score}
          <span className="text-base text-slate-400">/100</span>
        </p>
      )}
    </div>
  );
}

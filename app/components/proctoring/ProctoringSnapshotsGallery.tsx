import ProctoringSnapshotImage from "./ProctoringSnapshotImage";

export interface SnapshotMeta {
  index: number;
  round?: "quiz" | "interview";
  capturedAt?: Date | string;
  matchVerdict?: string;
  matchScore?: number;
  mismatch?: boolean;
}

function formatCapturedAt(value?: Date | string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function verdictBadge(verdict?: string, mismatch?: boolean): string {
  if (mismatch || verdict === "mismatch" || verdict === "no_face" || verdict === "multi_face") {
    return "bg-rose-100 text-rose-700";
  }
  if (verdict === "suspicious") return "bg-amber-100 text-amber-700";
  if (verdict === "strong" || verdict === "match") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function SnapshotGrid({
  candidateId,
  items,
  emptyLabel,
}: Readonly<{
  candidateId: string;
  items: SnapshotMeta[];
  emptyLabel: string;
}>) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((snap) => (
        <figure
          key={snap.index}
          className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
        >
          <ProctoringSnapshotImage
            candidateId={candidateId}
            index={snap.index}
            alt={`Proctoring snapshot ${snap.index + 1}`}
          />
          <figcaption className="space-y-1 px-2 py-2 text-xs text-slate-600">
            <p className="font-medium text-slate-800">{formatCapturedAt(snap.capturedAt)}</p>
            <div className="flex flex-wrap items-center gap-1">
              {snap.matchVerdict && (
                <span
                  className={`rounded px-1.5 py-0.5 font-semibold ${verdictBadge(
                    snap.matchVerdict,
                    snap.mismatch
                  )}`}
                >
                  {snap.matchVerdict.replace(/_/g, " ")}
                </span>
              )}
              {typeof snap.matchScore === "number" && (
                <span className="text-slate-500">{snap.matchScore}% match</span>
              )}
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function ProctoringSnapshotsGallery({
  candidateId,
  snapshots,
}: Readonly<{
  candidateId: string;
  snapshots: SnapshotMeta[];
}>) {
  const quiz = snapshots.filter((s) => s.round === "quiz" || !s.round);
  const interview = snapshots.filter((s) => s.round === "interview");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Quiz round</h3>
        <SnapshotGrid
          candidateId={candidateId}
          items={quiz}
          emptyLabel="No quiz snapshots captured."
        />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">AI interview round</h3>
        <SnapshotGrid
          candidateId={candidateId}
          items={interview}
          emptyLabel="No interview snapshots captured."
        />
      </div>
    </div>
  );
}

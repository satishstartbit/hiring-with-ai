import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { readSession } from "../../../../../../lib/auth/session";
import { connectDB } from "../../../../../../lib/db/connection";
import Candidate, {
  type IdentityMatchVerdict,
  type ProctoringRound,
} from "../../../../../../lib/db/models/Candidate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Periodic webcam snapshot uploaded by the candidate's client during the quiz
// or AI interview. Each upload may optionally carry the face-match metadata
// produced by the periodic identity recheck — the server only stores; the
// match decision is made client-side via face-api.js.

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB — client compresses to ~30KB
const MAX_SNAPSHOTS_PER_CANDIDATE = 240; // ~2 hours of 30s intervals

const VALID_VERDICTS: IdentityMatchVerdict[] = [
  "strong",
  "match",
  "suspicious",
  "mismatch",
  "no_face",
  "multi_face",
];

function parseRound(raw: FormDataEntryValue | null): ProctoringRound | null {
  if (raw === "quiz" || raw === "interview") return raw;
  return null;
}

function parseVerdict(raw: FormDataEntryValue | null): IdentityMatchVerdict | undefined {
  if (typeof raw !== "string") return undefined;
  return (VALID_VERDICTS as readonly string[]).includes(raw)
    ? (raw as IdentityMatchVerdict)
    : undefined;
}

function parseScore(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return Response.json({ error: "Invalid application ID" }, { status: 400 });
  }

  const session = await readSession();
  if (!session?.userId) {
    return Response.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (session.role !== "candidate") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const photo = formData.get("photo");
  const round = parseRound(formData.get("round"));
  if (!round) {
    return Response.json({ error: "round must be 'quiz' or 'interview'" }, { status: 400 });
  }
  if (!(photo instanceof File)) {
    return Response.json({ error: "Snapshot file is required" }, { status: 400 });
  }
  if (!ALLOWED_CONTENT_TYPES.has(photo.type)) {
    return Response.json(
      { error: "Snapshot must be JPEG, PNG, or WebP" },
      { status: 400 }
    );
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Snapshot is too large" }, { status: 400 });
  }

  const verdict = parseVerdict(formData.get("matchVerdict"));
  const matchScore = parseScore(formData.get("matchScore"));
  const mismatchRaw = formData.get("mismatch");
  const mismatch =
    typeof mismatchRaw === "string"
      ? mismatchRaw === "true" || mismatchRaw === "1"
      : undefined;

  await connectDB();
  const candidate = await Candidate.findOne({ _id: id, userId: session.userId });
  if (!candidate) {
    return Response.json({ error: "Application not found" }, { status: 404 });
  }

  candidate.proctoringSnapshots = candidate.proctoringSnapshots ?? [];
  // Cap stored snapshots per candidate to keep document size bounded.
  if (candidate.proctoringSnapshots.length >= MAX_SNAPSHOTS_PER_CANDIDATE) {
    return Response.json(
      { ok: true, skipped: true, reason: "Snapshot limit reached" },
      { status: 200 }
    );
  }

  const buffer = Buffer.from(await photo.arrayBuffer());
  candidate.proctoringSnapshots.push({
    data: buffer,
    contentType: photo.type,
    capturedAt: new Date(),
    round,
    matchScore,
    matchVerdict: verdict,
    mismatch,
  });

  await candidate.save();

  return Response.json({
    ok: true,
    index: candidate.proctoringSnapshots.length - 1,
    total: candidate.proctoringSnapshots.length,
  });
}

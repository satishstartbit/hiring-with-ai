import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { readSession } from "../../../../../../lib/auth/session";
import { connectDB } from "../../../../../../lib/db/connection";
import Candidate, {
  type ProctoringViolationType,
} from "../../../../../../lib/db/models/Candidate";

export const dynamic = "force-dynamic";

const VALID_TYPES: ProctoringViolationType[] = [
  "camera_denied",
  "camera_lost",
  "tab_switch",
  "window_blur",
  "multi_face",
  "no_face",
  "voice_detected",
];

interface ViolationBody {
  type?: unknown;
  level?: unknown;
  answers?: unknown;
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

  const body = (await request.json().catch(() => ({}))) as ViolationBody;
  const type = body.type as ProctoringViolationType;
  const level = body.level;
  if (!VALID_TYPES.includes(type)) {
    return Response.json({ error: "Invalid violation type" }, { status: 400 });
  }
  if (level !== "warning" && level !== "terminate") {
    return Response.json({ error: "Invalid violation level" }, { status: 400 });
  }

  await connectDB();
  const candidate = await Candidate.findOne({ _id: id, userId: session.userId });
  if (!candidate) {
    return Response.json({ error: "Application not found" }, { status: 404 });
  }

  // Only accept violation reports while the quiz is open. Once it's submitted
  // we don't want stale clients to keep posting.
  if (
    candidate.stage !== "quiz_in_progress" &&
    candidate.stage !== "screening"
  ) {
    return Response.json({ error: "Quiz is not active" }, { status: 400 });
  }

  candidate.proctoringViolations = candidate.proctoringViolations ?? [];
  candidate.proctoringViolations.push({ type, level, at: new Date() });

  if (level === "terminate") {
    // Force-close the quiz. Save whatever answers the client managed to send,
    // mark the application as flagged, and skip AI grading — the recruiter
    // will review the answers and proctoring snapshots manually.
    const rawAnswers = Array.isArray(body.answers) ? (body.answers as unknown[]) : [];
    const questions = candidate.quizQuestions ?? [];
    const answers = questions.map((_, i) =>
      typeof rawAnswers[i] === "string" ? (rawAnswers[i] as string) : ""
    );

    candidate.screeningQuestions = questions.map((q) => q.text);
    candidate.screeningAnswers = answers;
    candidate.answerScore = 0;
    candidate.questionScores = questions.map(() => 0);
    candidate.questionFeedback = questions.map(
      () => "Not graded — quiz was force-closed due to proctoring violations."
    );
    candidate.overallFeedback =
      "Quiz was terminated by the proctoring system. The recruiter will review " +
      "the captured snapshots and any answers submitted before this point.";
    candidate.proctoringFlagged = true;
    candidate.quizSubmittedAt = new Date();
    candidate.stage = "quiz_completed";
  }

  await candidate.save();

  return Response.json({
    ok: true,
    flagged: candidate.proctoringFlagged ?? false,
    stage: candidate.stage,
  });
}

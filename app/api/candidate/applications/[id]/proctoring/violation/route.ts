import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { readSession } from "../../../../../../lib/auth/session";
import { connectDB } from "../../../../../../lib/db/connection";
import Candidate, {
  type ProctoringRound,
  type ProctoringViolationType,
} from "../../../../../../lib/db/models/Candidate";
import { describeClosure } from "../../../../../../lib/proctoring/closureReasons";

export const dynamic = "force-dynamic";

const VALID_TYPES: ProctoringViolationType[] = [
  "camera_denied",
  "camera_lost",
  "tab_switch",
  "window_blur",
  "multi_face",
  "no_face",
  "voice_detected",
  "fullscreen_exit",
  "copy_paste",
  "face_mismatch",
];

interface ViolationBody {
  type?: unknown;
  level?: unknown;
  answers?: unknown;
  round?: unknown;
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
  const round: ProctoringRound = body.round === "interview" ? "interview" : "quiz";
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

  if (
    candidate.stage !== "quiz_in_progress" &&
    candidate.stage !== "screening"
  ) {
    return Response.json({ error: "Quiz is not active" }, { status: 400 });
  }

  // Camera permission denied or device disconnected isn't a proctoring
  // violation — it's an environment problem. We record it for diagnostics but
  // never force-close the quiz, so the candidate can fix the camera and come
  // back to retake the same question set.
  const isCameraIssue = type === "camera_denied" || type === "camera_lost";
  const effectiveLevel = isCameraIssue ? "warning" : level;

  candidate.proctoringViolations = candidate.proctoringViolations ?? [];
  candidate.proctoringViolations.push({
    type,
    level: effectiveLevel,
    at: new Date(),
    round,
  });

  if (effectiveLevel === "terminate") {
    const rawAnswers = Array.isArray(body.answers) ? (body.answers as unknown[]) : [];
    const questions = candidate.quizQuestions ?? [];
    const answers = questions.map((_, i) =>
      typeof rawAnswers[i] === "string" ? (rawAnswers[i] as string) : ""
    );

    const reason = describeClosure(type, round);

    candidate.screeningQuestions = questions.map((q) => q.text);
    candidate.screeningAnswers = answers;
    candidate.answerScore = 0;
    candidate.questionScores = questions.map(() => 0);
    candidate.questionFeedback = questions.map(
      () => "Not graded — quiz was force-closed due to proctoring violations."
    );
    candidate.overallFeedback = reason;
    candidate.proctoringFlagged = true;
    candidate.quizSubmittedAt = new Date();
    candidate.stage = "quiz_completed";

    candidate.roundClosures = candidate.roundClosures ?? [];
    candidate.roundClosures.push({
      round,
      type,
      reason,
      closedAt: new Date(),
    });
  }

  await candidate.save();

  return Response.json({
    ok: true,
    flagged: candidate.proctoringFlagged ?? false,
    stage: candidate.stage,
    cameraIssue: isCameraIssue,
    closureReason:
      effectiveLevel === "terminate" ? describeClosure(type, round) : null,
  });
}

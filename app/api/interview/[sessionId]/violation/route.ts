import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import Candidate, {
  type ProctoringViolationType,
} from "../../../../lib/db/models/Candidate";
import { describeClosure } from "../../../../lib/proctoring/closureReasons";

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
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  if (!mongoose.isValidObjectId(sessionId)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
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
  const session = await InterviewSession.findById(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "completed") {
    return Response.json({ error: "Interview is not active" }, { status: 400 });
  }

  const candidate = await Candidate.findById(session.candidateId);
  if (!candidate) {
    return Response.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Camera permission denied or device disconnected isn't a proctoring
  // violation — it's an environment problem. We record it for diagnostics but
  // never force-close the interview, so the candidate can fix the camera and
  // come back to continue from where they were.
  const isCameraIssue = type === "camera_denied" || type === "camera_lost";
  const effectiveLevel = isCameraIssue ? "warning" : level;

  candidate.proctoringViolations = candidate.proctoringViolations ?? [];
  candidate.proctoringViolations.push({
    type,
    level: effectiveLevel,
    at: new Date(),
    round: "interview",
  });

  if (effectiveLevel === "terminate") {
    const reason = describeClosure(type, "interview");
    const questionCount = session.questions.length;
    session.status = "completed";
    session.completedAt = new Date();
    session.totalScore = 0;
    session.questionScores = Array.from({ length: questionCount }, () => 0);
    session.questionFeedback = Array.from(
      { length: questionCount },
      () => "Not graded — interview was force-closed due to proctoring violations."
    );
    session.overallFeedback = reason;
    await session.save();

    candidate.proctoringFlagged = true;
    candidate.stage = "completed";
    candidate.status = "reviewing";

    candidate.roundClosures = candidate.roundClosures ?? [];
    candidate.roundClosures.push({
      round: "interview",
      type,
      reason,
      closedAt: new Date(),
    });
  }

  await candidate.save();

  return Response.json({
    ok: true,
    flagged: candidate.proctoringFlagged ?? false,
    status: session.status,
    cameraIssue: isCameraIssue,
    closureReason:
      effectiveLevel === "terminate" ? describeClosure(type, "interview") : null,
  });
}

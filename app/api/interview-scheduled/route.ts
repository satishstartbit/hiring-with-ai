import crypto from "crypto";
import mongoose from "mongoose";
import { connectDB } from "../../lib/db/connection";
import Candidate from "../../lib/db/models/Candidate";
import InterviewSession from "../../lib/db/models/InterviewSession";
import Job from "../../lib/db/models/Job";
import { sendInterviewScheduledEmail } from "../../lib/email";

export const dynamic = "force-dynamic";

interface CalWebhookBody {
  triggerEvent?: string;
  createdAt?: string;
  payload?: CalBookingPayload;
  metadata?: Record<string, string>;
}

interface CalBookingPayload {
  id?: number;
  bookingId?: number;
  uid?: string;
  bookingUid?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  attendees?: { name?: string; email?: string; timeZone?: string; timezone?: string }[];
  metadata?: Record<string, string>;
  eventType?: {
    id?: number;
  };
}

function verifyCalSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.CAL_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.replace(/^sha256=/i, "").trim();

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getBaseUrl(request: Request, metadata?: Record<string, string>): string {
  const fromMetadata = metadata?.appBaseUrl?.trim();
  if (fromMetadata) return fromMetadata;

  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv;

  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function getPayload(body: CalWebhookBody): CalBookingPayload {
  return body.payload ?? (body as CalBookingPayload);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-cal-signature-256");

  if (!verifyCalSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid Cal.com signature" }, { status: 401 });
  }

  let body: CalWebhookBody;
  try {
    body = JSON.parse(rawBody || "{}") as CalWebhookBody;
  } catch {
    return Response.json({ error: "Invalid JSON webhook payload" }, { status: 400 });
  }
  const triggerEvent = body.triggerEvent ?? "UNKNOWN";
  const supportedEvents = new Set([
    "BOOKING_CREATED",
    "BOOKING_CONFIRMED",
    "BOOKING_RESCHEDULED",
  ]);

  if (!supportedEvents.has(triggerEvent)) {
    return Response.json({ success: true, ignored: true, triggerEvent });
  }

  const payload = getPayload(body);
  const metadata = payload.metadata ?? body.metadata ?? {};
  const candidateId = metadata.candidateId;
  const jobId = metadata.jobId;
  const bookingUid = payload.bookingUid ?? payload.uid;
  const scheduledAtRaw = payload.startTime;

  if (!candidateId || !jobId || !bookingUid || !scheduledAtRaw) {
    return Response.json(
      {
        success: false,
        error: "Cal.com webhook missing candidateId, jobId, booking UID, or start time",
      },
      { status: 202 }
    );
  }

  if (!mongoose.isValidObjectId(candidateId) || !mongoose.isValidObjectId(jobId)) {
    return Response.json({ error: "Invalid Cal.com metadata IDs" }, { status: 400 });
  }

  const scheduledAt = new Date(scheduledAtRaw);
  if (!Number.isFinite(scheduledAt.getTime())) {
    return Response.json({ error: "Invalid Cal.com start time" }, { status: 400 });
  }

  await connectDB();

  const [candidate, job] = await Promise.all([
    Candidate.findById(candidateId),
    Job.findById(jobId),
  ]);

  if (!candidate || !job) {
    return Response.json({ error: "Candidate or job not found" }, { status: 404 });
  }

  const existing = await InterviewSession.findOne({ calBookingUid: bookingUid });
  if (existing) {
    existing.scheduledAt = scheduledAt;
    existing.calStatus = triggerEvent;
    existing.calBookingId = payload.bookingId ?? payload.id ?? existing.calBookingId;
    existing.calEventTypeId = payload.eventType?.id ?? existing.calEventTypeId;
    await existing.save();

    return Response.json({
      success: true,
      sessionId: existing._id.toString(),
      updated: true,
    });
  }

  const session = await InterviewSession.create({
    candidateId: candidate._id,
    jobId: job._id,
    jobTitle: job.title,
    jobDescription: job.description,
    jobRequirements: job.requirements ?? [],
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    status: "scheduled",
    scheduledAt,
    questions: [],
    conversationHistory: [],
    answers: [],
    currentQuestionIndex: 0,
    calBookingUid: bookingUid,
    calBookingId: payload.bookingId ?? payload.id,
    calEventTypeId: payload.eventType?.id,
    calStatus: triggerEvent,
  });

  const meetingUrl = `${getBaseUrl(request, metadata)}/interview/${session._id}`;
  session.meetingUrl = meetingUrl;
  await session.save();

  await Candidate.findByIdAndUpdate(candidate._id, { status: "interviewing" });

  await sendInterviewScheduledEmail({
    to: candidate.email,
    candidateName: candidate.name,
    jobTitle: job.title,
    scheduledAt,
    meetingUrl,
  }).catch((err) => console.error("[email] interview scheduled send failed:", err));

  return Response.json({
    success: true,
    sessionId: session._id.toString(),
    meetingUrl,
  });
}

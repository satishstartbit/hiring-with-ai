import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import Job from "../../../../lib/db/models/Job";
import Candidate from "../../../../lib/db/models/Candidate";
import InterviewSession from "../../../../lib/db/models/InterviewSession";
import { runStartInterview } from "../../../../lib/workflow/interviewGraph";
import { createCalBooking, getCalAvailableSlots, hasCalSchedulingConfig } from "../../../../lib/cal";
import { extractResumeText } from "../../../../lib/ai/resumeText";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!hasCalSchedulingConfig()) {
    return Response.json(
      { error: "Cal.com scheduling is not configured" },
      { status: 503 }
    );
  }

  const timeZone = request.nextUrl.searchParams.get("timeZone") || "UTC";
  const start = new Date();
  start.setMinutes(start.getMinutes() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  try {
    const data = await getCalAvailableSlots({
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone,
    });

    const slots = Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, calSlots]) => {
        const firstSlot = calSlots[0]?.start ? new Date(calSlots[0].start) : new Date(date);
        return {
          date,
          label: firstSlot.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone,
          }),
          times: calSlots.slice(0, 12).map((slot) => {
            const d = new Date(slot.start);
            return {
              iso: d.toISOString(),
              label: d.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone,
              }),
            };
          }),
        };
      })
      .filter((slot) => slot.times.length > 0);

    return Response.json({ slots });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Cal.com slots";
    return Response.json({ error: message }, { status: 502 });
  }
}

function getBaseUrl(request: NextRequest): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return Response.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { candidateId, scheduledDate, timeZone } = body as {
    candidateId?: string;
    scheduledDate?: string;
    timeZone?: string;
  };

  if (!candidateId || !scheduledDate) {
    return Response.json({ error: "candidateId and scheduledDate are required" }, { status: 400 });
  }

  await connectDB();

  const [job, candidate] = await Promise.all([
    Job.findById(id).lean(),
    Candidate.findById(candidateId).lean(),
  ]);

  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 });

  const isImmediate = scheduledDate === "immediate";
  const scheduledAt = isImmediate ? new Date() : new Date(scheduledDate);
  const baseUrl = getBaseUrl(request);

  if (isImmediate) {
    // Create the session first so we can pass its id into the graph for vector memory keying.
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
    });

    const meetingUrl = `${baseUrl}/interview/${session._id}`;

    const resumeText = extractResumeText(
      candidate.resumeData ? Buffer.from(candidate.resumeData) : null,
      {
        filename: candidate.resumeFilename,
        contentType: candidate.resumeContentType,
      }
    );

    const result = await runStartInterview({
      candidateId: candidate._id.toString(),
      jobId: job._id.toString(),
      interviewSessionId: session._id.toString(),
      jobTitle: job.title,
      jobDescription: job.description,
      jobRequirements: job.requirements ?? [],
      candidateName: candidate.name,
      resumeText,
    });

    if (result.error) {
      await InterviewSession.findByIdAndDelete(session._id);
      return Response.json({ error: result.error }, { status: 502 });
    }

    await InterviewSession.findByIdAndUpdate(session._id, {
      status: "in_progress",
      startedAt: new Date(),
      questions: result.questions.map((q) => q.prompt),
      questionPlan: result.questions,
      conversationHistory: result.conversationHistory.map((m) => ({
        ...m,
        timestamp: new Date(),
      })),
      currentDifficulty: result.currentDifficulty,
      resumeIntelligence: result.resumeIntelligence ?? undefined,
      skillMatch: result.skillMatch ?? undefined,
      strongSkills: result.strongSkills,
      weakSkills: result.weakSkills,
      meetingUrl,
    });

    await Candidate.findByIdAndUpdate(candidateId, { status: "interviewing" });

    return Response.json({
      sessionId: session._id.toString(),
      immediate: true,
      meetingUrl,
      firstMessage: result.firstMessage,
      totalQuestions: result.questions.length,
    });
  }

  if (!Number.isFinite(scheduledAt.getTime())) {
    return Response.json({ error: "scheduledDate must be a valid ISO date" }, { status: 400 });
  }

  if (!hasCalSchedulingConfig()) {
    return Response.json(
      { error: "Cal.com scheduling is not configured" },
      { status: 503 }
    );
  }

  let booking: Awaited<ReturnType<typeof createCalBooking>>;
  try {
    booking = await createCalBooking({
      start: scheduledAt.toISOString(),
      attendee: {
        name: candidate.name,
        email: candidate.email,
        timeZone: timeZone || "UTC",
      },
      metadata: {
        jobId: job._id.toString(),
        candidateId: candidate._id.toString(),
        appBaseUrl: baseUrl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cal.com booking failed";
    return Response.json({ error: message }, { status: 502 });
  }

  await Candidate.findByIdAndUpdate(candidateId, { status: "interviewing" });

  return Response.json({
    immediate: false,
    calBookingUid: booking.data?.uid ?? booking.data?.bookingUid,
    scheduledAt: scheduledAt.toISOString(),
    message:
      "Cal.com booking confirmed. Your AI interview link will arrive by email after Cal.com sends the confirmation webhook.",
  });
}

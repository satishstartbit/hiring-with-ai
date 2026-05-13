import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import Candidate from "../../../../lib/db/models/Candidate";
import Job from "../../../../lib/db/models/Job";
import { readSession } from "../../../../lib/auth/session";
import { getGroqErrorMessage } from "../../../../lib/groq";
import { runMatchWorkflow } from "../../../../lib/workflow/screeningGraph";
import { sendResumeRejectedEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";

const MAX_RESUME_SIZE = 5 * 1024 * 1024;

function cleanResumeText(text: string): string {
  return text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6000);
}

function looksLikeUsefulResumeText(text: string): boolean {
  if (text.length < 120) return false;

  const words = text.split(/\s+/).filter(Boolean);
  const alphaWords = words.filter((word) => /[A-Za-z]{2,}/.test(word));
  const alphaRatio = alphaWords.length / Math.max(words.length, 1);
  const hasPdfNoise = /%PDF|endobj|stream|xref|obj\b/i.test(text);
  const hasZipNoise = /word\/document\.xml|_rels|\bpk\b/i.test(text);

  return alphaWords.length >= 40 && alphaRatio >= 0.55 && !hasPdfNoise && !hasZipNoise;
}

async function getResumeText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const decoded = cleanResumeText(buffer.toString("utf8"));

  if (looksLikeUsefulResumeText(decoded)) return decoded;

  return [
    `Resume filename: ${file.name}`,
    `Content type: ${file.type || "unknown"}`,
    `File size: ${file.size} bytes`,
    "Text extraction failed - evaluate based on filename and candidate details only.",
  ].join("\n");
}

function parseApplicationAnswers(
  questionsRaw: string | null,
  answersRaw: string | null
): { question: string; answer: string }[] {
  if (!questionsRaw || !answersRaw) return [];
  try {
    const aqs = JSON.parse(questionsRaw);
    const aas = JSON.parse(answersRaw);
    if (!Array.isArray(aqs) || !Array.isArray(aas)) return [];
    return aqs
      .slice(0, 10)
      .map((q, i) => {
        const question =
          q && typeof q === "object" && typeof q.question === "string"
            ? q.question.trim()
            : "";
        const answer = typeof aas[i] === "string" ? aas[i].trim() : "";
        return { question, answer };
      })
      .filter((p) => p.question.length > 0);
  } catch {
    return [];
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!mongoose.isValidObjectId(id)) {
    return Response.json({ error: "Invalid job ID" }, { status: 400 });
  }

  // Only logged-in candidates can apply. HR users hit this if they tried
  // to call the API directly; bounce them.
  const session = await readSession();
  if (!session?.userId) {
    return Response.json({ error: "Sign in to apply for this role" }, { status: 401 });
  }
  if (session.role !== "candidate") {
    return Response.json(
      { error: "Only candidate accounts can apply. Sign in with a candidate account." },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const job = await Job.findById(id).lean();
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "active" && job.status !== "ai_generated") {
      return Response.json(
        { error: "This job is no longer accepting applications" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const name = (formData.get("name") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim().toLowerCase();
    const currentTitle = (formData.get("currentTitle") as string | null)?.trim();
    const currentCompany = (formData.get("currentCompany") as string | null)?.trim();
    const resumeFile = formData.get("resume") as File | null;
    const applicationQuestionsRaw = formData.get("applicationQuestions") as string | null;
    const applicationAnswersRaw = formData.get("applicationAnswers") as string | null;

    if (!name || !email) {
      return Response.json({ error: "Name and email are required" }, { status: 400 });
    }
    if (!resumeFile || resumeFile.size === 0) {
      return Response.json({ error: "Resume is required" }, { status: 400 });
    }
    if (resumeFile.size > MAX_RESUME_SIZE) {
      return Response.json({ error: "Resume must be under 5 MB" }, { status: 400 });
    }

    // Dupe-guard: one application per (job, candidate). The unique index also
    // catches this on insert, but checking up front lets us return a friendly
    // 409 and tell the client which application to resume.
    const existing = await Candidate.findOne({ jobId: id, userId: session.userId })
      .select("_id")
      .lean();
    if (existing) {
      return Response.json(
        {
          error: "You have already applied for this position",
          candidateId: String(existing._id),
        },
        { status: 409 }
      );
    }

    const resumeText = await getResumeText(resumeFile);
    const resumeData = Buffer.from(await resumeFile.arrayBuffer());

    const result = await runMatchWorkflow({
      jobTitle: job.title,
      jobDescription: job.description,
      jobRequirements: job.requirements ?? [],
      jobDepartment: job.department,
      candidateName: name,
      candidateTitle: currentTitle ?? "",
      resumeText,
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const applicationAnswers = parseApplicationAnswers(
      applicationQuestionsRaw,
      applicationAnswersRaw
    );

    const candidate = await Candidate.create({
      userId: new mongoose.Types.ObjectId(session.userId),
      name,
      email,
      currentTitle: currentTitle || undefined,
      currentCompany: currentCompany || undefined,
      skills: result.candidateSkills,
      jobId: new mongoose.Types.ObjectId(id),
      jobTitle: job.title,
      stage: result.matched ? "screening" : "rejected",
      status: result.matched ? "applied" : "rejected",
      source: "website",
      resumeData,
      resumeFilename: resumeFile.name,
      resumeContentType: resumeFile.type,
      applicationAnswers,
      resumeMatchScore: result.matchScore,
      resumeMatchReason: result.matchReason,
      appliedAt: new Date(),
    });

    // Only count matched applications toward the public applicant count.
    if (result.matched) {
      await Job.findByIdAndUpdate(id, { $inc: { applicantCount: 1 } });
    } else {
      sendResumeRejectedEmail({
        to: email,
        candidateName: name,
        jobTitle: job.title,
        matchScore: result.matchScore,
        matchReason: result.matchReason,
      }).catch((err) => console.error("[email] resume rejected send failed:", err));
    }

    return Response.json({
      candidateId: String(candidate._id),
      matched: result.matched,
      score: result.matchScore,
      reason: result.matchReason,
    });
  } catch (err) {
    const message = getGroqErrorMessage(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

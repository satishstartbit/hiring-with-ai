import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/db/connection";
import Job from "../../../../lib/db/models/Job";
import Candidate from "../../../../lib/db/models/Candidate";
import { runGradingWorkflow } from "../../../../lib/workflow/gradingGraph";
import type { ScreeningQuestion } from "../../../../lib/workflow/screeningState";
import { sendScreeningResultEmail } from "../../../../lib/email";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!mongoose.isValidObjectId(id)) {
    return Response.json({ error: "Invalid job ID" }, { status: 400 });
  }

  try {
    await connectDB();

    const job = await Job.findById(id).lean();
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "active") {
      return Response.json({ error: "This job is no longer accepting applications" }, { status: 400 });
    }

    const formData = await request.formData();
    const name = (formData.get("name") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim().toLowerCase();
    const currentTitle = (formData.get("currentTitle") as string | null)?.trim();
    const currentCompany = (formData.get("currentCompany") as string | null)?.trim();
    const resumeFile = formData.get("resume") as File | null;
    const screeningQuestionsRaw = formData.get("screeningQuestions") as string | null;
    const screeningAnswersRaw = formData.get("screeningAnswers") as string | null;
    const resumeMatchScoreRaw = formData.get("resumeMatchScore") as string | null;
    const resumeMatchReason = (formData.get("resumeMatchReason") as string | null)?.trim();
    const screeningTimeLimitRaw = formData.get("screeningTimeLimitSeconds") as string | null;

    if (!name || !email) {
      return Response.json({ error: "Name and email are required" }, { status: 400 });
    }
    if (!screeningQuestionsRaw || !screeningAnswersRaw) {
      return Response.json({ error: "AI screening must be completed before applying" }, { status: 400 });
    }

    const existing = await Candidate.findOne({ jobId: id, email });
    if (existing) {
      return Response.json({ error: "You have already applied for this position" }, { status: 409 });
    }

    // Parse resume
    let resumeData: Buffer | undefined;
    let resumeFilename: string | undefined;
    let resumeContentType: string | undefined;
    if (resumeFile && resumeFile.size > 0) {
      if (resumeFile.size > 5 * 1024 * 1024) {
        return Response.json({ error: "Resume must be under 5 MB" }, { status: 400 });
      }
      resumeData = Buffer.from(await resumeFile.arrayBuffer());
      resumeFilename = resumeFile.name;
      resumeContentType = resumeFile.type;
    }

    // Parse screening Q&A
    let questions: ScreeningQuestion[] = [];
    let answers: string[] = [];
    try {
      const pq = JSON.parse(screeningQuestionsRaw);
      const pa = JSON.parse(screeningAnswersRaw);
      if (Array.isArray(pq) && Array.isArray(pa)) {
        questions = pq.slice(0, 25) as ScreeningQuestion[];
        answers = pa.filter((a) => typeof a === "string").slice(0, 25);
      }
    } catch {
      return Response.json({ error: "Invalid screening answer payload" }, { status: 400 });
    }

    if (questions.length === 0 || answers.length === 0) {
      return Response.json({ error: "Screening questions must be answered before applying" }, { status: 400 });
    }

    const resumeMatchScore = resumeMatchScoreRaw ? Number.parseInt(resumeMatchScoreRaw, 10) : undefined;
    const screeningTimeLimitSeconds = screeningTimeLimitRaw ? Number.parseInt(screeningTimeLimitRaw, 10) : undefined;

    // Store the question texts for the DB (strip correctIndex before saving)
    const screeningQuestionsForDb = questions.map((q) => q.text);

    const candidate = await Candidate.create({
      name,
      email,
      currentTitle: currentTitle || undefined,
      currentCompany: currentCompany || undefined,
      skills: [],
      jobId: new mongoose.Types.ObjectId(id),
      jobTitle: job.title,
      status: "applied",
      source: "website",
      resumeData,
      resumeFilename,
      resumeContentType,
      screeningQuestions: screeningQuestionsForDb,
      screeningAnswers: answers,
      resumeMatchScore: Number.isFinite(resumeMatchScore) ? resumeMatchScore : undefined,
      resumeMatchReason: resumeMatchReason || undefined,
      screeningTimeLimitSeconds: Number.isFinite(screeningTimeLimitSeconds) ? screeningTimeLimitSeconds : undefined,
      appliedAt: new Date(),
    });

    await Job.findByIdAndUpdate(id, { $inc: { applicantCount: 1 } });

    // --- Grading ---
    // MCQ: auto-grade by comparing selected index to correctIndex
    // Descriptive: LLM-grade only those 2 questions
    let questionScores: number[] = [];
    let questionFeedback: string[] = [];
    let totalScore = 0;
    let overallFeedback = "";

    try {
      const mcqScores: number[] = [];
      const descIndices: number[] = [];
      const descQuestions: string[] = [];
      const descAnswers: string[] = [];

      questions.forEach((q, i) => {
        if (q.type === "mcq") {
          const selected = Number.parseInt(answers[i] ?? "-1", 10);
          mcqScores.push(selected === q.correctIndex ? 10 : 0);
        } else {
          descIndices.push(i);
          descQuestions.push(q.text);
          descAnswers.push(answers[i] ?? "");
        }
      });

      // LLM grades only descriptive questions
      let descScores: number[] = [];
      let descFeedback: string[] = [];
      let descOverall = "";

      if (descQuestions.length > 0) {
        const graded = await runGradingWorkflow({
          jobTitle: job.title,
          jobDescription: job.description,
          jobRequirements: job.requirements ?? [],
          questions: descQuestions,
          answers: descAnswers,
        });
        if (!graded.error) {
          descScores = graded.questionScores;
          descFeedback = graded.questionFeedback;
          descOverall = graded.overallFeedback;
        }
      }

      // Merge MCQ and descriptive scores back into a single array
      let mcqIdx = 0;
      let descIdx = 0;
      questionScores = questions.map((q) => {
        if (q.type === "mcq") return mcqScores[mcqIdx++] ?? 0;
        return descScores[descIdx++] ?? 0;
      });
      questionFeedback = questions.map((q, i) => {
        if (q.type === "mcq") {
          const selected = Number.parseInt(answers[i] ?? "-1", 10);
          return selected === q.correctIndex ? "Correct" : `Wrong — correct answer: ${String.fromCharCode(65 + q.correctIndex)}`;
        }
        return descFeedback[descIndices.indexOf(i)] ?? "";
      });
      totalScore = Math.round(
        (questionScores.reduce((a, b) => a + b, 0) / (questions.length * 10)) * 100
      );
      overallFeedback = descOverall;

      await Candidate.findByIdAndUpdate(candidate._id, {
        answerScore: totalScore,
        questionScores,
        questionFeedback,
        overallFeedback,
      });

      await sendScreeningResultEmail({
        to: email,
        candidateName: name,
        jobTitle: job.title,
        totalScore,
        overallFeedback: overallFeedback || undefined,
      }).catch((err) => console.error("[email] screening result send failed:", err));
    } catch {
      // Grading failure must not block submission
    }

    const passed = totalScore >= 70;

    return Response.json(
      {
        success: true,
        candidateId: candidate._id.toString(),
        questions: questions.map((q) => q.text),
        questionScores,
        questionFeedback,
        totalScore: totalScore || undefined,
        overallFeedback: overallFeedback || undefined,
        // Signal the UI to show interview scheduling when candidate passed
        interviewRequired: passed,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

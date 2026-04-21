"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  jobId: string;
  jobTitle: string;
  onClose: () => void;
}

interface MCQQuestion {
  type: "mcq";
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
}
interface DescriptiveQuestion {
  type: "descriptive";
  text: string;
}
type ScreeningQuestion = MCQQuestion | DescriptiveQuestion;

interface ScreeningResult {
  matched: boolean;
  score?: number;
  message?: string;
  reason?: string;
  questions?: ScreeningQuestion[];
  timeLimitSeconds?: number;
}

interface ApplyResult {
  candidateId: string;
  questions: string[];
  totalScore?: number;
  questionScores?: number[];
  questionFeedback?: string[];
  overallFeedback?: string;
}

type Stage = "details" | "questions" | "rejected" | "success";

export default function ApplyModal({ jobId, jobTitle, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage !== "questions" || timeLeft <= 0 || isExpired) return;
    const timer = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setIsExpired(true); window.clearInterval(timer); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, timeLeft, isExpired]);

  function buildCandidateFormData() {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("email", email);
    fd.append("currentTitle", currentTitle);
    fd.append("currentCompany", currentCompany);
    if (resumeFile) fd.append("resume", resumeFile);
    return fd;
  }

  function formatTime(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  async function handleScreening(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!resumeFile) { setError("Resume is required before AI screening."); return; }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/screening`, {
        method: "POST",
        body: buildCandidateFormData(),
      });
      const data: ScreeningResult & { error?: string } = await res.json();
      if (!res.ok) { setError(data.error || "AI screening failed"); return; }

      setScreening(data);
      if (!data.matched) { setStage("rejected"); return; }

      const questions = data.questions ?? [];
      setAnswers(Array.from({ length: questions.length }, () => ""));
      setTimeLeft(data.timeLimitSeconds ?? 20 * 60);
      setIsExpired(false);
      setStage("questions");
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFinalSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;
    if (isExpired) { setError("Time expired. Please close and restart."); return; }
    if (answers.some((a) => !a.trim())) {
      setError("Please answer every question before submitting.");
      return;
    }

    const questions = screening?.questions ?? [];
    const fd = buildCandidateFormData();
    fd.append("screeningQuestions", JSON.stringify(questions));
    fd.append("screeningAnswers", JSON.stringify(answers));
    fd.append("resumeMatchScore", String(screening?.score ?? ""));
    fd.append("resumeMatchReason", screening?.reason ?? "");
    fd.append("screeningTimeLimitSeconds", String(screening?.timeLimitSeconds ?? 20 * 60));

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/apply`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); return; }
      setApplyResult(data);
      setStage("success");
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
        {stage === "success" ? (
          <SuccessState result={applyResult} onClose={onClose} />
        ) : stage === "rejected" ? (
          <RejectedState screening={screening} onClose={onClose} />
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Apply for position</h2>
                <p className="mt-0.5 text-sm text-slate-500">{jobTitle}</p>
              </div>
              <button type="button" onClick={onClose}
                className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                aria-label="Close">×</button>
            </div>

            {stage === "details" ? (
              <form onSubmit={handleScreening} className="space-y-4">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Upload your resume. The AI checks your fit before showing timed screening questions.
                </div>
                <Field label="Full name *">
                  <input name="name" type="text" required value={name}
                    onChange={(e) => setName(e.target.value)} placeholder="Alex Johnson"
                    className="field-input" />
                </Field>
                <Field label="Email *">
                  <input name="email" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="alex@example.com"
                    className="field-input" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Current title">
                    <input name="currentTitle" type="text" value={currentTitle}
                      onChange={(e) => setCurrentTitle(e.target.value)} placeholder="Software Engineer"
                      className="field-input" />
                  </Field>
                  <Field label="Company">
                    <input name="currentCompany" type="text" value={currentCompany}
                      onChange={(e) => setCurrentCompany(e.target.value)} placeholder="TechCorp"
                      className="field-input" />
                  </Field>
                </div>
                <Field label="Resume (PDF, DOC, TXT — max 5 MB) *">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800">
                    {resumeFile?.name || "Click to upload resume"}
                  </button>
                  <input ref={fileInputRef} name="resume" type="file"
                    accept=".pdf,.doc,.docx,.txt" className="hidden"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)} />
                </Field>
                {error && <ErrorMsg message={error} />}
                <button type="submit" disabled={isSubmitting}
                  className="w-full rounded-md bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45">
                  {isSubmitting ? "AI is reviewing resume…" : "Check Resume & Generate Questions"}
                </button>
              </form>
            ) : (
              <QuestionsStage
                screening={screening}
                answers={answers}
                setAnswers={setAnswers}
                currentIndex={currentIndex}
                setCurrentIndex={setCurrentIndex}
                timeLeft={timeLeft}
                isExpired={isExpired}
                isSubmitting={isSubmitting}
                error={error}
                setError={setError}
                onSubmit={handleFinalSubmit}
                formatTime={formatTime}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface QuestionsStageProps {
  screening: ScreeningResult | null;
  answers: string[];
  setAnswers: (a: string[]) => void;
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  timeLeft: number;
  isExpired: boolean;
  isSubmitting: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  formatTime: (s: number) => string;
}

function QuestionsStage({
  screening,
  answers,
  setAnswers,
  currentIndex,
  setCurrentIndex,
  timeLeft,
  isExpired,
  isSubmitting,
  error,
  setError,
  onSubmit,
  formatTime,
}: QuestionsStageProps) {
  const questions = screening?.questions ?? [];
  const total = questions.length;
  const isLast = currentIndex === total - 1;
  const answeredCount = answers.filter((a) => a.trim()).length;
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  function handleNext() {
    if (!answers[currentIndex]?.trim()) {
      setError("Please answer this question before moving on.");
      return;
    }
    setError(null);
    setCurrentIndex(currentIndex + 1);
  }

  function handlePrev() {
    setError(null);
    setCurrentIndex(currentIndex - 1);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Header bar: match score + timer */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm font-bold text-blue-900">
          Resume match: {screening?.score ?? 0}/100
        </p>
        <div className={`rounded-md px-3 py-1.5 text-base font-bold tabular-nums ${
          isExpired ? "bg-red-600 text-white" : "bg-white text-blue-700"
        }`}>
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Question {currentIndex + 1} of {total}</span>
          <span>{answeredCount}/{total} answered</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Current question */}
      <div className="rounded-md border border-slate-200 bg-white p-5">
        <p className="text-sm font-bold text-slate-950 leading-snug">
          {currentIndex + 1}. {questions[currentIndex]?.text}
        </p>
        {questions[currentIndex]?.type === "mcq" ? (
          <div className="mt-4 space-y-2">
            {(questions[currentIndex] as MCQQuestion).options.map((option, optIdx) => (
              <label
                key={optIdx}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  answers[currentIndex] === String(optIdx)
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${currentIndex}`}
                  value={String(optIdx)}
                  checked={answers[currentIndex] === String(optIdx)}
                  onChange={() => {
                    const next = [...answers];
                    next[currentIndex] = String(optIdx);
                    setAnswers(next);
                    if (error) setError(null);
                  }}
                  disabled={isExpired}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-sm text-slate-800">
                  <span className="font-bold">{String.fromCharCode(65 + optIdx)}.</span> {option}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <textarea
            key={currentIndex}
            rows={6}
            value={answers[currentIndex] ?? ""}
            onChange={(e) => {
              const next = [...answers];
              next[currentIndex] = e.target.value;
              setAnswers(next);
              if (error) setError(null);
            }}
            disabled={isExpired}
            autoFocus
            className="mt-4 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            placeholder="Write your answer here…"
          />
        )}
      </div>

      {isExpired && <ErrorMsg message="Time expired. Please close and restart the application." />}
      {error && <ErrorMsg message={error} />}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0 || isExpired}
          className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous
        </button>

        {isLast ? (
          <button
            type="submit"
            disabled={isSubmitting || isExpired}
            className="flex-1 rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSubmitting ? "Grading and submitting…" : "Submit Application"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={isExpired}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Next →
          </button>
        )}
      </div>
    </form>
  );
}

function SuccessState({ result, onClose }: { result: ApplyResult | null; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasScore = result?.totalScore !== undefined;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2 pt-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 text-lg font-bold">✓</div>
        <p className="text-lg font-bold text-slate-950">Application submitted</p>
        <p className="text-sm text-slate-600">Your resume and answers have been saved.</p>
      </div>

      {hasScore && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">Your screening score</span>
            <ScoreBadge score={result!.totalScore!} />
          </div>

          {result?.overallFeedback && (
            <p className="text-sm text-slate-600">{result.overallFeedback}</p>
          )}

          {result?.questions && result.questions.length > 0 && (
            <>
              <button type="button" onClick={() => setExpanded((x) => !x)}
                className="text-xs font-bold text-blue-600 hover:underline">
                {expanded ? "Hide" : "Show"} per-question breakdown
              </button>

              {expanded && (
                <ol className="space-y-3 mt-2">
                  {result.questions.map((q, i) => (
                    <li key={i} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold text-slate-700 leading-snug flex-1">
                          {i + 1}. {q}
                        </p>
                        <span className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-700">
                          {result.questionScores?.[i] ?? "—"}/10
                        </span>
                      </div>
                      {result.questionFeedback?.[i] && (
                        <p className="mt-1.5 text-xs text-slate-500">{result.questionFeedback[i]}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}

      <button type="button" onClick={onClose}
        className="w-full rounded-md bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700">
        Close
      </button>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "bg-green-100 text-green-700" :
    score >= 50 ? "bg-yellow-100 text-yellow-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`rounded-md px-3 py-1 text-sm font-bold ${color}`}>
      {score}/100
    </span>
  );
}

function RejectedState({ screening, onClose }: { screening: ScreeningResult | null; onClose: () => void }) {
  return (
    <div className="space-y-4 py-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-red-50 text-sm font-bold text-red-700">✕</div>
      <p className="text-lg font-bold text-slate-950">
        {screening?.message || "Your resume does not match the requirements for this position."}
      </p>
      {typeof screening?.score === "number" && (
        <p className="text-sm font-bold text-red-700">Match score: {screening.score}/100</p>
      )}
      {screening?.reason && (
        <p className="mx-auto max-w-lg text-sm text-slate-600">{screening.reason}</p>
      )}
      <button type="button" onClick={onClose}
        className="mt-2 rounded-md bg-red-600 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700">
        Close
      </button>
    </div>
  );
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
      {message}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

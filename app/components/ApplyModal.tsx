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

interface MatchResult {
  matched: boolean;
  score: number;
  reason: string;
}

interface ApplyResult {
  candidateId: string;
  questions: string[];
  totalScore?: number;
  questionScores?: number[];
  questionFeedback?: string[];
  overallFeedback?: string;
  interviewRequired?: boolean;
}

type Stage =
  | "details"
  | "matched"
  | "questions"
  | "rejected"
  | "schedule"
  | "success";

const STEP_META: Record<Stage, { eyebrow: string; title: string; step: number }> = {
  details: { eyebrow: "Step 1 of 4", title: "Candidate details", step: 1 },
  matched: { eyebrow: "Step 2 of 4", title: "Resume fit", step: 2 },
  questions: { eyebrow: "Step 3 of 4", title: "Screening questions", step: 3 },
  schedule: { eyebrow: "Step 4 of 4", title: "Interview scheduling", step: 4 },
  success: { eyebrow: "Complete", title: "Application submitted", step: 4 },
  rejected: { eyebrow: "Review complete", title: "Resume screening result", step: 2 },
};

export default function ApplyModal({ jobId, jobTitle, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Candidate details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Screening
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(20 * 60);
  const [answers, setAnswers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // Interview scheduling
  const [slots, setSlots] = useState<{ date: string; label: string; times: { iso: string; label: string }[] }[]>([]);
  const [scheduledConfirmation, setScheduledConfirmation] = useState<{ date: string; meetingUrl?: string; message?: string } | null>(null);

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

  const currentStep = STEP_META[stage];

  async function handleCheckResume(e: React.FormEvent<HTMLFormElement>) {
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
      const data: (MatchResult & { error?: string }) = await res.json();
      if (!res.ok) { setError(data.error || "AI screening failed"); return; }
      setMatchResult(data);
      setStage(data.matched ? "matched" : "rejected");
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleContinueToTest() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/questions`, { method: "POST" });
      const data: { questions?: ScreeningQuestion[]; timeLimitSeconds?: number; error?: string } = await res.json();
      if (!res.ok) { setError(data.error || "Failed to generate questions"); return; }
      const qs = data.questions ?? [];
      setQuestions(qs);
      setTimeLimitSeconds(data.timeLimitSeconds ?? 20 * 60);
      setAnswers(Array.from({ length: qs.length }, () => ""));
      setTimeLeft(data.timeLimitSeconds ?? 20 * 60);
      setIsExpired(false);
      setCurrentIndex(0);
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
    const fd = buildCandidateFormData();
    fd.append("screeningQuestions", JSON.stringify(questions));
    fd.append("screeningAnswers", JSON.stringify(answers));
    fd.append("resumeMatchScore", String(matchResult?.score ?? ""));
    fd.append("resumeMatchReason", matchResult?.reason ?? "");
    fd.append("screeningTimeLimitSeconds", String(timeLimitSeconds));
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/apply`, { method: "POST", body: fd });
      const data: ApplyResult & { error?: string } = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); return; }
      setApplyResult(data);
      if (data.interviewRequired) {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const slotsRes = await fetch(`/api/jobs/${jobId}/interview?timeZone=${encodeURIComponent(timeZone)}`);
        const slotsData: { slots?: typeof slots; error?: string } = await slotsRes.json();
        if (!slotsRes.ok) { setError(slotsData.error || "Failed to load Cal.com availability"); return; }
        setSlots(slotsData.slots ?? []);
        setStage("schedule");
      } else {
        setStage("success");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSchedule(scheduledDate: string) {
    if (isSubmitting || !applyResult?.candidateId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: applyResult.candidateId,
          scheduledDate,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      });
      const data: {
        sessionId?: string;
        immediate?: boolean;
        meetingUrl?: string;
        scheduledAt?: string;
        message?: string;
        error?: string;
      } = await res.json();
      if (!res.ok) { setError(data.error || "Scheduling failed"); return; }

      if (data.immediate && data.meetingUrl) {
        window.location.href = data.meetingUrl;
        return;
      } else if (data.scheduledAt) {
        const d = new Date(data.scheduledAt);
        const label = d.toLocaleString("en-US", {
          weekday: "long", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
        setScheduledConfirmation({ date: label, meetingUrl: data.meetingUrl, message: data.message });
        setStage("success");
      } else {
        setStage("success");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                  {currentStep.eyebrow}
                </span>
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                  Apply for position
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-950">
                {currentStep.title}
              </h2>
              <p className="mt-1 truncate text-sm font-medium text-slate-500">
                {jobTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.47 4.47a.75.75 0 0 1 1.06 0L8 6.94l2.47-2.47a.75.75 0 1 1 1.06 1.06L9.06 8l2.47 2.47a.75.75 0 1 1-1.06 1.06L8 9.06l-2.47 2.47a.75.75 0 0 1-1.06-1.06L6.94 8 4.47 5.53a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
          <StepRail step={currentStep.step} status={stage} />
        </div>

        <div className="max-h-[calc(94vh-128px)] overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {stage === "success" && <SuccessState result={applyResult} scheduledConfirmation={scheduledConfirmation} onClose={onClose} />}
          {stage === "rejected" && <RejectedState matchResult={matchResult} onClose={onClose} />}

          {stage === "details" && (
            <form onSubmit={handleCheckResume} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                <p className="font-bold text-blue-900">Start with your resume</p>
                <p className="mt-1 leading-6">
                  Our AI checks your fit before unlocking timed screening questions.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name *">
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Johnson" className="field-input" />
                </Field>
                <Field label="Email *">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@example.com" className="field-input" />
                </Field>
                <Field label="Current title">
                  <input type="text" value={currentTitle} onChange={(e) => setCurrentTitle(e.target.value)}
                    placeholder="Software Engineer" className="field-input" />
                </Field>
                <Field label="Current company">
                  <input type="text" value={currentCompany} onChange={(e) => setCurrentCompany(e.target.value)}
                    placeholder="TechCorp" className="field-input" />
                </Field>
              </div>
              <Field label="Resume (PDF, DOC, TXT — max 5 MB) *">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="group w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center text-sm font-bold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                  {resumeFile ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="text-green-600">✓</span> {resumeFile.name}
                    </span>
                  ) : "Click to upload resume"}
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)} />
              </Field>
              {error && <ErrorMsg message={error} />}
              <button type="submit" disabled={isSubmitting}
                className="w-full rounded-md bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner /> AI is reviewing your resume…
                  </span>
                ) : "Check Resume Fit"}
              </button>
              </div>

              <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  Application flow
                </p>
                <div className="mt-4 space-y-3">
                  <ProcessItem number="1" title="Upload resume" text="Your resume is checked against the role requirements." />
                  <ProcessItem number="2" title="Answer screening" text="Matched candidates complete a timed role-specific screen." />
                  <ProcessItem number="3" title="Schedule interview" text="Strong scores unlock a quick AI video interview." />
                </div>
                <div className="mt-5 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                  Your details are used only for this hiring workflow and candidate evaluation.
                </div>
              </aside>
            </form>
          )}

          {stage === "matched" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-emerald-200 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold text-lg">✓</div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Resume matched</p>
                <p className="mt-2 text-5xl font-bold text-slate-950">{matchResult?.score}<span className="text-xl text-slate-400">/100</span></p>
                {matchResult?.reason && <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{matchResult.reason}</p>}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Next: a timed screening test — 8 multiple-choice + 2 open-ended questions (20 min limit).
              </div>
              {error && <ErrorMsg message={error} />}
              <button type="button" onClick={handleContinueToTest} disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                {isSubmitting ? <span className="flex items-center justify-center gap-2"><Spinner />Generating questions…</span> : "Continue to Test →"}
              </button>
            </div>
          )}

          {stage === "questions" && (
            <QuestionsStage
              matchResult={matchResult}
              questions={questions}
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

          {stage === "schedule" && (
            <ScheduleStage
              score={applyResult?.totalScore}
              slots={slots}
              isSubmitting={isSubmitting}
              error={error}
              onSchedule={handleSchedule}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Stage ───────────────────────────────────────────────────────────

function ScheduleStage({
  score,
  slots,
  isSubmitting,
  error,
  onSchedule,
}: {
  score?: number;
  slots: { date: string; label: string; times: { iso: string; label: string }[] }[];
  isSubmitting: boolean;
  error: string | null;
  onSchedule: (date: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-green-200 bg-gradient-to-b from-green-50 to-white p-5 text-center space-y-1">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold text-xl">🎉</div>
        <p className="text-xs font-bold uppercase tracking-widest text-green-600">You Passed the Screening!</p>
        {score !== undefined && (
          <p className="text-3xl font-bold text-slate-900">{score}<span className="text-base text-slate-400">/100</span></p>
        )}
        <p className="text-sm text-slate-600">Schedule your 3-minute AI video interview with Cal.com to continue.</p>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-bold text-slate-700">When would you like to interview?</p>

        {/* Immediate option */}
        <button
          onClick={() => onSchedule("immediate")}
          disabled={isSubmitting}
          className="w-full rounded-xl border-2 border-blue-500 bg-blue-50 px-4 py-4 text-left transition-colors hover:bg-blue-100 disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-lg">▶</span>
            <div>
              <p className="text-sm font-bold text-blue-800">Start Now</p>
              <p className="text-xs text-blue-600">Opens your AI video interview immediately (~3 min)</p>
            </div>
          </div>
        </button>

        {/* Date + time slot picker */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Or pick a Cal.com time slot</p>

          {/* Date tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {slots.map((slot) => (
              <button
                key={slot.date}
                onClick={() => setSelectedDate(slot.date === selectedDate ? null : slot.date)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                  selectedDate === slot.date
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                {slot.label}
              </button>
            ))}
          </div>

          {/* Time slots for selected date */}
          {selectedDate && (() => {
            const daySlots = slots.find((s) => s.date === selectedDate);
            return daySlots ? (
              <div className="grid grid-cols-4 gap-2">
                {daySlots.times.map(({ iso, label }) => (
                  <button
                    key={iso}
                    onClick={() => onSchedule(iso)}
                    disabled={isSubmitting}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {error && <ErrorMsg message={error} />}
      {isSubmitting && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Spinner /> Setting up your interview…
        </div>
      )}
    </div>
  );
}

// ─── Questions Stage ──────────────────────────────────────────────────────────

interface QuestionsStageProps {
  matchResult: MatchResult | null;
  questions: ScreeningQuestion[];
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
  matchResult, questions, answers, setAnswers, currentIndex, setCurrentIndex,
  timeLeft, isExpired, isSubmitting, error, setError, onSubmit, formatTime,
}: QuestionsStageProps) {
  const total = questions.length;
  const isLast = currentIndex === total - 1;
  const answeredCount = answers.filter((a) => a.trim()).length;
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  function handleNext() {
    if (!answers[currentIndex]?.trim()) { setError("Please answer this question before moving on."); return; }
    setError(null);
    setCurrentIndex(currentIndex + 1);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-sm font-bold text-blue-900">Resume match: {matchResult?.score ?? 0}/100</p>
        <div className={`rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums ${isExpired ? "bg-red-600 text-white" : "bg-white text-blue-700 border border-blue-200"}`}>
          {formatTime(timeLeft)}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Question {currentIndex + 1} of {total}</span>
          <span>{answeredCount}/{total} answered</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-bold text-slate-900 leading-snug">
          {currentIndex + 1}. {questions[currentIndex]?.text}
        </p>
        {questions[currentIndex]?.type === "mcq" ? (
          <div className="mt-4 space-y-2">
            {(questions[currentIndex] as MCQQuestion).options.map((option, optIdx) => (
              <label key={optIdx} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                answers[currentIndex] === String(optIdx) ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}>
                <input type="radio" name={`q-${currentIndex}`} value={String(optIdx)}
                  checked={answers[currentIndex] === String(optIdx)} disabled={isExpired}
                  onChange={() => {
                    const next = [...answers]; next[currentIndex] = String(optIdx); setAnswers(next);
                    if (error) setError(null);
                  }}
                  className="mt-0.5 shrink-0" />
                <span className="text-sm text-slate-800">
                  <span className="font-bold">{String.fromCharCode(65 + optIdx)}.</span> {option}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <textarea key={currentIndex} rows={6} value={answers[currentIndex] ?? ""} disabled={isExpired} autoFocus
            onChange={(e) => {
              const next = [...answers]; next[currentIndex] = e.target.value; setAnswers(next);
              if (error) setError(null);
            }}
            className="mt-4 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            placeholder="Write your answer here…"
          />
        )}
      </div>

      {isExpired && <ErrorMsg message="Time expired. Please close and restart the application." />}
      {error && <ErrorMsg message={error} />}

      <div className="flex gap-3">
        <button type="button" onClick={() => { setError(null); setCurrentIndex(currentIndex - 1); }}
          disabled={currentIndex === 0 || isExpired}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          ← Previous
        </button>
        {isLast ? (
          <button type="submit" disabled={isSubmitting || isExpired}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {isSubmitting ? <span className="flex items-center justify-center gap-2"><Spinner />Grading…</span> : "Submit Application"}
          </button>
        ) : (
          <button type="button" onClick={handleNext} disabled={isExpired}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}

// ─── Success / Rejected ───────────────────────────────────────────────────────

function SuccessState({
  result,
  scheduledConfirmation,
  onClose,
}: {
  result: ApplyResult | null;
  scheduledConfirmation: { date: string; meetingUrl?: string; message?: string } | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-5">
      {scheduledConfirmation ? (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-6 text-center space-y-2">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xl">📅</div>
          <p className="text-base font-bold text-slate-900">Interview Scheduled!</p>
          <p className="text-sm text-slate-600">Your AI video interview is confirmed for:</p>
          <p className="text-sm font-bold text-blue-800">{scheduledConfirmation.date}</p>
          <p className="text-xs text-slate-500">
            {scheduledConfirmation.message || "A confirmation email with your meeting link has been sent to your inbox."}
          </p>
          {scheduledConfirmation.meetingUrl && (
          <a
            href={scheduledConfirmation.meetingUrl}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Join AI Interview →
          </a>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-1">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold text-xl">✓</div>
          <p className="text-base font-bold text-slate-900">Application submitted</p>
          <p className="text-sm text-slate-500">Your resume and answers have been saved. Check your email for details.</p>
        </div>
      )}

      {result?.totalScore !== undefined && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">Screening score</span>
            <ScoreBadge score={result.totalScore} />
          </div>
          {result.overallFeedback && <p className="text-sm text-slate-600">{result.overallFeedback}</p>}
          {result.questions && result.questions.length > 0 && (
            <>
              <button type="button" onClick={() => setExpanded((x) => !x)}
                className="text-xs font-bold text-blue-600 hover:underline">
                {expanded ? "Hide" : "Show"} breakdown
              </button>
              {expanded && (
                <ol className="space-y-2 mt-1">
                  {result.questions.map((q, i) => (
                    <li key={i} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs text-slate-700 flex-1 leading-snug">{i + 1}. {q}</p>
                        <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-700">
                          {result.questionScores?.[i] ?? "—"}/10
                        </span>
                      </div>
                      {result.questionFeedback?.[i] && (
                        <p className="mt-1 text-xs text-slate-500">{result.questionFeedback[i]}</p>
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
        className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-700">
        Close
      </button>
    </div>
  );
}

function RejectedState({ matchResult, onClose }: { matchResult: MatchResult | null; onClose: () => void }) {
  return (
    <div className="space-y-4 py-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 font-bold text-xl">✕</div>
      <p className="text-base font-bold text-slate-900">Resume does not match this position</p>
      {typeof matchResult?.score === "number" && (
        <p className="text-sm font-bold text-red-600">Match score: {matchResult.score}/100</p>
      )}
      {matchResult?.reason && <p className="mx-auto max-w-lg text-sm text-slate-600">{matchResult.reason}</p>}
      <p className="text-xs text-slate-400">A notification has been sent to your inbox.</p>
      <button type="button" onClick={onClose}
        className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-700">
        Close
      </button>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function ScoreBadge({ score, small }: { score: number; small?: boolean }) {
  const color = score >= 75 ? "bg-green-100 text-green-700" : score >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";
  return (
    <span className={`rounded-md px-2.5 py-0.5 font-bold ${small ? "text-xs" : "text-sm"} ${color}`}>
      {score}/100
    </span>
  );
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
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

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StepRail({ step, status }: { step: number; status: Stage }) {
  const labels = ["Profile", "Resume", "Screen", "Interview"];

  return (
    <div className="grid grid-cols-4 border-t border-slate-100">
      {labels.map((label, index) => {
        const itemStep = index + 1;
        const isCurrent = itemStep === step && status !== "success";
        const isDone = status === "success" || itemStep < step;

        return (
          <div
            key={label}
            className={`border-r border-slate-100 px-3 py-2 last:border-r-0 ${
              isCurrent ? "bg-blue-50" : isDone ? "bg-slate-50" : "bg-white"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
                  isDone
                    ? "bg-blue-600 text-white"
                    : isCurrent
                      ? "bg-white text-blue-700 ring-1 ring-blue-200"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {itemStep}
              </span>
              <span
                className={`hidden truncate text-xs font-bold sm:block ${
                  isCurrent ? "text-blue-800" : "text-slate-500"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProcessItem({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-700">
        {number}
      </span>
      <div>
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p>
      </div>
    </div>
  );
}

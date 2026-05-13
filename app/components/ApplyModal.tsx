"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PublicApplicationQuestion } from "../jobs/[id]/JobPageClient";
import {
  useProctoring,
  type ProctoringStatus,
  type ProctoringViolation,
} from "./proctoring/useProctoring";
import CameraPreview from "./proctoring/CameraPreview";

interface Props {
  jobId: string;
  jobTitle: string;
  applicationQuestions: PublicApplicationQuestion[];
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
  meetingUrl?: string;
}

type Stage =
  | "details"
  | "matched"
  | "camera_consent"
  | "questions"
  | "rejected"
  | "terminated"
  | "success";

const STEP_META: Record<Stage, { eyebrow: string; title: string; step: number }> = {
  details: { eyebrow: "Step 1 of 3", title: "Candidate details", step: 1 },
  matched: { eyebrow: "Step 2 of 3", title: "Resume fit", step: 2 },
  camera_consent: { eyebrow: "Step 3 of 3", title: "Enable your camera", step: 3 },
  questions: { eyebrow: "Step 3 of 3", title: "Screening questions", step: 3 },
  success: { eyebrow: "Complete", title: "Application submitted", step: 3 },
  rejected: { eyebrow: "Review complete", title: "Resume screening result", step: 2 },
  terminated: { eyebrow: "Quiz ended", title: "Screening terminated", step: 3 },
};

function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Camera permission was denied. Click the camera icon in the address bar, set this site to Allow, then click the button again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No camera was found. Plug in a webcam (or enable your built-in one) and try again.";
      case "NotReadableError":
      case "TrackStartError":
        return "Your camera is being used by another app. Close Zoom, Teams, OBS, or any other app that might have the camera, then try again.";
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return "Your camera could not match the requested settings. Try a different camera if you have one connected.";
      case "SecurityError":
        return "Camera access is blocked because this page isn't on a secure (HTTPS) origin.";
      case "AbortError":
        return "Camera startup was interrupted. Try again.";
    }
    if (err.message) return `Camera error: ${err.message}`;
  }
  if (err instanceof Error && err.message) return `Camera error: ${err.message}`;
  return "Camera access failed. Try again, or use a different browser / device.";
}

const TERMINATION_MESSAGES: Record<ProctoringViolation, string> = {
  camera_denied:
    "Camera access was not granted. The screening quiz requires a working webcam.",
  camera_lost:
    "Your camera disconnected during the quiz. The screening was ended for integrity reasons.",
  tab_switch:
    "You switched to another tab during the quiz. Leaving the screening tab is not allowed.",
  window_blur:
    "You switched to another window during the quiz. The screening must stay focused.",
  multi_face:
    "More than one person was detected on camera. Screenings must be taken alone.",
  no_face:
    "We could not see your face for several seconds. Please stay in frame during the quiz.",
};

export default function ApplyModal({
  jobId,
  jobTitle,
  applicationQuestions,
  onClose,
}: Readonly<Props>) {
  const [stage, setStage] = useState<Stage>("details");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [applicationAnswers, setApplicationAnswers] = useState<string[]>(
    () => applicationQuestions.map(() => "")
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(20 * 60);
  const [answers, setAnswers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [terminationReason, setTerminationReason] = useState<ProctoringViolation | null>(null);

  const handleProctoringTerminate = useCallback((reason: ProctoringViolation) => {
    setTerminationReason(reason);
    setStage("terminated");
  }, []);

  const { videoRef, status: proctoringStatus, faceCount } = useProctoring({
    enabled: stage === "questions",
    onTerminate: handleProctoringTerminate,
  });

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

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function buildCandidateFormData() {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("email", email);
    fd.append("currentTitle", currentTitle);
    fd.append("currentCompany", currentCompany);
    if (resumeFile) fd.append("resume", resumeFile);
    if (applicationQuestions.length > 0) {
      fd.append("applicationQuestions", JSON.stringify(applicationQuestions));
      fd.append("applicationAnswers", JSON.stringify(applicationAnswers));
    }
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
    const missingIdx = applicationQuestions.findIndex(
      (q, i) => q.required && !applicationAnswers[i]?.trim()
    );
    if (missingIdx !== -1) {
      setError(`Please answer: "${applicationQuestions[missingIdx].question}"`);
      return;
    }
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
      setStage("camera_consent");
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  // The candidate explicitly grants camera permission here before the proctored
  // quiz starts. This avoids the awful UX of "Quiz terminated — camera denied"
  // appearing the instant the candidate hits an OS permission prompt they
  // weren't expecting.
  async function handleEnableCamera() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Try preferred constraints first, then fall back to bare { video: true }
      // — some webcams (and some Edge/Windows combos) reject the resolution or
      // facingMode hint with OverconstrainedError even when the camera works.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
      } catch (firstErr) {
        if (firstErr instanceof DOMException && firstErr.name === "OverconstrainedError") {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw firstErr;
        }
      }
      // Stop this probe stream immediately — useProctoring will acquire a fresh
      // one when the quiz stage mounts. The browser remembers the grant for
      // this tab, so the second request won't re-prompt the user.
      for (const track of stream.getTracks()) track.stop();
      setStage("questions");
    } catch (err) {
      setError(describeCameraError(err));
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
      if (data.meetingUrl) {
        window.location.href = data.meetingUrl;
        return;
      }
      setStage("success");
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    // Overlay: bottom-sheet on mobile, centered on sm+
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Dialog: full-width bottom sheet on mobile, max-w card on sm+ */}
      <div className="flex w-full flex-col sm:mx-4 sm:max-w-2xl lg:max-w-4xl rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white shadow-2xl"
        style={{ maxHeight: "92dvh" }}
      >
        {/* ── Sticky header ── */}
        <div className="shrink-0 border-b border-slate-200 bg-white rounded-t-2xl sm:rounded-t-xl">
          {/* Drag handle on mobile */}
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
          <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                  {currentStep.eyebrow}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  Apply for position
                </span>
              </div>
              <h2 className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                {currentStep.title}
              </h2>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-500">
                {jobTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.47 4.47a.75.75 0 0 1 1.06 0L8 6.94l2.47-2.47a.75.75 0 1 1 1.06 1.06L9.06 8l2.47 2.47a.75.75 0 1 1-1.06 1.06L8 9.06l-2.47 2.47a.75.75 0 0 1-1.06-1.06L6.94 8 4.47 5.53a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
          <StepRail step={currentStep.step} status={stage} />
        </div>

        {/* ── Scrollable body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {stage === "success" && <SuccessState result={applyResult} onClose={onClose} />}
          {stage === "rejected" && <RejectedState matchResult={matchResult} onClose={onClose} />}

          {stage === "details" && (
            <form onSubmit={handleCheckResume} className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                  <p className="font-bold text-blue-900">Start with your resume</p>
                  <p className="mt-0.5 leading-5 text-xs sm:text-sm">
                    Our AI checks your fit before unlocking timed screening questions.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="mt-3">
                  <Field label="Resume (PDF, DOC, TXT — max 5 MB) *">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                      {resumeFile ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span className="max-w-[200px] truncate">{resumeFile.name}</span>
                        </span>
                      ) : "Tap to upload resume"}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                      onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)} />
                  </Field>
                </div>

                {applicationQuestions.length > 0 && (
                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      A few quick questions
                    </p>
                    {applicationQuestions.map((q, i) => (
                      <ApplicationQuestionField
                        key={i}
                        question={q}
                        value={applicationAnswers[i] ?? ""}
                        onChange={(v) => {
                          const next = [...applicationAnswers];
                          next[i] = v;
                          setApplicationAnswers(next);
                          if (error) setError(null);
                        }}
                      />
                    ))}
                  </div>
                )}

                {error && <div className="mt-3"><ErrorMsg message={error} /></div>}
                <button type="submit" disabled={isSubmitting}
                  className="mt-4 w-full rounded-md bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> AI is reviewing your resume…
                    </span>
                  ) : "Check Resume Fit"}
                </button>
              </div>

              {/* Application flow sidebar — hidden on mobile to save space */}
              <aside className="hidden lg:block rounded-lg border border-slate-200 bg-white p-5 shadow-sm self-start">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  Application flow
                </p>
                <div className="mt-4 space-y-3">
                  <ProcessItem number="1" title="Upload resume" text="Your resume is checked against the role requirements." />
                  <ProcessItem number="2" title="Screening quiz" text="Matched candidates complete a timed role-specific test." />
                  <ProcessItem number="3" title="AI video interview" text="Complete a short AI interview — pass to book a call with our team." />
                </div>
                <div className="mt-5 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                  Your details are used only for this hiring workflow and candidate evaluation.
                </div>
              </aside>
            </form>
          )}

          {stage === "matched" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-white p-5 text-center shadow-sm">
                <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold text-lg">✓</div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Resume matched</p>
                <p className="mt-2 text-4xl sm:text-5xl font-bold text-slate-950">{matchResult?.score}<span className="text-lg text-slate-400">/100</span></p>
                {matchResult?.reason && <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{matchResult.reason}</p>}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                Next: a timed screening test — 8 multiple-choice + 2 open-ended questions (20 min limit).
              </div>
              {error && <ErrorMsg message={error} />}
              <button type="button" onClick={handleContinueToTest} disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                {isSubmitting ? <span className="flex items-center justify-center gap-2"><Spinner />Generating questions…</span> : "Continue to Test →"}
              </button>
            </div>
          )}

          {stage === "camera_consent" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-2xl">
                  <span aria-hidden>📷</span>
                </div>
                <h3 className="text-center text-base font-bold text-slate-900">
                  Camera access required
                </h3>
                <p className="mx-auto mt-2 max-w-md text-center text-sm leading-6 text-slate-600">
                  The screening quiz is proctored. We need to see you on camera to
                  verify it&apos;s you taking the test, alone and on this tab.
                </p>
                <ul className="mx-auto mt-4 max-w-md space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    <span>Your webcam stays on for the duration of the quiz.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    <span>No recording is stored — face count is checked in your browser.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-amber-600">!</span>
                    <span>
                      Switching tabs, leaving the camera, or anyone else in the frame
                      ends the quiz immediately.
                    </span>
                  </li>
                </ul>
                {error && <div className="mt-4"><ErrorMsg message={error} /></div>}
                <button
                  type="button"
                  onClick={handleEnableCamera}
                  disabled={isSubmitting}
                  className="mt-5 w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Waiting for camera permission…
                    </span>
                  ) : (
                    "Allow camera & start quiz"
                  )}
                </button>
                <p className="mt-2 text-center text-xs text-slate-500">
                  Your browser will ask for permission. Click &ldquo;Allow&rdquo;.
                </p>
              </div>
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
              videoRef={videoRef}
              proctoringStatus={proctoringStatus}
              faceCount={faceCount}
            />
          )}

          {stage === "terminated" && terminationReason && (
            <TerminatedState reason={terminationReason} onClose={onClose} />
          )}
        </div>
      </div>
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
  videoRef: RefObject<HTMLVideoElement | null>;
  proctoringStatus: ProctoringStatus;
  faceCount: number | null;
}

function QuestionsStage({
  matchResult, questions, answers, setAnswers, currentIndex, setCurrentIndex,
  timeLeft, isExpired, isSubmitting, error, setError, onSubmit, formatTime,
  videoRef, proctoringStatus, faceCount,
}: Readonly<QuestionsStageProps>) {
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
    <form onSubmit={onSubmit} className="space-y-3">
      {/* Timer + match bar + camera */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
        <p className="text-xs font-bold text-blue-900 sm:text-sm">Match: {matchResult?.score ?? 0}/100</p>
        <div className={`rounded-lg px-3 py-1 text-sm font-bold tabular-nums ${isExpired ? "bg-red-600 text-white" : "bg-white text-blue-700 border border-blue-200"}`}>
          {formatTime(timeLeft)}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <CameraPreview videoRef={videoRef} status={proctoringStatus} faceCount={faceCount} />
        <div className="flex-1 text-xs leading-5 text-amber-900">
          <p className="font-bold">Proctored quiz</p>
          <p className="mt-1">
            Stay alone in frame, in this tab. Switching tabs or windows, leaving the camera, or
            anyone else appearing in the frame will end the quiz immediately.
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Question {currentIndex + 1} of {total}</span>
          <span>{answeredCount}/{total} answered</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Question card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="text-sm font-bold text-slate-900 leading-snug">
          {currentIndex + 1}. {questions[currentIndex]?.text}
        </p>
        {questions[currentIndex]?.type === "mcq" ? (
          <div className="mt-3 space-y-2">
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
          <textarea key={currentIndex} rows={4} value={answers[currentIndex] ?? ""} disabled={isExpired} autoFocus
            onChange={(e) => {
              const next = [...answers]; next[currentIndex] = e.target.value; setAnswers(next);
              if (error) setError(null);
            }}
            className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 sm:rows-6"
            placeholder="Write your answer here…"
          />
        )}
      </div>

      {isExpired && <ErrorMsg message="Time expired. Please close and restart the application." />}
      {error && <ErrorMsg message={error} />}

      {/* Navigation */}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={() => { setError(null); setCurrentIndex(currentIndex - 1); }}
          disabled={currentIndex === 0 || isExpired}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          ← Prev
        </button>
        {isLast ? (
          <button type="submit" disabled={isSubmitting || isExpired}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {isSubmitting ? <span className="flex items-center justify-center gap-2"><Spinner />Grading…</span> : "Submit"}
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
  onClose,
}: {
  result: ApplyResult | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center space-y-1">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold text-xl">✓</div>
        <p className="text-base font-bold text-slate-900">Application submitted</p>
        <p className="text-sm text-slate-500">Your resume and answers have been saved. Check your email for details.</p>
      </div>

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

function TerminatedState({
  reason,
  onClose,
}: Readonly<{
  reason: ProctoringViolation;
  onClose: () => void;
}>) {
  return (
    <div className="space-y-4 py-4 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700 font-bold text-xl">!</div>
      <p className="text-base font-bold text-slate-900">Screening quiz ended</p>
      <p className="mx-auto max-w-md text-sm text-slate-600">
        {TERMINATION_MESSAGES[reason]}
      </p>
      <p className="text-xs text-slate-400">Your application has not been submitted.</p>
      <button type="button" onClick={onClose}
        className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-700">
        Close
      </button>
    </div>
  );
}

function RejectedState({ matchResult, onClose }: { matchResult: MatchResult | null; onClose: () => void }) {
  return (
    <div className="space-y-4 py-4 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700 font-bold text-xl">✕</div>
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

function ApplicationQuestionField({
  question,
  value,
  onChange,
}: Readonly<{
  question: PublicApplicationQuestion;
  value: string;
  onChange: (v: string) => void;
}>) {
  const label = `${question.question}${question.required ? " *" : ""}`;
  if (question.kind === "long_text") {
    return (
      <Field label={label}>
        <textarea
          rows={3}
          required={question.required}
          value={value}
          placeholder={question.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="field-input resize-none"
        />
      </Field>
    );
  }
  return (
    <Field label={label}>
      <input
        type={question.kind === "number" ? "number" : "text"}
        inputMode={question.kind === "number" ? "numeric" : undefined}
        min={question.kind === "number" ? 0 : undefined}
        required={question.required}
        value={value}
        placeholder={question.placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="field-input"
      />
    </Field>
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
  const labels = ["Profile", "Resume", "Screen"];

  return (
    <div className="grid grid-cols-3 border-t border-slate-100">
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
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
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
                className={`truncate text-xs font-bold ${
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

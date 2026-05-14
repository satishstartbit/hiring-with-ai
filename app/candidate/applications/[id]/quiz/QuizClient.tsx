"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CameraPreview from "../../../../components/proctoring/CameraPreview";
import {
  useProctoring,
  type ProctoringViolation,
} from "../../../../components/proctoring/useProctoring";

interface PublicQuestion {
  type: "mcq" | "descriptive";
  text: string;
  options?: string[];
}

interface QuizResponse {
  questions: PublicQuestion[];
  timeLimitSeconds: number;
  error?: string;
}

interface SubmitResponse {
  totalScore: number;
  questionScores: number[];
  questionFeedback: string[];
  overallFeedback: string;
  stage: string;
  error?: string;
}

type Phase = "loading" | "ready" | "submitting" | "submitted" | "error";

const VIOLATION_MESSAGES: Record<ProctoringViolation, string> = {
  camera_denied: "Camera access was denied. The quiz cannot continue without it.",
  camera_lost: "Camera was disconnected. The quiz cannot continue without it.",
  tab_switch: "You switched away from the quiz tab.",
  window_blur: "You moved focus away from the quiz window.",
  multi_face: "More than one person was detected in front of the camera.",
  no_face: "We can't see you in the camera. Please stay in frame.",
  voice_detected: "Voice was detected. Please remain silent during the quiz.",
};

function formatTime(s: number): string {
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function QuizClient({ applicationId }: Readonly<{ applicationId: string }>) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const submittedOnceRef = useRef(false);

  // Proctoring state — separate from `phase` so the consent screen and
  // warning modal can overlay any quiz phase without rewriting the state machine.
  const [consentGiven, setConsentGiven] = useState(false);
  const [warningModal, setWarningModal] = useState<ProctoringViolation | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState<ProctoringViolation | null>(null);
  const violationCountRef = useRef(0);
  const answersRef = useRef<string[]>([]);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/candidate/applications/${applicationId}/quiz`, {
          method: "GET",
        });
        const data: QuizResponse = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Failed to load the quiz");
          setPhase("error");
          return;
        }
        setQuestions(data.questions);
        setAnswers(data.questions.map(() => ""));
        setTimeLeft(data.timeLimitSeconds);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setError("Network error — please refresh and try again");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittedOnceRef.current) return;
      if (!auto && answers.some((a) => !a.trim())) {
        setError("Please answer every question before submitting.");
        return;
      }
      submittedOnceRef.current = true;
      setPhase("submitting");
      setError(null);
      try {
        const res = await fetch(`/api/candidate/applications/${applicationId}/quiz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
        const data: SubmitResponse = await res.json();
        if (!res.ok) {
          submittedOnceRef.current = false;
          setError(data.error ?? "Submission failed. Please try again.");
          setPhase("ready");
          return;
        }
        setPhase("submitted");
        router.refresh();
        router.push(`/candidate/applications/${applicationId}`);
      } catch {
        submittedOnceRef.current = false;
        setError("Network error — please try again.");
        setPhase("ready");
      }
    },
    [answers, applicationId, router]
  );

  // ─── Proctoring: violation → warning, second violation → force-close ──────
  const forceClose = useCallback(
    async (reason: ProctoringViolation) => {
      if (submittedOnceRef.current) return;
      submittedOnceRef.current = true;
      setTerminated(true);
      setTerminationReason(reason);
      setWarningModal(null);
      try {
        await fetch(
          `/api/candidate/applications/${applicationId}/proctoring/violation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: reason,
              level: "terminate",
              answers: answersRef.current,
            }),
          }
        );
      } catch {
        // Network failed but we still terminate the candidate-side UI.
      }
      router.refresh();
      // Hold the termination screen for a beat so the candidate reads it.
      window.setTimeout(() => {
        router.push(`/candidate/applications/${applicationId}`);
      }, 4000);
    },
    [applicationId, router]
  );

  const handleViolation = useCallback(
    (reason: ProctoringViolation) => {
      if (terminated || submittedOnceRef.current) return;
      const fatal = reason === "camera_denied" || reason === "camera_lost";
      violationCountRef.current += 1;
      const isFirst = violationCountRef.current === 1 && !fatal;

      // Best-effort log — don't block the UI on it.
      fetch(`/api/candidate/applications/${applicationId}/proctoring/violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: reason,
          level: isFirst ? "warning" : "terminate",
        }),
      }).catch(() => undefined);

      if (isFirst) {
        setWarningModal(reason);
      } else {
        forceClose(reason);
      }
    },
    [applicationId, forceClose, terminated]
  );

  const proctoringEnabled = consentGiven && phase === "ready" && !terminated;
  const { videoRef, status, faceCount, detectorReady, stop } = useProctoring({
    enabled: proctoringEnabled,
    onViolation: handleViolation,
  });

  // Once the quiz is submitted (or force-closed), stop the camera/mic.
  useEffect(() => {
    if (phase === "submitted" || terminated) stop();
  }, [phase, terminated, stop]);

  useEffect(() => {
    if (phase !== "ready" || timeLeft <= 0 || isExpired || !consentGiven) return;
    const timer = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timer);
          setIsExpired(true);
          submit(true).catch(() => undefined);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, timeLeft, isExpired, submit, consentGiven]);

  const total = questions.length;
  const answeredCount = useMemo(() => answers.filter((a) => a.trim()).length, [answers]);
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const current = questions[currentIndex];
  const isLast = currentIndex === total - 1;

  if (phase === "loading") {
    return (
      <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            <span className="animate-pulse text-lg font-bold">AI</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">AI is generating your quiz</p>
            <p className="mt-1 text-sm text-slate-600">
              We&apos;re preparing role-specific questions for you. This usually takes a few seconds.
            </p>
            <div className="mt-4 h-2 w-56 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (terminated) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="text-base font-bold text-rose-900">Quiz closed</h2>
        <p className="mt-2 text-sm text-rose-800">
          {terminationReason
            ? VIOLATION_MESSAGES[terminationReason]
            : "A proctoring violation was detected."}
        </p>
        <p className="mt-3 text-sm text-rose-700">
          Your application has been flagged for recruiter review. Returning to your application page…
        </p>
      </div>
    );
  }

  // ── Consent gate — shown before the quiz form so the candidate explicitly
  // opts into the camera + mic before MediaPipe / getUserMedia fires.
  if (!consentGiven) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Proctoring rules</h2>
        <p className="mt-1 text-sm text-slate-600">
          This is a monitored assessment. Before you start, please review the rules below.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          <li className="flex gap-2">
            <span className="text-indigo-600">•</span>
            We need access to your <strong>camera</strong> and <strong>microphone</strong> for the duration of the quiz.
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600">•</span>
            Only <strong>you</strong> should be visible. A second person in frame ends the quiz.
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600">•</span>
            Please stay in frame and <strong>do not talk</strong> while the quiz is running.
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600">•</span>
            Do not switch tabs, windows, or apps until you have submitted.
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600">•</span>
            The first violation is a <strong>warning</strong>. A second violation will <strong>close the quiz</strong> and flag your application for review.
          </li>
        </ul>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => router.push(`/candidate/applications/${applicationId}`)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setConsentGiven(true)}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            I agree — start camera and quiz
          </button>
        </div>
      </div>
    );
  }

  function setAnswer(value: string) {
    const next = [...answers];
    next[currentIndex] = value;
    setAnswers(next);
    if (error) setError(null);
  }

  function handleNext() {
    if (!answers[currentIndex]?.trim()) {
      setError("Please answer this question before moving on.");
      return;
    }
    setError(null);
    setCurrentIndex(currentIndex + 1);
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false).catch(() => undefined);
        }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900">
          <span>
            Question {currentIndex + 1} of {total}
          </span>
          <span
            className={`rounded-md px-2.5 py-1 tabular-nums ${
              isExpired ? "bg-rose-600 text-white" : "bg-white text-indigo-700"
            }`}
          >
            {formatTime(timeLeft)}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{answeredCount}/{total} answered</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-bold text-slate-900">
            {currentIndex + 1}. {current?.text}
          </p>

          {current?.type === "mcq" ? (
            <div className="mt-3 space-y-2">
              {(current.options ?? []).map((option, optIdx) => {
                const selected = answers[currentIndex] === String(optIdx);
                return (
                  <label
                    key={`${optIdx}-${option}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      selected
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${currentIndex}`}
                      value={String(optIdx)}
                      checked={selected}
                      disabled={isExpired}
                      onChange={() => setAnswer(String(optIdx))}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-slate-800">
                      <span className="font-bold">{String.fromCharCode(65 + optIdx)}.</span> {option}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <textarea
              key={currentIndex}
              rows={5}
              value={answers[currentIndex] ?? ""}
              disabled={isExpired}
              onChange={(e) => setAnswer(e.target.value)}
              className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
              placeholder="Write your answer here…"
            />
          )}
        </div>

        {isExpired && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            Time’s up — we submitted what you had. You can review the result on your application page.
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCurrentIndex(Math.max(0, currentIndex - 1));
            }}
            disabled={currentIndex === 0 || isExpired || phase === "submitting"}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Previous
          </button>
          {isLast ? (
            <button
              type="submit"
              disabled={isExpired || phase === "submitting"}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {phase === "submitting" ? "Submitting…" : "Submit quiz"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={isExpired}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Next →
            </button>
          )}
        </div>

        {phase === "submitting" && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            AI is reviewing your quiz answers and preparing your next step...
          </div>
        )}
      </form>

      {/* Sticky proctoring preview — visible the entire time the quiz is open. */}
      <div className="fixed bottom-4 right-4 z-40">
        <CameraPreview
          videoRef={videoRef}
          status={status}
          faceCount={faceCount}
          detectorReady={detectorReady}
        />
      </div>

      {warningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <span className="text-xl font-bold">!</span>
              </span>
              <h2 className="text-base font-bold text-slate-900">Warning</h2>
            </div>
            <p className="mt-3 text-sm text-slate-700">
              {VIOLATION_MESSAGES[warningModal]}
            </p>
            <p className="mt-3 text-sm font-semibold text-amber-800">
              This is your only warning. If it happens again, the quiz will close and your application will be flagged.
            </p>
            <button
              type="button"
              onClick={() => setWarningModal(null)}
              className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              I understand — continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

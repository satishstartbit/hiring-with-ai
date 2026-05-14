"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CameraPreview from "../../../../components/proctoring/CameraPreview";
import {
  useProctoring,
  type ProctoringViolation,
  type ProctoringConfig,
} from "../../../../components/proctoring/useProctoring";
import CodeEditor from "../../../../components/quiz/CodeEditor";

type PublicQuestionType = "mcq" | "multi_select" | "descriptive" | "coding";

interface PublicQuestion {
  type: PublicQuestionType;
  text: string;
  options?: string[];
  language?: string;
  starterCode?: string;
}

interface ClientAntiCheat {
  tabSwitchDetection: boolean;
  fullscreenRequired: boolean;
  blockCopyPaste: boolean;
  maxViolations: number;
}

interface ClientConfig {
  passingPercent: number;
  enabledTypes: string[];
  difficulty: string;
  skills: string[];
  durationMinutes: number;
  questionCount: number;
  codingLanguages: string[];
  antiCheat: ClientAntiCheat;
}

interface QuizResponse {
  questions: PublicQuestion[];
  timeLimitSeconds: number;
  config: ClientConfig;
  error?: string;
}

interface SubmitResponse {
  totalScore: number;
  questionScores: number[];
  questionFeedback: string[];
  overallFeedback: string;
  stage: string;
  passed: boolean;
  passingPercent: number;
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
  fullscreen_exit: "You exited fullscreen mode. Fullscreen is required for this quiz.",
  copy_paste: "Copy / paste is disabled during this quiz.",
};

// Pretty labels for the consent screen so the candidate sees what HR enabled.
const TYPE_LABELS: Record<string, string> = {
  mcq: "single-correct MCQs",
  multi_select: "multi-select questions",
  short_answer: "short written answers",
  scenario: "scenario questions",
  descriptive: "written answers",
  coding: "coding problems",
  debugging: "debugging problems",
  sql: "SQL queries",
  video: "video responses",
  voice: "voice responses",
};

function formatTime(s: number): string {
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Each step: the message shown, and how long (ms) before advancing to the next.
// The last step has no delay — it holds until the request resolves.
const LOADING_STEPS: { label: string; detail: string; holdMs: number }[] = [
  {
    label: "Reviewing the job role",
    detail: "Reading the job description, requirements, and your recruiter's assessment setup.",
    holdMs: 4000,
  },
  {
    label: "Researching question topics",
    detail: "Searching for realistic, role-specific topics to base your questions on.",
    holdMs: 9000,
  },
  {
    label: "Writing your questions",
    detail: "Generating role-specific questions across the configured formats and difficulty.",
    holdMs: 20000,
  },
  {
    label: "Finalizing your quiz",
    detail: "Validating every question and locking in your question set.",
    holdMs: 0,
  },
];

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export default function QuizClient({ applicationId }: Readonly<{ applicationId: string }>) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const submittedOnceRef = useRef(false);

  // Staged messages shown while the quiz generates. These mirror the real
  // server pipeline (config load → web research → LLM generation → validation),
  // advancing on a timer since the GET is a single blocking call.
  const [loadingStep, setLoadingStep] = useState(0);
  const [consentGiven, setConsentGiven] = useState(false);
  const [warningModal, setWarningModal] = useState<{
    reason: ProctoringViolation;
    remaining: number;
  } | null>(null);
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
        const res = await fetch(`/api/candidate/applications/${applicationId}/quiz`);
        const data: QuizResponse = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Failed to load the quiz");
          setPhase("error");
          return;
        }
        setQuestions(data.questions);
        setConfig(data.config);
        // Pre-fill coding answers with the starter code so the candidate sees
        // a working scaffold and isn't blocked by the "answer every question"
        // validator before they've even written anything.
        setAnswers(
          data.questions.map((q) => (q.type === "coding" ? q.starterCode ?? "" : ""))
        );
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

  // Advance the loading-stage messages while the quiz is being generated.
  useEffect(() => {
    if (phase !== "loading") return;
    const timers: number[] = [];
    let elapsed = 0;
    for (let i = 0; i < LOADING_STEPS.length - 1; i++) {
      elapsed += LOADING_STEPS[i].holdMs;
      const step = i + 1;
      timers.push(window.setTimeout(() => setLoadingStep(step), elapsed));
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [phase]);

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
        // intentionally ignore — terminate UI still proceeds
      }
      router.refresh();
      window.setTimeout(() => {
        router.push(`/candidate/applications/${applicationId}`);
      }, 4000);
    },
    [applicationId, router]
  );

  const abortQuiz = useCallback(
    async (reason: ProctoringViolation) => {
      if (submittedOnceRef.current) return;
      setTerminated(true);
      setTerminationReason(reason);
      setWarningModal(null);
      try {
        await fetch(
          `/api/candidate/applications/${applicationId}/proctoring/violation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: reason, level: "warning" }),
          }
        );
      } catch {
        // diagnostic log only
      }
      window.setTimeout(() => {
        router.push(`/candidate/applications/${applicationId}`);
      }, 4000);
    },
    [applicationId, router]
  );

  const handleViolation = useCallback(
    (reason: ProctoringViolation) => {
      if (terminated || submittedOnceRef.current) return;

      if (reason === "camera_denied" || reason === "camera_lost") {
        abortQuiz(reason);
        return;
      }

      violationCountRef.current += 1;
      // maxViolations from config is the total number of violations that
      // triggers termination. Each one before that is a warning. Default 1
      // means first violation closes (no warning).
      const limit = config?.antiCheat.maxViolations ?? 1;
      const isTerminating = violationCountRef.current >= limit;

      fetch(`/api/candidate/applications/${applicationId}/proctoring/violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: reason,
          level: isTerminating ? "terminate" : "warning",
        }),
      }).catch(() => undefined);

      if (isTerminating) {
        forceClose(reason);
      } else {
        setWarningModal({ reason, remaining: limit - violationCountRef.current });
      }
    },
    [abortQuiz, applicationId, config, forceClose, terminated]
  );

  const proctoringEnabled = consentGiven && phase === "ready" && !terminated;
  const proctoringConfig: ProctoringConfig = useMemo(
    () => ({
      tabSwitchDetection: config?.antiCheat.tabSwitchDetection ?? true,
      blockCopyPaste: config?.antiCheat.blockCopyPaste ?? false,
      fullscreenRequired: config?.antiCheat.fullscreenRequired ?? false,
    }),
    [config]
  );
  const { videoRef, status, faceCount, detectorReady, stop } = useProctoring({
    enabled: proctoringEnabled,
    config: proctoringConfig,
    onViolation: handleViolation,
  });

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
    const step = LOADING_STEPS[loadingStep];
    const pct = Math.round(((loadingStep + 1) / LOADING_STEPS.length) * 100);
    return (
      <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            <span className="animate-pulse text-lg font-bold">AI</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{step.label}…</p>
            <p className="mt-1 text-sm text-slate-600">{step.detail}</p>
            <div className="mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <ol className="mt-4 space-y-1.5">
              {LOADING_STEPS.map((s, i) => (
                <li
                  key={s.label}
                  className={`flex items-center gap-2 text-xs ${
                    i < loadingStep
                      ? "text-emerald-600"
                      : i === loadingStep
                        ? "font-semibold text-indigo-700"
                        : "text-slate-400"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
                      i < loadingStep
                        ? "bg-emerald-100 text-emerald-700"
                        : i === loadingStep
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {i < loadingStep ? "✓" : i + 1}
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
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
    const isCameraIssue =
      terminationReason === "camera_denied" || terminationReason === "camera_lost";
    if (isCameraIssue) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-base font-bold text-amber-900">Camera unavailable</h2>
          <p className="mt-2 text-sm text-amber-800">
            {terminationReason ? VIOLATION_MESSAGES[terminationReason] : ""}
          </p>
          <p className="mt-3 text-sm text-amber-800">
            No worries — your quiz wasn&apos;t submitted. Fix your camera (check
            browser permissions or reconnect the device) and come back to start
            again. Returning to your application page…
          </p>
        </div>
      );
    }
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

  // ── Consent gate ────────────────────────────────────────────────────────
  if (!consentGiven) {
    const typeLabels = (config?.enabledTypes ?? [])
      .map((t) => TYPE_LABELS[t] ?? t)
      .filter((s, i, arr) => arr.indexOf(s) === i);
    const formatList = typeLabels.length > 0 ? joinList(typeLabels) : "a mix of questions";
    const minutes = config?.durationMinutes ?? Math.round((timeLeft || 1200) / 60);
    const count = config?.questionCount ?? questions.length;
    const passingPercent = config?.passingPercent ?? 0;
    const antiCheat = config?.antiCheat;
    return (
      <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Before you start</h2>
        <p className="mt-1 text-sm text-slate-600">
          You&apos;ll have {minutes} minutes for around {count} questions ({formatList}).
          {passingPercent > 0 && (
            <> You need at least <strong>{passingPercent}/100</strong> to move on to the AI interview.</>
          )}
        </p>

        <h3 className="mt-5 text-sm font-bold text-slate-900">Proctoring rules</h3>
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
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
          {antiCheat?.tabSwitchDetection && (
            <li className="flex gap-2">
              <span className="text-indigo-600">•</span>
              Do not switch tabs, windows, or apps until you have submitted.
            </li>
          )}
          {antiCheat?.fullscreenRequired && (
            <li className="flex gap-2">
              <span className="text-indigo-600">•</span>
              The quiz runs in <strong>fullscreen</strong>. Exiting fullscreen counts as a violation.
            </li>
          )}
          {antiCheat?.blockCopyPaste && (
            <li className="flex gap-2">
              <span className="text-indigo-600">•</span>
              Copy / paste is <strong>disabled</strong>. Right-click is disabled.
            </li>
          )}
          <li className="flex gap-2">
            <span className="text-indigo-600">•</span>
            You get <strong>{Math.max(0, (antiCheat?.maxViolations ?? 1) - 1)} warning(s)</strong> before the quiz auto-closes and your application is flagged.
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

  function toggleMultiSelectChoice(optIdx: number) {
    const current = answers[currentIndex] ?? "";
    let selected: number[] = [];
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (Array.isArray(parsed)) {
          selected = parsed.filter(
            (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 3
          );
        }
      } catch {
        // fall back to empty
      }
    }
    const has = selected.includes(optIdx);
    const next = has ? selected.filter((n) => n !== optIdx) : [...selected, optIdx].sort((a, b) => a - b);
    setAnswer(JSON.stringify(next));
  }

  function isMultiSelectChecked(optIdx: number): boolean {
    const current = answers[currentIndex] ?? "";
    if (!current) return false;
    try {
      const parsed = JSON.parse(current);
      return Array.isArray(parsed) && parsed.includes(optIdx);
    } catch {
      return false;
    }
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
      {/* Proctoring preview — inline at the top on mobile so it never overlaps
          the submit button; floats bottom-right on desktop where there's room. */}
      <div className="mb-4 flex justify-center lg:fixed lg:bottom-4 lg:right-4 lg:z-40 lg:mb-0 lg:block">
        <CameraPreview
          videoRef={videoRef}
          status={status}
          faceCount={faceCount}
          detectorReady={detectorReady}
        />
      </div>

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

          {current?.type === "mcq" && (
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
          )}

          {current?.type === "multi_select" && (
            <div className="mt-3 space-y-2">
              <p className="text-xs italic text-slate-500">Select all that apply.</p>
              {(current.options ?? []).map((option, optIdx) => {
                const checked = isMultiSelectChecked(optIdx);
                return (
                  <label
                    key={`${optIdx}-${option}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      checked
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isExpired}
                      onChange={() => toggleMultiSelectChoice(optIdx)}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-slate-800">
                      <span className="font-bold">{String.fromCharCode(65 + optIdx)}.</span> {option}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {current?.type === "descriptive" && (
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

          {current?.type === "coding" && (
            <CodeEditor
              language={current.language ?? "javascript"}
              value={answers[currentIndex] ?? ""}
              onChange={setAnswer}
              disabled={isExpired}
              runnable={current.language !== "sql"}
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
              {VIOLATION_MESSAGES[warningModal.reason]}
            </p>
            <p className="mt-3 text-sm font-semibold text-amber-800">
              {warningModal.remaining <= 0
                ? "Your next violation will close the quiz."
                : `${warningModal.remaining} more violation${
                    warningModal.remaining === 1 ? "" : "s"
                  } will close the quiz and flag your application.`}
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

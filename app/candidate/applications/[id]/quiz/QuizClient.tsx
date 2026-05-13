"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

  // ─── Timer ──────────────────────────────────────────────────────────────
  // Memoize submit() so the timer effect doesn't have to re-bind it.
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

  useEffect(() => {
    if (phase !== "ready" || timeLeft <= 0 || isExpired) return;
    const timer = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timer);
          setIsExpired(true);
          // Auto-submit whatever the candidate has when time's up.
          submit(true).catch(() => undefined);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, timeLeft, isExpired, submit]);

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
  );
}

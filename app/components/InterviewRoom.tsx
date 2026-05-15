"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  INTERVIEW_PASSING_SCORE,
  INTERVIEW_QUESTION_COUNT,
} from "../lib/interviewConfig";
import {
  useProctoring,
  type ProctoringViolation,
} from "./proctoring/useProctoring";

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionResultList {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type Phase =
  | "loading"
  | "waiting"
  | "permission"
  | "ready"
  | "ai_speaking"
  | "listening"
  | "processing"
  | "grading"
  | "completed"
  | "error";

interface SessionAntiCheat {
  tabSwitchDetection: boolean;
  blockCopyPaste: boolean;
  fullscreenRequired: boolean;
  webcamMonitoring: boolean;
  maxViolations: number;
}

interface SessionInterviewConfig {
  durationMinutes: number;
  passingScore: number;
}

interface SessionData {
  jobId?: string;
  candidateId?: string;
  jobTitle: string;
  candidateName: string;
  status: string;
  scheduledAt: string;
  totalQuestions: number;
  currentQuestionIndex: number;
  conversationHistory: { role: string; content: string }[];
  totalScore?: number;
  overallFeedback?: string;
  questionScores?: number[];
  questionFeedback?: string[];
  resumeMatchScore?: number;
  answerScore?: number;
  antiCheat?: SessionAntiCheat;
  interviewConfig?: SessionInterviewConfig;
}

interface SlotDay {
  date: string;
  label: string;
  times: { iso: string; label: string }[];
}

interface InterviewResult {
  totalScore: number;
  overallFeedback: string;
  questionScores: number[];
  questionFeedback: string[];
}

const SILENCE_TIMEOUT_MS = 2500;
const MIN_WORDS = 10;

// Mirrors the quiz round's violation copy so candidates see consistent
// language across the two assessment stages.
const VIOLATION_MESSAGES: Record<ProctoringViolation, string> = {
  camera_denied: "Camera access was denied. The interview cannot continue without it.",
  camera_lost: "Camera was disconnected. The interview cannot continue without it.",
  tab_switch: "You switched away from the interview tab.",
  window_blur: "You moved focus away from the interview window.",
  multi_face: "More than one person was detected in front of the camera.",
  no_face: "We can't see you in the camera. Please stay in frame.",
  voice_detected: "Background voices were detected. Please be in a quiet space.",
  fullscreen_exit: "You exited fullscreen mode. Fullscreen is required for this interview.",
  copy_paste: "Copy / paste is disabled during this interview.",
};

// Browsers only expose camera/mic on a secure context. HTTPS, localhost,
// 127.0.0.1, and ::1 are allowed; everything else (LAN IPs, custom hosts on
// plain http) gets a null `navigator.mediaDevices`. Detect that early so the
// candidate sees a clear message instead of a spinner that never resolves.
function isSecureMediaOrigin(): boolean {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export default function InterviewRoom({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [insecureOrigin, setInsecureOrigin] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(INTERVIEW_QUESTION_COUNT);
  const [aiText, setAiText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCamEnabled, setIsCamEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Post-interview scheduling state
  const [scheduleStep, setScheduleStep] = useState<"scores" | "picking" | "done">("scores");
  const [slots, setSlots] = useState<SlotDay[]>([]);
  const [selectedSlotDate, setSelectedSlotDate] = useState<string | null>(null);
  const [scheduledInfo, setScheduledInfo] = useState<{ date: string; message?: string } | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef("");
  // Ref so startListening can call submitAnswer without a circular useCallback dependency
  const submitAnswerRef = useRef<(answer: string) => void>(() => {});

  // Proctoring violations — count toward an HR-configured `maxViolations`
  // budget. Each non-fatal violation surfaces a blocking modal; once the
  // budget is exhausted the interview is force-closed. Camera denied / lost
  // is treated as an environment abort, not a counted violation (mirrors the
  // quiz round so the candidate can recover by fixing their camera).
  const [warningModal, setWarningModal] = useState<{
    reason: ProctoringViolation;
    remaining: number;
  } | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [terminationReason, setTerminationReason] =
    useState<ProctoringViolation | null>(null);
  const violationCountRef = useRef(0);
  const terminatedRef = useRef(false);

  // ── Proctoring + camera (owned by useProctoring) ────────────────────────────
  // The hook acquires the camera+mic stream, runs face detection at 2.5fps, and
  // emits violations. We enable it as soon as the session loads (so the
  // candidate sees a live preview on the "ready" screen) and keep it running
  // through the active interview.
  //
  // IMPORTANT: don't try to start the hook on an insecure origin — browsers
  // make `navigator.mediaDevices` undefined there, and the hook would hang on
  // "requesting" forever (this is why the page got stuck when accessed via a
  // LAN IP). The insecureOrigin error screen is rendered before this can fire.
  const proctoringEnabled =
    !insecureOrigin &&
    !terminated &&
    phase !== "loading" &&
    phase !== "error" &&
    phase !== "completed";
  // Mirror the HR-controlled AssessmentConfig.antiCheat over to the proctoring
  // hook. Webcam monitoring + fullscreen are the candidate-visible knobs HR
  // toggles per job; if disabled here we skip the camera entirely.
  const proctoringConfig = useMemo(
    () => ({
      tabSwitchDetection: session?.antiCheat?.tabSwitchDetection ?? true,
      blockCopyPaste: session?.antiCheat?.blockCopyPaste ?? false,
      fullscreenRequired: session?.antiCheat?.fullscreenRequired ?? false,
      webcamMonitoring: session?.antiCheat?.webcamMonitoring ?? false,
    }),
    [session?.antiCheat]
  );

  // Camera permission / device errors abort the interview without flagging
  // the candidate — they can come back once they fix the environment.
  const abortInterview = useCallback(
    async (reason: ProctoringViolation) => {
      if (terminatedRef.current) return;
      terminatedRef.current = true;
      setTerminated(true);
      setTerminationReason(reason);
      setWarningModal(null);
      try {
        await fetch(`/api/interview/${sessionId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: reason, level: "warning" }),
        });
      } catch {
        // diagnostic log only — abort UI still proceeds
      }
      const candidateId = session?.candidateId;
      window.setTimeout(() => {
        if (candidateId) {
          window.location.href = `/candidate/applications/${candidateId}`;
        }
      }, 4000);
    },
    [sessionId, session?.candidateId]
  );

  // Hard close + flag the candidate. Used once the violation budget is spent.
  const forceCloseInterview = useCallback(
    async (reason: ProctoringViolation) => {
      if (terminatedRef.current) return;
      terminatedRef.current = true;
      setTerminated(true);
      setTerminationReason(reason);
      setWarningModal(null);
      try {
        await fetch(`/api/interview/${sessionId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: reason, level: "terminate" }),
        });
      } catch {
        // intentionally ignore — terminate UI still proceeds
      }
      const candidateId = session?.candidateId;
      window.setTimeout(() => {
        if (candidateId) {
          window.location.href = `/candidate/applications/${candidateId}`;
        }
      }, 4000);
    },
    [sessionId, session?.candidateId]
  );

  const handleViolation = useCallback(
    (reason: ProctoringViolation) => {
      if (terminatedRef.current) return;

      if (reason === "camera_denied" || reason === "camera_lost") {
        abortInterview(reason);
        return;
      }

      violationCountRef.current += 1;
      // maxViolations from config is the total number of violations that
      // triggers termination. Each one before that is a warning. Default 1
      // means first violation closes (no warning).
      const limit = session?.antiCheat?.maxViolations ?? 3;
      const isTerminating = violationCountRef.current >= limit;

      if (isTerminating) {
        forceCloseInterview(reason);
      } else {
        // Record the warning-level violation server-side so the recruiter sees
        // the full proctoring history, even if the candidate ultimately passes.
        fetch(`/api/interview/${sessionId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: reason, level: "warning" }),
        }).catch(() => undefined);
        setWarningModal({
          reason,
          remaining: limit - violationCountRef.current,
        });
      }
    },
    [abortInterview, forceCloseInterview, session?.antiCheat?.maxViolations, sessionId]
  );

  const { videoRef, status: proctoringStatus, faceCount, detectorReady, stop: stopProctoring } =
    useProctoring({
      enabled: proctoringEnabled,
      config: proctoringConfig,
      onViolation: handleViolation,
    });

  // Once the candidate has been terminated, kill the proctoring stream so the
  // camera light goes off while the redirect timer counts down.
  useEffect(() => {
    if (terminated) stopProctoring();
  }, [terminated, stopProctoring]);

  // Once the proctoring camera is ready, advance from "loading" to "ready".
  // We're synchronizing our local phase to an external system (the proctoring
  // hook's status, which is driven by camera permission + WASM init) — the
  // canonical use case for useEffect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (proctoringStatus === "requesting" && phase !== "permission") setPhase("permission");
    if (proctoringStatus === "ready" && (phase === "permission" || phase === "loading")) {
      setPhase("ready");
    }
  }, [proctoringStatus, phase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    fetch(`/api/interview/${sessionId}`)
      .then((r) => r.json())
      .then((data: SessionData & { error?: string }) => {
        if (data.error) { setErrorMsg(data.error); setPhase("error"); return; }
        setSession(data);
        if (data.status === "completed") {
          setResult({
            totalScore: data.totalScore ?? 0,
            overallFeedback: data.overallFeedback ?? "",
            questionScores: data.questionScores ?? [],
            questionFeedback: data.questionFeedback ?? [],
          });
          setPhase("completed");
          return;
        }
        // Insecure-origin gate only applies if the assessment actually needs
        // the camera. When HR disabled webcam monitoring the interview is
        // text/speech-only and works fine on a LAN IP.
        if (data.antiCheat?.webcamMonitoring && !isSecureMediaOrigin()) {
          setInsecureOrigin(true);
          setPhase("error");
          return;
        }
        // Hand off to the proctoring hook — it will set phase to "permission" → "ready".
        setPhase("permission");
      })
      .catch(() => { setErrorMsg("Failed to load session."); setPhase("error"); });
  }, [sessionId]);

  // Pulls the live stream off the video element so we can flip track.enabled
  // for the user-facing mute/cam toggles without tearing down the proctoring
  // stream (the hook keeps the camera on for detection regardless).
  function getActiveStream(): MediaStream | null {
    const so = videoRef.current?.srcObject;
    return so instanceof MediaStream ? so : null;
  }

  // ── Speech Synthesis ──────────────────────────────────────────────────────────
  const speakText = useCallback((text: string, onEnd: () => void) => {
    if (!("speechSynthesis" in window)) { onEnd(); return; }
    window.speechSynthesis.cancel();
    const clean = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/#+\s/g, "")
      .trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.name.toLowerCase().includes("female") || v.name.includes("Samantha") || v.name.includes("Karen") || v.name.includes("Zira")
    );
    if (preferred) utterance.voice = preferred;
    utterance.onerror = () => onEnd();
    setIsSpeaking(true);
    utterance.onend = () => { setIsSpeaking(false); onEnd(); };
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Grade interview ───────────────────────────────────────────────────────────
  // Declared before submitAnswer so submitAnswer can call it directly.
  const gradeInterview = useCallback(async () => {
    setPhase("grading");
    try {
      const res = await fetch(`/api/interview/${sessionId}/complete`, { method: "POST" });
      const data: InterviewResult & { error?: string } = await res.json();
      if (data.error) { setErrorMsg(data.error); setPhase("error"); return; }
      setResult(data);
      stopProctoring();
      setPhase("completed");
    } catch {
      setErrorMsg("Failed to grade interview.");
      setPhase("error");
    }
  }, [sessionId, stopProctoring]);

  // ── Speech Recognition ────────────────────────────────────────────────────────
  // Uses submitAnswerRef so it doesn't depend on submitAnswer directly.
  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).SpeechRecognition ??
      (window as unknown as { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) { setPhase("listening"); return; }

    accumulatedRef.current = "";
    setTranscript("");
    setInterimTranscript("");

    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { accumulatedRef.current += t + " "; }
        else { interim += t; }
      }
      setTranscript(accumulatedRef.current);
      setInterimTranscript(interim);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => rec.stop(), SILENCE_TIMEOUT_MS);
    };

    rec.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setInterimTranscript("");
      const finalText = accumulatedRef.current.trim();
      if (finalText) submitAnswerRef.current(finalText);
    };

    rec.onerror = () => setPhase("listening");

    recognitionRef.current = rec;
    rec.start();
    setPhase("listening");
  }, []);

  // ── Send answer to API ────────────────────────────────────────────────────────
  const submitAnswer = useCallback(async (answer: string) => {
    if (!answer.trim()) { startListening(); return; }
    setPhase("processing");
    setTranscript("");

    try {
      const res = await fetch(`/api/interview/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: answer }),
      });
      const data: {
        aiReply?: string;
        currentQuestionIndex?: number;
        isComplete?: boolean;
        totalQuestions?: number;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.aiReply) {
        setErrorMsg(data.error ?? "Something went wrong");
        setPhase("error");
        return;
      }

      setAiText(data.aiReply);
      setCurrentQIdx(data.currentQuestionIndex ?? currentQIdx);
      if (data.totalQuestions) setTotalQuestions(data.totalQuestions);

      if (data.isComplete) {
        setPhase("ai_speaking");
        speakText(data.aiReply, () => gradeInterview());
      } else {
        setPhase("ai_speaking");
        speakText(data.aiReply, () => startListening());
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }, [sessionId, currentQIdx, speakText, startListening, gradeInterview]);

  // Keep the ref current so startListening always calls the latest submitAnswer
  useEffect(() => { submitAnswerRef.current = submitAnswer; }, [submitAnswer]);

  // ── Start interview ───────────────────────────────────────────────────────────
  const startInterview = useCallback(async () => {
    setPhase("processing");
    try {
      const res = await fetch(`/api/interview/${sessionId}/start`, { method: "POST" });
      const data: {
        firstMessage?: string;
        totalQuestions?: number;
        currentQuestionIndex?: number;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.firstMessage) {
        setErrorMsg(data.error ?? "Failed to start interview");
        setPhase("error");
        return;
      }

      setTotalQuestions(data.totalQuestions ?? INTERVIEW_QUESTION_COUNT);
      setCurrentQIdx(data.currentQuestionIndex ?? 0);
      setAiText(data.firstMessage);
      setPhase("ai_speaking");
      speakText(data.firstMessage, () => startListening());
    } catch {
      setErrorMsg("Failed to start interview.");
      setPhase("error");
    }
  }, [sessionId, speakText, startListening]);

  // ── Toggle cam/mic ────────────────────────────────────────────────────────────
  // NOTE: toggling video.track.enabled freezes the frame which would defeat
  // face detection. We hide the preview in the UI instead but leave the
  // track running so proctoring continues to work.
  function toggleCamera() {
    setIsCamEnabled((v) => !v);
  }

  function toggleMic() {
    getActiveStream()?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMicEnabled((v) => !v);
  }

  function handleManualSubmit() {
    const text = transcript.trim();
    if (!text) return;
    if (recognitionRef.current) recognitionRef.current.stop();
    submitAnswer(text);
  }

  function handleSkip() {
    if (recognitionRef.current) recognitionRef.current.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setTranscript("");
    setInterimTranscript("");
    submitAnswer("skip");
  }

  const progress = totalQuestions > 0 ? (currentQIdx / totalQuestions) * 100 : 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return <FullScreen><LoadingSpinner label="Loading interview…" /></FullScreen>;
  }

  // Proctoring-driven exit screens — rendered before everything else so a
  // termination from inside the active interview replaces the room.
  if (terminated) {
    const isCameraIssue =
      terminationReason === "camera_denied" || terminationReason === "camera_lost";
    if (isCameraIssue) {
      return (
        <FullScreen>
          <div className="max-w-md space-y-3 px-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-900/40 text-amber-300 text-2xl">
              ⚠
            </div>
            <p className="text-lg font-bold text-white">Camera unavailable</p>
            <p className="text-sm text-slate-300 leading-relaxed">
              {terminationReason ? VIOLATION_MESSAGES[terminationReason] : ""}
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              No worries — your interview wasn&apos;t scored. Fix your camera (check
              browser permissions or reconnect the device) and come back to start
              again. Returning to your application page…
            </p>
          </div>
        </FullScreen>
      );
    }
    return (
      <FullScreen>
        <div className="max-w-md space-y-3 px-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-900/40 text-red-300 text-2xl">
            ✕
          </div>
          <p className="text-lg font-bold text-white">Interview closed</p>
          <p className="text-sm text-slate-300 leading-relaxed">
            {terminationReason
              ? VIOLATION_MESSAGES[terminationReason]
              : "A proctoring violation was detected."}
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your application has been flagged for recruiter review. Returning to your application page…
          </p>
        </div>
      </FullScreen>
    );
  }

  if (phase === "error") {
    if (insecureOrigin) {
      const currentHost = typeof window !== "undefined" ? window.location.host : "this URL";
      const localhostUrl =
        typeof window !== "undefined"
          ? `${window.location.protocol}//localhost:${window.location.port || (window.location.protocol === "https:" ? "443" : "80")}${window.location.pathname}`
          : null;
      return (
        <FullScreen>
          <div className="max-w-md space-y-5 px-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-900/40 text-amber-300 text-2xl">
              ⚠
            </div>
            <div>
              <p className="text-lg font-bold text-white">Camera requires a secure connection</p>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Your browser blocks camera and microphone access on{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200">
                  {currentHost}
                </code>
                . AI interviews need both to run.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left text-xs text-slate-300">
              <p className="mb-2 font-bold text-slate-100">How to fix this</p>
              <ul className="space-y-1.5 list-disc list-inside marker:text-slate-500">
                <li>
                  Open this page on <code className="rounded bg-slate-800 px-1 text-slate-200">localhost</code>{" "}
                  or <code className="rounded bg-slate-800 px-1 text-slate-200">127.0.0.1</code>
                </li>
                <li>Or serve the app over HTTPS (an HTTPS tunnel like ngrok works)</li>
                <li>HTTPS is required for camera & microphone on every other origin</li>
              </ul>
            </div>
            {localhostUrl && (
              <a
                href={localhostUrl}
                className="block w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
              >
                Open on localhost →
              </a>
            )}
          </div>
        </FullScreen>
      );
    }
    return (
      <FullScreen>
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-900/40 text-red-400 text-2xl">✕</div>
          <p className="text-lg font-bold text-white">Something went wrong</p>
          <p className="text-sm text-slate-400">{errorMsg}</p>
          <button onClick={() => window.location.reload()}
            className="rounded-lg bg-slate-700 px-5 py-2 text-sm font-bold text-white hover:bg-slate-600">
            Try Again
          </button>
        </div>
      </FullScreen>
    );
  }

  if (phase === "grading") {
    return (
      <FullScreen>
        <LoadingSpinner label="AI is scoring your interview…" />
        <p className="mt-3 text-xs text-slate-500">This takes about 10 seconds</p>
      </FullScreen>
    );
  }

  async function loadScheduleSlots() {
    if (!session?.jobId) return;
    setIsScheduling(true);
    setScheduleError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(`/api/jobs/${session.jobId}/interview?timeZone=${encodeURIComponent(tz)}`);
      const data: { slots?: SlotDay[]; error?: string } = await res.json();
      if (!res.ok) { setScheduleError(data.error || "Failed to load time slots"); return; }
      setSlots(data.slots ?? []);
      setScheduleStep("picking");
    } catch {
      setScheduleError("Network error loading time slots");
    } finally {
      setIsScheduling(false);
    }
  }

  async function handleScheduleSlot(isoDate: string) {
    if (!session?.jobId || !session?.candidateId || isScheduling) return;
    setIsScheduling(true);
    setScheduleError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(`/api/jobs/${session.jobId}/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: session.candidateId, scheduledDate: isoDate, timeZone: tz }),
      });
      const data: { scheduledAt?: string; message?: string; error?: string } = await res.json();
      if (!res.ok) { setScheduleError(data.error || "Scheduling failed"); return; }
      if (data.scheduledAt) {
        const d = new Date(data.scheduledAt);
        const label = d.toLocaleString("en-US", {
          weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
        setScheduledInfo({ date: label, message: data.message });
      }
      setScheduleStep("done");
    } catch {
      setScheduleError("Network error. Please try again.");
    } finally {
      setIsScheduling(false);
    }
  }

  if (phase === "completed" && result) {
    // HR-configured passing score wins when available; falls back to the
    // legacy constant otherwise so older jobs without an AssessmentConfig
    // still grade consistently.
    const passingScore =
      session?.interviewConfig?.passingScore ?? INTERVIEW_PASSING_SCORE;
    const passed = result.totalScore >= passingScore;
    const resumeScore = session?.resumeMatchScore;
    const quizScore = session?.answerScore;
    return (
      <FullScreen>
        <div className="w-full max-w-lg space-y-4 px-4 overflow-y-auto max-h-screen py-6">
          {/* Header */}
          <div className={`rounded-2xl border p-6 text-center space-y-2 ${passed ? "border-green-700 bg-green-950/50" : "border-slate-700 bg-slate-800/50"}`}>
            <div className="text-4xl">{passed ? "🏆" : "📋"}</div>
            <p className={`text-xs font-bold uppercase tracking-widest ${passed ? "text-green-400" : "text-slate-400"}`}>
              Interview Complete
            </p>
            <p className="text-5xl font-bold text-white">
              {result.totalScore}<span className="text-xl text-slate-400">/100</span>
            </p>
            <p className="text-xs text-slate-500">
              Passing score: {passingScore}/100
            </p>
            {result.overallFeedback && (
              <p className="text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">{result.overallFeedback}</p>
            )}
          </div>

          {/* Score summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <ScoreCard label="Resume Match" score={resumeScore} outOf={100} />
            <ScoreCard label="Quiz Score" score={quizScore} outOf={100} />
            <ScoreCard label="Interview" score={result.totalScore} outOf={100} highlight />
          </div>

          {/* Per-question breakdown */}
          {result.questionScores && result.questionScores.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
              <p className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-400 border-b border-slate-700">
                Interview question breakdown
              </p>
              <div className="divide-y divide-slate-700/60">
                {result.questionScores.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-300">Q{i + 1}</p>
                      {result.questionFeedback?.[i] && (
                        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{result.questionFeedback[i]}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                      s >= 7 ? "bg-green-900/60 text-green-300" : s >= 5 ? "bg-yellow-900/60 text-yellow-300" : "bg-red-900/60 text-red-300"
                    }`}>
                      {s}/10
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule or not-passed section */}
          {passed ? (
            <div className="space-y-4">
              {scheduleStep === "scores" && (
                <div className="rounded-xl border border-green-700 bg-green-950/30 p-5 text-center space-y-3">
                  <p className="text-sm font-bold text-green-300">You passed the AI interview!</p>
                  <p className="text-xs text-slate-400">Schedule your final interview with our team to continue.</p>
                  <button
                    onClick={() => { void loadScheduleSlots(); }}
                    disabled={isScheduling}
                    className="w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                  >
                    {isScheduling
                      ? <span className="flex items-center justify-center gap-2"><InterviewSpinner /> Loading slots…</span>
                      : "Schedule Interview with Team →"}
                  </button>
                  {scheduleError && <p className="text-xs text-red-400">{scheduleError}</p>}
                </div>
              )}

              {scheduleStep === "picking" && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-4">
                  <p className="text-sm font-bold text-white">When would you like to meet?</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {slots.map((slot) => (
                      <button
                        key={slot.date}
                        onClick={() => setSelectedSlotDate(slot.date === selectedSlotDate ? null : slot.date)}
                        className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                          selectedSlotDate === slot.date
                            ? "border-blue-500 bg-blue-600 text-white"
                            : "border-slate-600 bg-slate-700 text-slate-300 hover:border-blue-400 hover:bg-slate-600"
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                  {selectedSlotDate && (() => {
                    const daySlots = slots.find((s) => s.date === selectedSlotDate);
                    return daySlots ? (
                      <div className="grid grid-cols-3 gap-2">
                        {daySlots.times.map(({ iso, label }) => (
                          <button
                            key={iso}
                            onClick={() => { void handleScheduleSlot(iso); }}
                            disabled={isScheduling}
                            className="rounded-lg border border-slate-600 bg-slate-700 px-2 py-2.5 text-xs font-bold text-slate-300 transition-colors hover:border-blue-400 hover:bg-blue-900/40 hover:text-blue-300 disabled:opacity-50"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  {scheduleError && <p className="text-xs text-red-400">{scheduleError}</p>}
                  {isScheduling && (
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                      <InterviewSpinner /> Booking your slot…
                    </div>
                  )}
                </div>
              )}

              {scheduleStep === "done" && (
                <div className="rounded-xl border border-blue-700 bg-blue-950/30 p-5 text-center space-y-2">
                  <div className="text-2xl">📅</div>
                  <p className="text-sm font-bold text-blue-300">Interview Scheduled!</p>
                  {scheduledInfo && <p className="text-xs text-slate-300">{scheduledInfo.date}</p>}
                  <p className="text-xs text-slate-500">
                    {scheduledInfo?.message || "A confirmation will be sent to your email."}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 text-center space-y-2">
              <p className="text-sm text-slate-400">Thank you for completing the interview.</p>
              <p className="text-xs text-slate-500">
                We appreciate your time. A minimum score of {passingScore}/100 is needed to pass.
              </p>
              <Link href="/jobs"
                className="mt-2 inline-block rounded-lg bg-slate-700 px-5 py-2 text-sm font-bold text-white hover:bg-slate-600 transition-colors">
                Browse Other Positions
              </Link>
            </div>
          )}

          <p className="text-center text-xs text-slate-500">Full results have been sent to your email.</p>
        </div>
      </FullScreen>
    );
  }

  if (phase === "ready" || phase === "permission") {
    const tooManyFaces = faceCount !== null && faceCount > 1;
    const noFace = faceCount === 0;
    const cameraReady = proctoringStatus === "ready";
    const monitor = proctoringConfig.webcamMonitoring;

    return (
      <FullScreen>
        <div className="w-full max-w-md space-y-6 px-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{session?.jobTitle ?? "AI Interview"}</p>
            <p className="text-sm text-slate-400 mt-1">
              Hi {session?.candidateName ?? ""} — {totalQuestions} questions, take your time
            </p>
          </div>

          {monitor && (
            <div
              className={`relative mx-auto h-56 w-72 overflow-hidden rounded-2xl border bg-slate-900 shadow-xl transition-colors ${
                tooManyFaces
                  ? "border-red-500 shadow-red-500/30"
                  : noFace && cameraReady
                  ? "border-amber-500 shadow-amber-500/20"
                  : "border-slate-700"
              }`}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover scale-x-[-1] ${isCamEnabled ? "" : "opacity-0"}`}
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/80 text-slate-400 text-sm">
                  <InterviewSpinner />
                  <span>Requesting camera…</span>
                </div>
              )}
              {cameraReady && (
                <FaceCountChip count={faceCount} detectorReady={detectorReady} />
              )}
            </div>
          )}

          {/* Face / proctoring warnings — only when webcam monitoring is on. */}
          {monitor && cameraReady && tooManyFaces && (
            <WarningBanner
              title="Multiple people detected"
              body={`We see ${faceCount} people in the frame. Please make sure only you are visible before starting the interview.`}
              tone="danger"
            />
          )}
          {monitor && cameraReady && noFace && detectorReady && (
            <WarningBanner
              title="No face detected"
              body="Position your face clearly in the camera so we can verify you before starting."
              tone="warning"
            />
          )}

          <div className="space-y-2 text-sm text-slate-400">
            {monitor ? (
              <>
                <p>✓ Allow camera & microphone when prompted</p>
                <p>✓ Stay alone in the frame — we monitor for multiple people</p>
              </>
            ) : (
              <p>✓ Webcam monitoring is disabled for this interview</p>
            )}
            <p>✓ Speak clearly and naturally — no time limit</p>
          </div>

          {phase === "ready" && (
            <button
              onClick={startInterview}
              disabled={monitor && tooManyFaces}
              className={`w-full rounded-xl px-6 py-4 text-base font-bold text-white shadow-lg transition-colors ${
                monitor && tooManyFaces
                  ? "cursor-not-allowed bg-slate-700 shadow-none"
                  : "bg-blue-600 shadow-blue-900/30 hover:bg-blue-500"
              }`}
            >
              {monitor && tooManyFaces ? "Resolve warning to continue" : "Join Interview →"}
            </button>
          )}
        </div>
      </FullScreen>
    );
  }

  // ── Active interview ──────────────────────────────────────────────────────────
  const tooManyFacesActive = faceCount !== null && faceCount > 1;
  const noFaceActive = faceCount === 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">AI</div>
          <div>
            <p className="text-sm font-bold">{session?.jobTitle ?? "Interview"}</p>
            <p className="text-xs text-slate-400">AI Interviewer</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {proctoringConfig.webcamMonitoring && (
            <ProctoringChip faceCount={faceCount} detectorReady={detectorReady} />
          )}
          <span className="text-xs text-slate-400">
            Question {Math.min(currentQIdx + 1, totalQuestions)} of {totalQuestions}
          </span>
          <div className={`h-2 w-2 rounded-full animate-pulse ${
            phase === "listening" ? "bg-red-500" : phase === "ai_speaking" ? "bg-blue-500" : "bg-slate-600"
          }`} />
        </div>
      </div>

      {/* Live face-count banner — stays as a status indicator while too many /
          no faces are in frame. The actual violation event (after the
          sustained-detection threshold) surfaces in the modal below. */}
      {proctoringConfig.webcamMonitoring && tooManyFacesActive && (
        <div className="px-5 py-2 text-sm text-center font-medium bg-red-950/70 text-red-200 border-b border-red-700/50">
          ⚠ {faceCount} people detected in frame. Only you should be visible.
        </div>
      )}
      {proctoringConfig.webcamMonitoring && noFaceActive && detectorReady && (
        <div className="px-5 py-2 text-sm text-center font-medium bg-amber-950/70 text-amber-200 border-b border-amber-700/50">
          ⚠ We can&apos;t see your face. Please reposition yourself in the camera.
        </div>
      )}

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-slate-800">
        <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col items-center justify-center relative overflow-hidden px-4">
        <div className="flex flex-col items-center gap-5">
          {/* AI avatar */}
          <div className={`relative flex h-28 w-28 items-center justify-center rounded-full border-2 bg-slate-800 transition-all ${
            isSpeaking ? "border-blue-500 shadow-lg shadow-blue-500/30" : "border-slate-700"
          }`}>
            <span className="text-4xl">🤖</span>
            {isSpeaking && <div className="absolute -inset-1 rounded-full border-2 border-blue-400/40 animate-ping" />}
          </div>

          {/* AI text bubble */}
          {aiText && (
            <div className="max-w-xl rounded-2xl border border-slate-700 bg-slate-800/80 px-5 py-4 text-sm text-slate-200 leading-relaxed text-center shadow-xl">
              {aiText}
            </div>
          )}

          {/* Status label */}
          <div className="flex items-center gap-2 text-xs font-medium">
            {phase === "ai_speaking" && (
              <>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="block h-3 w-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 100}ms` }} />
                  ))}
                </span>
                <span className="text-blue-400">AI is speaking…</span>
              </>
            )}
            {phase === "listening" && (
              <>
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400">Listening — speak your answer</span>
              </>
            )}
            {phase === "processing" && (
              <span className="text-slate-400 animate-pulse">Processing your answer…</span>
            )}
          </div>
          

          {/* Live transcript */}
          {(transcript || interimTranscript) && phase === "listening" && (
            <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm">
              <p className="text-slate-200">
                {transcript}
                <span className="text-slate-500 italic">{interimTranscript}</span>
              </p>
              {transcript.trim().split(/\s+/).length >= MIN_WORDS && (
                <button onClick={handleManualSubmit}
                  className="mt-2 text-xs font-bold text-blue-400 hover:text-blue-300">
                  Send answer →
                </button>
              )}
            </div>
          )}
        </div>

        {/* User camera (bottom-right) — only renders when HR enabled webcam
            monitoring on this assessment. Otherwise the hook never acquires
            a stream and there's nothing to show. */}
        {proctoringConfig.webcamMonitoring && (
          <div
            className={`absolute bottom-4 right-4 h-36 w-48 overflow-hidden rounded-xl border bg-slate-900 shadow-xl transition-colors ${
              tooManyFacesActive
                ? "border-red-500 shadow-red-500/30"
                : "border-slate-700"
            }`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover scale-x-[-1] ${isCamEnabled ? "" : "opacity-0"}`}
            />
            <FaceCountChip count={faceCount} detectorReady={detectorReady} compact />
            {!isCamEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-xs text-slate-400">
                Camera hidden (still proctoring)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 px-4 py-4 sm:gap-4 sm:px-5">
        <ControlButton onClick={toggleMic} active={isMicEnabled}
          label={isMicEnabled ? "Mic On" : "Mic Off"} icon={isMicEnabled ? "🎤" : "🔇"} />
        {proctoringConfig.webcamMonitoring && (
          <ControlButton onClick={toggleCamera} active={isCamEnabled}
            label={isCamEnabled ? "Cam On" : "Cam Off"} icon={isCamEnabled ? "📷" : "📵"} />
        )}
        {phase === "listening" && (
          <>
            {transcript.trim() && (
              <button onClick={handleManualSubmit}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 transition-colors">
                Send Answer
              </button>
            )}
            <button onClick={handleSkip}
              className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-bold text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors">
              Skip
            </button>
          </>
        )}
      </div>

      {warningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/60 text-amber-300">
                <span className="text-xl font-bold">!</span>
              </span>
              <h2 className="text-base font-bold text-white">Warning</h2>
            </div>
            <p className="mt-3 text-sm text-slate-200">
              {VIOLATION_MESSAGES[warningModal.reason]}
            </p>
            <p className="mt-3 text-sm font-semibold text-amber-300">
              {warningModal.remaining <= 0
                ? "Your next violation will close the interview."
                : `${warningModal.remaining} more violation${
                    warningModal.remaining === 1 ? "" : "s"
                  } will close the interview and flag your application.`}
            </p>
            <button
              type="button"
              onClick={() => setWarningModal(null)}
              className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 transition-colors"
            >
              I understand — continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function ScoreCard({ label, score, outOf, highlight }: {
  label: string; score: number | undefined; outOf: number; highlight?: boolean;
}) {
  const pct = score !== undefined ? Math.round((score / outOf) * 100) : null;
  const colorClass = pct === null
    ? "text-slate-500"
    : pct >= 70 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${highlight ? "border-blue-700 bg-blue-950/40" : "border-slate-700 bg-slate-800/50"}`}>
      <p className="text-xs font-semibold text-slate-400 truncate">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${colorClass}`}>
        {score !== undefined ? score : "—"}
        <span className="text-xs text-slate-600">/{outOf}</span>
      </p>
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-950 text-white">
      {children}
    </div>
  );
}


function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

function InterviewSpinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ControlButton({ onClick, active, label, icon }: {
  onClick: () => void; active: boolean; label: string; icon: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${
        active ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-red-900/60 text-red-300 hover:bg-red-900"
      }`}>
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function WarningBanner({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "warning" | "danger";
}) {
  const styles =
    tone === "danger"
      ? "border-red-700 bg-red-950/60 text-red-200"
      : "border-amber-700 bg-amber-950/60 text-amber-100";
  return (
    <div className={`rounded-xl border px-4 py-3 text-left ${styles}`}>
      <p className="text-sm font-bold">⚠ {title}</p>
      <p className="mt-1 text-xs leading-relaxed">{body}</p>
    </div>
  );
}

function FaceCountChip({
  count,
  detectorReady,
  compact,
}: {
  count: number | null;
  detectorReady: boolean;
  compact?: boolean;
}) {
  if (!detectorReady) {
    return (
      <div
        className={`absolute left-2 top-2 rounded-full bg-slate-900/80 ${
          compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
        } font-semibold text-slate-300 ring-1 ring-slate-700`}
      >
        ⋯ initializing
      </div>
    );
  }
  if (count === null) return null;
  const ok = count === 1;
  const tone = count > 1
    ? "bg-red-900/80 text-red-200 ring-red-700"
    : count === 0
    ? "bg-amber-900/80 text-amber-200 ring-amber-700"
    : "bg-emerald-900/80 text-emerald-200 ring-emerald-700";
  return (
    <div
      className={`absolute left-2 top-2 rounded-full ring-1 ${tone} ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      } font-semibold`}
    >
      {ok ? "● 1 person" : count === 0 ? "○ no face" : `⚠ ${count} people`}
    </div>
  );
}

function ProctoringChip({
  faceCount,
  detectorReady,
}: {
  faceCount: number | null;
  detectorReady: boolean;
}) {
  if (!detectorReady) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2 py-0.5 text-xs text-slate-400 ring-1 ring-slate-700">
        Proctoring…
      </span>
    );
  }
  if (faceCount === null) return null;
  const ok = faceCount === 1;
  const cls = faceCount > 1
    ? "bg-red-950/70 text-red-300 ring-red-700/60"
    : faceCount === 0
    ? "bg-amber-950/70 text-amber-200 ring-amber-700/60"
    : "bg-emerald-950/70 text-emerald-200 ring-emerald-700/60";
  return (
    <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {ok ? "● Proctored" : faceCount === 0 ? "○ No face" : `⚠ ${faceCount} faces`}
    </span>
  );
}


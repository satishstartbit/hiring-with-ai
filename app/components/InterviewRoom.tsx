"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  | "waiting"       // scheduled for future
  | "permission"    // requesting cam/mic
  | "ready"         // ready to start
  | "ai_speaking"
  | "listening"
  | "processing"
  | "grading"
  | "completed"
  | "error";

interface SessionData {
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
}

interface InterviewResult {
  totalScore: number;
  overallFeedback: string;
  questionScores: number[];
  questionFeedback: string[];
}

const SILENCE_TIMEOUT_MS = 2500;
const INTERVIEW_DURATION_MINUTES = 3;
const INTERVIEW_DURATION_MS = INTERVIEW_DURATION_MINUTES * 60 * 1000;
const MIN_WORDS = 10;

export default function InterviewRoom({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(3);
  const [aiText, setAiText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCamEnabled, setIsCamEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceCompleteRef = useRef(false);
  const accumulatedRef = useRef("");

  function clearInterviewTimer() {
    if (interviewTimerRef.current) {
      clearTimeout(interviewTimerRef.current);
      interviewTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => clearInterviewTimer();
  }, []);

  // ── Load session ──────────────────────────────────────────────────────────
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
        } else {
          setPhase("permission");
        }
      })
      .catch(() => { setErrorMsg("Failed to load session."); setPhase("error"); });
  }, [sessionId]);

  // ── Camera / Mic ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }
      setPhase("ready");
    } catch {
      // Try audio only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setIsCamEnabled(false);
        setPhase("ready");
      } catch {
        setIsCamEnabled(false);
        setPhase("ready");
      }
    }
  }, []);

  useEffect(() => {
    if (phase === "permission") startCamera();
  }, [phase, startCamera]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // ── Speech Synthesis (AI speaks) ──────────────────────────────────────────
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
    const preferred = voices.find((v) => v.name.toLowerCase().includes("female") || v.name.includes("Samantha") || v.name.includes("Karen") || v.name.includes("Zira"));
    if (preferred) utterance.voice = preferred;
    utterance.onend = onEnd;
    utterance.onerror = () => onEnd();
    setIsSpeaking(true);
    utterance.onend = () => { setIsSpeaking(false); onEnd(); };
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Speech Recognition (user speaks) ─────────────────────────────────────
  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).SpeechRecognition ??
      (window as unknown as { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setPhase("listening");
      return;
    }

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
        if (event.results[i].isFinal) {
          accumulatedRef.current += t + " ";
        } else {
          interim += t;
        }
      }
      setTranscript(accumulatedRef.current);
      setInterimTranscript(interim);

      // Reset silence timer on new speech
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        rec.stop();
      }, SILENCE_TIMEOUT_MS);
    };

    rec.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setInterimTranscript("");
      const finalText = accumulatedRef.current.trim();
      if (finalText && !forceCompleteRef.current) submitAnswer(finalText);
    };

    rec.onerror = () => {
      setPhase("listening");
    };

    recognitionRef.current = rec;
    rec.start();
    setPhase("listening");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send answer to API ────────────────────────────────────────────────────
  const submitAnswer = useCallback(async (answer: string) => {
    if (forceCompleteRef.current) return;
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
        speakText(data.aiReply, () => {
          gradeInterview();
        });
      } else {
        setPhase("ai_speaking");
        speakText(data.aiReply, () => startListening());
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setPhase("error");
    }
  }, [sessionId, currentQIdx, speakText, startListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Grade interview ───────────────────────────────────────────────────────
  const gradeInterview = useCallback(async () => {
    clearInterviewTimer();
    setPhase("grading");
    try {
      const res = await fetch(`/api/interview/${sessionId}/complete`, { method: "POST" });
      const data: InterviewResult & { error?: string } = await res.json();
      if (data.error) { setErrorMsg(data.error); setPhase("error"); return; }
      setResult(data);
      stopCamera();
      setPhase("completed");
    } catch {
      setErrorMsg("Failed to grade interview.");
      setPhase("error");
    }
  }, [sessionId]);

  const startInterviewTimer = useCallback(() => {
    clearInterviewTimer();
    forceCompleteRef.current = false;
    interviewTimerRef.current = setTimeout(() => {
      forceCompleteRef.current = true;
      recognitionRef.current?.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setAiText("Time is up. Thank you for completing your 3-minute AI interview.");
      gradeInterview();
    }, INTERVIEW_DURATION_MS);
  }, [gradeInterview]);

  // ── Start interview ───────────────────────────────────────────────────────
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

      setTotalQuestions(data.totalQuestions ?? 3);
      setCurrentQIdx(data.currentQuestionIndex ?? 0);
      setAiText(data.firstMessage);
      startInterviewTimer();
      setPhase("ai_speaking");
      speakText(data.firstMessage, () => startListening());
    } catch {
      setErrorMsg("Failed to start interview.");
      setPhase("error");
    }
  }, [sessionId, speakText, startListening, startInterviewTimer]);

  // ── Toggle cam/mic ────────────────────────────────────────────────────────
  function toggleCamera() {
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsCamEnabled((v) => !v);
  }

  function toggleMic() {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMicEnabled((v) => !v);
  }

  // ── Manual submit (fallback for no speech recognition) ───────────────────
  function handleManualSubmit() {
    const text = transcript.trim();
    if (!text) return;
    if (recognitionRef.current) recognitionRef.current.stop();
    submitAnswer(text);
  }

  const progress = totalQuestions > 0 ? (currentQIdx / totalQuestions) * 100 : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return <FullScreen><LoadingSpinner label="Loading interview…" /></FullScreen>;
  }

  if (phase === "error") {
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

  if (phase === "completed" && result) {
    const passed = result.totalScore >= 70;
    return (
      <FullScreen>
        <div className="w-full max-w-lg space-y-5 px-4">
          <div className={`rounded-2xl border p-8 text-center space-y-2 ${passed ? "border-green-700 bg-green-950/50" : "border-slate-700 bg-slate-800/50"}`}>
            <div className="text-5xl">{passed ? "🏆" : "📋"}</div>
            <p className={`text-xs font-bold uppercase tracking-widest ${passed ? "text-green-400" : "text-slate-400"}`}>
              Interview Complete
            </p>
            <p className="text-6xl font-bold text-white">{result.totalScore}<span className="text-2xl text-slate-400">/100</span></p>
            {result.overallFeedback && (
              <p className="text-sm text-slate-300 max-w-sm mx-auto">{result.overallFeedback}</p>
            )}
          </div>
          {result.questionScores && result.questionScores.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 divide-y divide-slate-700 overflow-hidden">
              {result.questionScores.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 gap-4">
                  <p className="text-xs text-slate-400 flex-1">Question {i + 1}: {result.questionFeedback?.[i]}</p>
                  <span className={`shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-bold ${s >= 7 ? "bg-green-900/60 text-green-300" : s >= 5 ? "bg-yellow-900/60 text-yellow-300" : "bg-red-900/60 text-red-300"}`}>
                    {s}/10
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-center text-xs text-slate-500">Results have been sent to your email.</p>
        </div>
      </FullScreen>
    );
  }

  if (phase === "ready" || phase === "permission") {
    return (
      <FullScreen>
        <div className="w-full max-w-md space-y-6 px-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{session?.jobTitle ?? "AI Interview"}</p>
            <p className="text-sm text-slate-400 mt-1">Hi {session?.candidateName ?? ""} - 3-minute AI mock interview</p>
          </div>

          {isCamEnabled && (
            <div className="relative mx-auto h-48 w-64 overflow-hidden rounded-2xl bg-slate-800 border border-slate-700">
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover scale-x-[-1]" />
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/70 text-slate-400 text-sm">
                {phase === "permission" ? "Requesting camera…" : ""}
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm text-slate-400">
            <p>✓ Allow camera & microphone when prompted</p>
            <p>✓ Speak clearly and naturally to answer</p>
            <p>✓ Keep answers short, around 30-45 seconds each</p>
          </div>

          {phase === "ready" && (
            <button onClick={startInterview}
              className="w-full rounded-xl bg-blue-600 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-blue-500 shadow-lg shadow-blue-900/30">
              Join Interview →
            </button>
          )}
        </div>
      </FullScreen>
    );
  }

  // ── Active interview ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">AI</div>
          <div>
            <p className="text-sm font-bold">{session?.jobTitle ?? "Interview"}</p>
            <p className="text-xs text-slate-400">AI Interviewer</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Question {Math.min(currentQIdx + 1, totalQuestions)} of {totalQuestions}
          </span>
          <div className={`h-2 w-2 rounded-full animate-pulse ${phase === "listening" ? "bg-red-500" : phase === "ai_speaking" ? "bg-blue-500" : "bg-slate-600"}`} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-slate-800">
        <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col items-center justify-center relative overflow-hidden px-4">
        {/* AI Avatar */}
        <div className="flex flex-col items-center gap-5">
          <div className={`relative flex h-28 w-28 items-center justify-center rounded-full border-2 ${isSpeaking ? "border-blue-500 shadow-lg shadow-blue-500/30" : "border-slate-700"} bg-slate-800 transition-all`}>
            <span className="text-4xl">🤖</span>
            {isSpeaking && (
              <div className="absolute -inset-1 rounded-full border-2 border-blue-400/40 animate-ping" />
            )}
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
              <p className="text-slate-200">{transcript}<span className="text-slate-500 italic">{interimTranscript}</span></p>
              {transcript.trim().split(/\s+/).length >= MIN_WORDS && (
                <button onClick={handleManualSubmit}
                  className="mt-2 text-xs font-bold text-blue-400 hover:text-blue-300">
                  Send answer →
                </button>
              )}
            </div>
          )}
        </div>

        {/* User camera (bottom-right corner) */}
        {isCamEnabled && (
          <div className="absolute bottom-4 right-4 h-36 w-48 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-xl">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover scale-x-[-1]" />
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-4 border-t border-slate-800 px-5 py-4">
        <ControlButton
          onClick={toggleMic}
          active={isMicEnabled}
          label={isMicEnabled ? "Mic On" : "Mic Off"}
          icon={isMicEnabled ? "🎤" : "🔇"}
        />
        <ControlButton
          onClick={toggleCamera}
          active={isCamEnabled}
          label={isCamEnabled ? "Cam On" : "Cam Off"}
          icon={isCamEnabled ? "📷" : "📵"}
        />
        {phase === "listening" && transcript.trim() && (
          <button onClick={handleManualSubmit}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 transition-colors">
            Send Answer
          </button>
        )}
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

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

function ControlButton({ onClick, active, label, icon }: {
  onClick: () => void; active: boolean; label: string; icon: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${active ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-red-900/60 text-red-300 hover:bg-red-900"}`}>
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

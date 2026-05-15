"use client";

import { useState } from "react";

export interface InterviewLaunchPreview {
  durationMinutes: number;
  questionCount: number;
  passingScore: number;
  antiCheat: {
    tabSwitchDetection: boolean;
    fullscreenRequired: boolean;
    blockCopyPaste: boolean;
    webcamMonitoring: boolean;
    maxViolations: number;
  };
}

interface Props {
  applicationId: string;
  alreadyInProgress: boolean;
  preview: InterviewLaunchPreview | null;
}

export default function InterviewLaunchClient({
  applicationId,
  alreadyInProgress,
  preview,
}: Readonly<Props>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minutes = preview?.durationMinutes ?? 15;
  const questions = preview?.questionCount ?? 8;
  const passing = preview?.passingScore ?? 20;
  const antiCheat = preview?.antiCheat;
  const warnings =
    antiCheat && antiCheat.maxViolations > 0
      ? Math.max(0, antiCheat.maxViolations - 1)
      : 0;

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/candidate/applications/${applicationId}/interview`,
        { method: "POST" }
      );
      const data: { meetingUrl?: string; error?: string } = await res.json();
      if (!res.ok || !data.meetingUrl) {
        setError(data.error ?? "Could not start your interview. Please try again.");
        return;
      }
      window.location.href = data.meetingUrl;
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-700">
        The AI interview runs in your browser with voice Q&amp;A. You&apos;ll have about{" "}
        <strong>{minutes} minutes</strong> for <strong>{questions} questions</strong> (passing
        score <strong>{passing}/100</strong>).
      </p>

      {antiCheat && (
        <>
          <h3 className="mt-4 text-sm font-bold text-slate-900">Proctoring rules</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            {antiCheat.webcamMonitoring && (
              <>
                <li>· Camera and microphone stay on for the full interview.</li>
                <li>· Only you should be visible in the frame.</li>
              </>
            )}
            {antiCheat.tabSwitchDetection && (
              <li>· Do not switch tabs or apps until the interview ends.</li>
            )}
            {antiCheat.fullscreenRequired && (
              <li>· Fullscreen is required for the entire interview.</li>
            )}
            {antiCheat.blockCopyPaste && (
              <li>· Copy / paste is disabled during the interview.</li>
            )}
            {antiCheat.maxViolations > 0 && (
              <li>
                · You get <strong>{warnings}</strong> warning{warnings === 1 ? "" : "s"} before
                the interview auto-closes.
              </li>
            )}
          </ul>
        </>
      )}

      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        <li>· You can rejoin mid-interview from your application page.</li>
        <li>· Speak clearly when the AI asks a question — it listens automatically.</li>
      </ul>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy
            ? "AI is generating your interview..."
            : alreadyInProgress
              ? "Rejoin the AI interview"
              : "Start the AI interview"}
        </button>
      </div>

      {busy && (
        <p className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          We&apos;re creating your AI interview session and getting everything ready for you.
        </p>
      )}
    </div>
  );
}

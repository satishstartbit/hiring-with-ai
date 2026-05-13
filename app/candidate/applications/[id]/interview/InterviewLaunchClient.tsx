"use client";

import { useState } from "react";

interface Props {
  applicationId: string;
  alreadyInProgress: boolean;
}

interface InterviewStartResponse {
  interviewSessionId?: string;
  meetingUrl?: string;
  error?: string;
}

export default function InterviewLaunchClient({
  applicationId,
  alreadyInProgress,
}: Readonly<Props>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/candidate/applications/${applicationId}/interview`,
        { method: "POST" }
      );
      const data: InterviewStartResponse = await res.json();
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
        The AI interview is conducted in your browser — make sure you’re in a quiet space with a
        working camera and microphone before you start.
      </p>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        <li>· About 10 minutes long, role-specific questions.</li>
        <li>· You can rejoin mid-interview from your application page.</li>
        <li>· You don’t need to finish today — your spot stays open.</li>
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
        <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          We&apos;re creating your AI interview session and getting everything ready for you.
        </div>
      )}
    </div>
  );
}

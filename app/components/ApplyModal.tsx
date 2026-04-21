"use client";

import { useState, useRef } from "react";

interface Props {
  jobId: string;
  jobTitle: string;
  onClose: () => void;
}

export default function ApplyModal({ jobId, jobTitle, onClose }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    const form = e.currentTarget;
    const formData = new FormData(form);

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/apply`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md p-6 shadow-2xl">
        {success ? (
          <div className="text-center space-y-4 py-4">
            <div className="text-4xl">✓</div>
            <p className="text-green-400 font-semibold text-lg">Application submitted!</p>
            <p className="text-gray-400 text-sm">
              We&apos;ll be in touch if your profile is a good fit.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 bg-white text-gray-900 font-semibold rounded-xl text-sm hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">Apply for position</h2>
                <p className="text-sm text-gray-400 mt-0.5">{jobTitle}</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Full name *</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="Alex Johnson"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Email *</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="alex@example.com"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Current title</label>
                  <input
                    name="currentTitle"
                    type="text"
                    placeholder="Software Engineer"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Company</label>
                  <input
                    name="currentCompany"
                    type="text"
                    placeholder="TechCorp"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Resume (PDF, max 5 MB)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-gray-800 border border-gray-600 border-dashed rounded-lg px-3 py-4 text-center text-sm cursor-pointer hover:border-gray-400 transition-colors"
                >
                  {resumeFileName ? (
                    <span className="text-white">{resumeFileName}</span>
                  ) : (
                    <span className="text-gray-500">Click to upload resume</span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  name="resume"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => setResumeFileName(e.target.files?.[0]?.name ?? null)}
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-white text-gray-900 font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors text-sm"
              >
                {isSubmitting ? "Submitting…" : "Submit application"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface ApplicationQuestion {
  question: string;
  kind: "short_text" | "long_text" | "number";
  placeholder?: string;
  required: boolean;
}

interface Props {
  jobId: string;
  jobTitle: string;
  defaultEmail: string;
  applicationQuestions: ApplicationQuestion[];
}

interface ScreeningResponse {
  candidateId?: string;
  matched?: boolean;
  score?: number;
  reason?: string;
  error?: string;
}

export default function ApplyStage1Form({
  jobId,
  jobTitle,
  defaultEmail,
  applicationQuestions,
}: Readonly<Props>) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<string[]>(() => applicationQuestions.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!resumeFile) {
      setError("Please upload your resume before submitting.");
      return;
    }
    const missing = applicationQuestions.findIndex(
      (q, i) => q.required && !answers[i]?.trim()
    );
    if (missing !== -1) {
      setError(`Please answer: "${applicationQuestions[missing].question}"`);
      return;
    }

    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("email", email.trim());
    fd.append("currentTitle", currentTitle.trim());
    fd.append("currentCompany", currentCompany.trim());
    fd.append("resume", resumeFile);
    if (applicationQuestions.length > 0) {
      fd.append("applicationQuestions", JSON.stringify(applicationQuestions));
      fd.append("applicationAnswers", JSON.stringify(answers));
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/screening`, {
        method: "POST",
        body: fd,
      });
      const data: ScreeningResponse = await res.json();
      if (!res.ok || !data.candidateId) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Whether matched or not, the candidate page shows the outcome and
      // the right next action — we just route there.
      router.push(`/candidate/applications/${data.candidateId}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">
        Step 1 checks your resume against the role. If it’s a good fit, your application is saved
        and you can take the screening quiz and AI interview at your own pace — even days apart.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Johnson"
            className="field-input"
          />
        </Field>
        <Field label="Email *">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@example.com"
            className="field-input"
          />
        </Field>
        <Field label="Current title">
          <input
            type="text"
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
            placeholder="Software Engineer"
            className="field-input"
          />
        </Field>
        <Field label="Current company">
          <input
            type="text"
            value={currentCompany}
            onChange={(e) => setCurrentCompany(e.target.value)}
            placeholder="TechCorp"
            className="field-input"
          />
        </Field>
      </div>

      <Field label="Resume (PDF, DOC, TXT — max 5 MB) *">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
        >
          {resumeFile ? (
            <span className="flex items-center justify-center gap-2">
              <span className="text-emerald-600">✓</span>
              <span className="max-w-[240px] truncate">{resumeFile.name}</span>
            </span>
          ) : (
            "Tap to upload your resume"
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
        />
      </Field>

      {applicationQuestions.length > 0 && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            A few quick questions
          </p>
          {applicationQuestions.map((q, i) => (
            <ApplicationQuestionField
              key={`${q.question}-${i}`}
              question={q}
              value={answers[i] ?? ""}
              onChange={(v) => {
                const next = [...answers];
                next[i] = v;
                setAnswers(next);
                if (error) setError(null);
              }}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "AI is reviewing your resume…" : `Submit application for ${jobTitle}`}
      </button>
    </form>
  );
}

function ApplicationQuestionField({
  question,
  value,
  onChange,
}: Readonly<{
  question: ApplicationQuestion;
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

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

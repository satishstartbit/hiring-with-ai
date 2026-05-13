"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntegrationProvider } from "@/app/lib/constants/integrations";

type WorkMode = "remote" | "hybrid" | "onsite";
type EmploymentType = "full-time" | "part-time" | "contract" | "remote";

type Draft = {
  title: string;
  department: string;
  location: string;
  workMode: WorkMode;
  type: EmploymentType;
  experienceRequired: string;
  numberOfOpenings: number;
  skills: string[];
  salary: { min: number; max: number; currency: string; period: "year" | "month" | "hour" } | null;
  interviewRounds: { name: string; type: string }[];
  description: string;
  requirements: string[];
  responsibilities: string[];
  preferredQualifications: string[];
};

type GeneratedJob = Draft & {
  _id: string;
  status: string;
  screeningQuestions: string[];
  suggestedSkills: string[];
  interviewProcessSummary: string;
};

type IntegrationStatus = {
  provider: IntegrationProvider;
  status: "connected" | "disconnected" | "expired" | "error";
  accountEmail: string;
};

const STEPS = ["Basics", "Compensation & process", "Optional content", "AI review", "Publish"];

function formatApiError(error: unknown): string {
  if (!error || typeof error !== "object") return "Request failed";
  const e = error as { message?: string; details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } };
  const fieldErrors = e.details?.fieldErrors;
  if (fieldErrors) {
    const parts = Object.entries(fieldErrors)
      .filter(([, msgs]) => Array.isArray(msgs) && msgs.length > 0)
      .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`);
    if (parts.length > 0) return parts.join(" • ");
  }
  if (e.details?.formErrors?.length) return e.details.formErrors.join(", ");
  return e.message ?? "Request failed";
}

const PROVIDER_META: Record<IntegrationProvider, { name: string; gradient: string }> = {
  linkedin: { name: "LinkedIn", gradient: "from-sky-500 to-blue-600" },
  indeed: { name: "Indeed", gradient: "from-indigo-500 to-blue-500" },
  naukri: { name: "Naukri", gradient: "from-fuchsia-500 to-rose-500" },
  monster: { name: "Monster", gradient: "from-purple-500 to-violet-600" },
  glassdoor: { name: "Glassdoor", gradient: "from-emerald-500 to-teal-600" },
};

const EMPTY_DRAFT: Draft = {
  title: "",
  department: "",
  location: "",
  workMode: "remote",
  type: "full-time",
  experienceRequired: "",
  numberOfOpenings: 1,
  skills: [],
  salary: { min: 80000, max: 140000, currency: "USD", period: "year" },
  interviewRounds: [
    { name: "Recruiter Screen", type: "screening" },
    { name: "Technical Interview", type: "technical" },
    { name: "Hiring Manager", type: "managerial" },
  ],
  description: "",
  requirements: [],
  responsibilities: [],
  preferredQualifications: [],
};

export default function JobWizard({ integrationStatus }: { integrationStatus: IntegrationStatus[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<IntegrationProvider[]>(["linkedin"]);

  function update<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function saveDraftAndGenerate() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        interviewRounds: draft.interviewRounds.filter((r) => r.name.trim().length > 0),
      };
      // 1) Create the draft
      const draftRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const draftData = await draftRes.json();
      if (!draftData.ok) {
        setError(formatApiError(draftData.error));
        return;
      }
      const id: string = String(draftData.data.job._id);
      setJobId(id);

      // 2) Trigger AI generation
      const genRes = await fetch(`/api/jobs/${id}/generate`, { method: "POST" });
      const genData = await genRes.json();
      if (!genData.ok) {
        setError(formatApiError(genData.error) || "AI generation failed");
        return;
      }
      setGenerated({ ...(genData.data.job as GeneratedJob), _id: id });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/generate`, { method: "POST" });
      const data = await res.json();
      if (data.ok) setGenerated({ ...(data.data.job as GeneratedJob), _id: jobId });
      else setError(formatApiError(data.error) || "Regenerate failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    if (!jobId || !generated) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: generated.description,
          responsibilities: generated.responsibilities,
          requirements: generated.requirements,
          preferredQualifications: generated.preferredQualifications,
          screeningQuestions: generated.screeningQuestions,
          interviewProcessSummary: generated.interviewProcessSummary,
        }),
      });
      const data = await res.json();
      if (!data.ok) setError(formatApiError(data.error) || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: selectedProviders }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(formatApiError(data.error) || "Publish failed");
        return;
      }
      setPublishResults(data.data.results as PublishResult[]);
    } finally {
      setBusy(false);
    }
  }

  const canAdvanceFromStep0 =
    draft.title.trim().length >= 2 &&
    draft.department.trim().length >= 2 &&
    draft.location.trim().length >= 2;
  const canAdvanceFromStep1 = !!draft.salary && draft.salary.max >= draft.salary.min;

  return (
    <div>
      <Stepper step={step} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-indigo-50/40 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-lg font-semibold text-slate-900">{STEPS[step]}</h2>
        </div>

        <div className="p-5">
          {step === 0 && <Step0 draft={draft} update={update} />}
          {step === 1 && <Step1 draft={draft} update={update} />}
          {step === 2 && <Step2 draft={draft} update={update} />}
          {step === 3 && generated && (
            <Step3Review
              generated={generated}
              setGenerated={setGenerated}
              regenerate={regenerate}
              saveEdits={saveEdits}
              busy={busy}
            />
          )}
          {step === 4 && (
            <Step4Publish
              integrationStatus={integrationStatus}
              selectedProviders={selectedProviders}
              setSelectedProviders={setSelectedProviders}
              publish={publish}
              busy={busy}
              results={publishResults}
              jobId={jobId}
            />
          )}

          {error && (
            <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || busy}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-40"
          >
            Back
          </button>

          {step === 0 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={!canAdvanceFromStep0}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              Next
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canAdvanceFromStep1}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              Next
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              onClick={saveDraftAndGenerate}
              disabled={busy}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Generating with AI…" : "Generate with AI →"}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              onClick={async () => {
                await saveEdits();
                setStep(4);
              }}
              disabled={busy}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Continue to publish →
            </button>
          )}
          {step === 4 && publishResults && (
            <button
              type="button"
              onClick={() => jobId && router.push(`/dashboard/jobs/${jobId}`)}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white"
            >
              View job
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-5 flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-medium ${
              i < step
                ? "bg-emerald-500 text-white"
                : i === step
                ? "bg-indigo-600 text-white"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {i < step ? "✓" : i + 1}
          </span>
          <span className={i <= step ? "text-slate-900" : "text-slate-500"}>{label}</span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
}

function Step0({
  draft,
  update,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Text label="Job title" value={draft.title} onChange={(v) => update("title", v)} placeholder="Senior Backend Engineer" />
      <Text
        label="Department"
        value={draft.department}
        onChange={(v) => update("department", v)}
        placeholder="Engineering"
      />
      <Text label="Location" value={draft.location} onChange={(v) => update("location", v)} placeholder="San Francisco, CA" />
      <NumberField
        label="Number of openings"
        value={draft.numberOfOpenings}
        onChange={(v) => update("numberOfOpenings", v)}
        min={1}
        max={500}
      />
      <SegmentedField
        label="Work mode"
        value={draft.workMode}
        options={[
          { value: "remote", label: "Remote" },
          { value: "hybrid", label: "Hybrid" },
          { value: "onsite", label: "Onsite" },
        ]}
        onChange={(v) => update("workMode", v as WorkMode)}
      />
      <SegmentedField
        label="Employment type"
        value={draft.type}
        options={[
          { value: "full-time", label: "Full-time" },
          { value: "part-time", label: "Part-time" },
          { value: "contract", label: "Contract" },
          { value: "remote", label: "Remote" },
        ]}
        onChange={(v) => update("type", v as EmploymentType)}
      />
    </div>
  );
}

function Step1({
  draft,
  update,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  const salary = draft.salary ?? { min: 0, max: 0, currency: "USD", period: "year" as const };
  return (
    <div className="space-y-5">
      <Text
        label="Experience required"
        value={draft.experienceRequired}
        onChange={(v) => update("experienceRequired", v)}
        placeholder="5+ years"
      />

      <TagInput
        label="Required skills"
        value={draft.skills}
        onChange={(v) => update("skills", v)}
        placeholder="Type a skill, press Enter (e.g. TypeScript)"
      />

      <fieldset className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
        <legend className="px-1 text-xs font-medium text-slate-600">Salary range</legend>
        <NumberField
          label="Min"
          value={salary.min}
          onChange={(v) => update("salary", { ...salary, min: v })}
          min={0}
        />
        <NumberField
          label="Max"
          value={salary.max}
          onChange={(v) => update("salary", { ...salary, max: v })}
          min={0}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Currency</label>
          <select
            value={salary.currency}
            onChange={(e) => update("salary", { ...salary, currency: e.target.value })}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          >
            {["USD", "EUR", "GBP", "INR", "AUD", "CAD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Per</label>
          <select
            value={salary.period}
            onChange={(e) =>
              update("salary", { ...salary, period: e.target.value as "year" | "month" | "hour" })
            }
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          >
            <option value="year">Year</option>
            <option value="month">Month</option>
            <option value="hour">Hour</option>
          </select>
        </div>
      </fieldset>

      <InterviewRoundsField
        rounds={draft.interviewRounds}
        onChange={(v) => update("interviewRounds", v)}
      />
    </div>
  );
}

function Step2({
  draft,
  update,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        These are optional. AI will generate professional content from your basics — but anything
        you provide here, the AI will preserve and refine.
      </p>
      <Textarea
        label="Description (optional)"
        value={draft.description}
        onChange={(v) => update("description", v)}
        placeholder="A few sentences about the role…"
        rows={4}
      />
      <TagInput
        label="Requirements (optional)"
        value={draft.requirements}
        onChange={(v) => update("requirements", v)}
        placeholder="One requirement per entry"
      />
      <TagInput
        label="Responsibilities (optional)"
        value={draft.responsibilities}
        onChange={(v) => update("responsibilities", v)}
        placeholder="One responsibility per entry"
      />
      <TagInput
        label="Preferred qualifications (optional)"
        value={draft.preferredQualifications}
        onChange={(v) => update("preferredQualifications", v)}
        placeholder="Nice-to-haves"
      />
    </div>
  );
}

function Step3Review({
  generated,
  setGenerated,
  regenerate,
  saveEdits,
  busy,
}: {
  generated: GeneratedJob;
  setGenerated: (g: GeneratedJob) => void;
  regenerate: () => Promise<void>;
  saveEdits: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{generated.title}</h3>
        <div className="flex gap-2">
          <button
            onClick={regenerate}
            disabled={busy}
            className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
          >
            ↻ Regenerate
          </button>
          <button
            onClick={saveEdits}
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-60"
          >
            Save edits
          </button>
        </div>
      </div>

      <Textarea
        label="Description"
        value={generated.description}
        onChange={(v) => setGenerated({ ...generated, description: v })}
        rows={8}
      />
      <ListEditor
        label="Responsibilities"
        items={generated.responsibilities}
        onChange={(v) => setGenerated({ ...generated, responsibilities: v })}
      />
      <ListEditor
        label="Requirements"
        items={generated.requirements}
        onChange={(v) => setGenerated({ ...generated, requirements: v })}
      />
      <ListEditor
        label="Preferred qualifications"
        items={generated.preferredQualifications}
        onChange={(v) => setGenerated({ ...generated, preferredQualifications: v })}
      />
      <ListEditor
        label="Screening questions"
        items={generated.screeningQuestions}
        onChange={(v) => setGenerated({ ...generated, screeningQuestions: v })}
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Suggested skills (from AI)</label>
        <div className="flex flex-wrap gap-1">
          {generated.suggestedSkills.length === 0 ? (
            <p className="text-sm text-slate-400">—</p>
          ) : (
            generated.suggestedSkills.map((s) => (
              <span key={s} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                {s}
              </span>
            ))
          )}
        </div>
      </div>
      <Textarea
        label="Interview process"
        value={generated.interviewProcessSummary}
        onChange={(v) => setGenerated({ ...generated, interviewProcessSummary: v })}
        rows={3}
      />
    </div>
  );
}

type PublishResult = {
  provider: IntegrationProvider;
  ok: boolean;
  message?: string;
  errorCode?: string;
  publication?: { externalUrl?: string; externalPostId?: string };
};

function Step4Publish({
  integrationStatus,
  selectedProviders,
  setSelectedProviders,
  publish,
  busy,
  results,
  jobId,
}: {
  integrationStatus: IntegrationStatus[];
  selectedProviders: IntegrationProvider[];
  setSelectedProviders: (p: IntegrationProvider[]) => void;
  publish: () => Promise<void>;
  busy: boolean;
  results: PublishResult[] | null;
  jobId: string | null;
}) {
  const toggle = (p: IntegrationProvider) =>
    setSelectedProviders(
      selectedProviders.includes(p)
        ? selectedProviders.filter((x) => x !== p)
        : [...selectedProviders, p]
    );

  const successes = useMemo(() => results?.filter((r) => r.ok) ?? [], [results]);
  const failures = useMemo(() => results?.filter((r) => !r.ok) ?? [], [results]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">Where do you want to publish this job?</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {integrationStatus.map((it) => {
          const meta = PROVIDER_META[it.provider];
          const selected = selectedProviders.includes(it.provider);
          const connected = it.status === "connected";
          return (
            <label
              key={it.provider}
              className={`relative cursor-pointer overflow-hidden rounded-xl border bg-white p-4 transition ${
                selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected}
                onChange={() => toggle(it.provider)}
              />
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.gradient}`} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br ${meta.gradient} text-sm font-bold text-white`}
                  >
                    {meta.name[0]}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{meta.name}</p>
                    <p className="text-xs text-slate-500">{it.accountEmail || "Not connected"}</p>
                  </div>
                </div>
                {connected ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">
                    Connected
                  </span>
                ) : (
                  <a
                    href="/dashboard/integrations"
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Connect →
                  </a>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {selectedProviders.length === 0
            ? "Select at least one platform"
            : `Will publish to ${selectedProviders.length} platform${selectedProviders.length === 1 ? "" : "s"}.`}
        </p>
        <button
          type="button"
          onClick={publish}
          disabled={busy || selectedProviders.length === 0 || !jobId}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy
            ? "Publishing…"
            : selectedProviders.length === 1 && selectedProviders[0] === "linkedin"
            ? "Publish to LinkedIn"
            : "Publish"}
        </button>
      </div>

      {successes.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">Published successfully</p>
          <ul className="mt-2 space-y-1">
            {successes.map((r) => (
              <li key={r.provider} className="flex items-center justify-between text-sm">
                <span className="text-emerald-900">{PROVIDER_META[r.provider].name}</span>
                {r.publication?.externalUrl && (
                  <a
                    href={r.publication.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-700 underline"
                  >
                    Open job URL ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failures.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">Some publishes failed</p>
          <ul className="mt-2 space-y-1 text-sm text-rose-900">
            {failures.map((r) => (
              <li key={r.provider}>
                <span className="font-medium">{PROVIDER_META[r.provider].name}:</span>{" "}
                {r.message ?? r.errorCode}
                {r.errorCode === "not_connected" && (
                  <a href="/dashboard/integrations" className="ml-2 text-xs underline">
                    Connect →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// — primitives —

function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
      />
    </div>
  );
}

function SegmentedField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              value === o.value
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function commit() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!value.includes(trimmed)) onChange([...value, trimmed]);
    setInput("");
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="text-indigo-500 hover:text-indigo-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !input && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="flex-1 border-none bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>
    </div>
  );
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-2 h-1 w-1 flex-none rounded-full bg-slate-400" />
            <textarea
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              rows={1}
              className="flex-1 resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-xs text-slate-400 hover:text-rose-500"
              aria-label="Remove"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="mt-2 text-xs text-indigo-600 hover:underline"
      >
        + Add item
      </button>
    </div>
  );
}

function InterviewRoundsField({
  rounds,
  onChange,
}: {
  rounds: { name: string; type: string }[];
  onChange: (v: { name: string; type: string }[]) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">Interview rounds</label>
      <ul className="space-y-2">
        {rounds.map((r, i) => (
          <li key={i} className="flex gap-2">
            <input
              value={r.name}
              onChange={(e) => {
                const next = [...rounds];
                next[i] = { ...next[i], name: e.target.value };
                onChange(next);
              }}
              placeholder="Round name"
              className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <select
              value={r.type}
              onChange={(e) => {
                const next = [...rounds];
                next[i] = { ...next[i], type: e.target.value };
                onChange(next);
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
            >
              {["screening", "technical", "system_design", "behavioral", "managerial", "hr", "other"].map(
                (t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                )
              )}
            </select>
            <button
              type="button"
              onClick={() => onChange(rounds.filter((_, idx) => idx !== i))}
              className="text-xs text-slate-400 hover:text-rose-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...rounds, { name: "", type: "technical" }])}
        className="mt-2 text-xs text-indigo-600 hover:underline"
      >
        + Add round
      </button>
    </div>
  );
}

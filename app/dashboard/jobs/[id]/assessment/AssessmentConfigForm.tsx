"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  CODING_LANGUAGES,
  type DifficultyLevel,
  type QuestionType,
  type CodingLanguage,
  type QuestionCountMode,
} from "@/app/lib/constants/assessment";

export type InitialConfig = {
  difficulty: DifficultyLevel;
  enabledQuestionTypes: QuestionType[];
  durationMinutes: number;
  questionCountMode: QuestionCountMode;
  questionCount: number;
  skills: string[];
  passingCriteria: {
    overallPercent: number;
    sectionMinimums: { type: QuestionType; minPercent: number }[];
    mandatoryTypes: QuestionType[];
  };
  antiCheat: {
    tabSwitchDetection: boolean;
    fullscreenRequired: boolean;
    blockCopyPaste: boolean;
    webcamMonitoring: boolean;
    trackSuspiciousActivity: boolean;
    maxViolations: number;
  };
  coding: {
    languages: CodingLanguage[];
    timeoutSeconds: number;
    enableQualityAnalysis: boolean;
  };
  isPublished: boolean;
};

const DIFFICULTY_META: Record<DifficultyLevel, { label: string; hint: string }> = {
  easy: { label: "Easy", hint: "Foundational. Good for junior or screening." },
  medium: { label: "Medium", hint: "Mid-level depth. Balanced across skills." },
  hard: { label: "Hard", hint: "Senior-level. Architecture, optimization, edge cases." },
  adaptive: {
    label: "Adaptive AI",
    hint: "Difficulty shifts in real time based on candidate answers.",
  },
};

const QUESTION_TYPE_META: Record<QuestionType, { label: string; hint: string }> = {
  mcq: { label: "MCQ", hint: "Single-correct multiple choice." },
  multi_select: { label: "Multi-select", hint: "Multiple correct options." },
  coding: { label: "Coding", hint: "Live editor with test cases." },
  short_answer: { label: "Short answer", hint: "Free-text, AI-scored." },
  scenario: { label: "Scenario", hint: "Real-world judgement problems." },
  debugging: { label: "Debugging", hint: "Find & fix bugs in given code." },
  sql: { label: "SQL", hint: "Run queries against a sample schema." },
  video: { label: "Video answer", hint: "Recorded response (Phase 3)." },
  voice: { label: "Voice answer", hint: "Audio response (Phase 3)." },
};

const DURATION_PRESETS = [15, 30, 45, 60];
const COUNT_PRESETS = [10, 20, 30];

const SKILL_SUGGESTIONS = [
  "React",
  "Node.js",
  "TypeScript",
  "MongoDB",
  "PostgreSQL",
  "AWS",
  "Docker",
  "Kubernetes",
  "SQL",
  "Python",
  "Java",
  "System Design",
  "Communication",
  "Problem Solving",
];

const CODING_LANG_LABELS: Record<CodingLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  cpp: "C++",
  sql: "SQL",
};

function formatApiError(error: unknown): string {
  if (!error || typeof error !== "object") return "Request failed";
  const e = error as {
    message?: string;
    details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  };
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

export default function AssessmentConfigForm({
  jobId,
  jobSkills,
  initial,
}: {
  jobId: string;
  jobTitle: string;
  jobSkills: string[];
  initial: InitialConfig;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<InitialConfig>(initial);
  const [skillInput, setSkillInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const codingEnabled = useMemo(
    () =>
      cfg.enabledQuestionTypes.includes("coding") ||
      cfg.enabledQuestionTypes.includes("sql") ||
      cfg.enabledQuestionTypes.includes("debugging"),
    [cfg.enabledQuestionTypes]
  );

  function patch<K extends keyof InitialConfig>(k: K, v: InitialConfig[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  function toggleType(t: QuestionType) {
    setCfg((c) => {
      const enabled = c.enabledQuestionTypes.includes(t);
      const next = enabled
        ? c.enabledQuestionTypes.filter((x) => x !== t)
        : [...c.enabledQuestionTypes, t];
      // If we just disabled a type, also drop it from mandatoryTypes / sectionMinimums
      // so the form stays internally consistent.
      const mandatory = enabled
        ? c.passingCriteria.mandatoryTypes.filter((x) => x !== t)
        : c.passingCriteria.mandatoryTypes;
      const sections = enabled
        ? c.passingCriteria.sectionMinimums.filter((s) => s.type !== t)
        : c.passingCriteria.sectionMinimums;
      return {
        ...c,
        enabledQuestionTypes: next,
        passingCriteria: { ...c.passingCriteria, mandatoryTypes: mandatory, sectionMinimums: sections },
      };
    });
  }

  function addSkill(raw: string) {
    const s = raw.trim();
    if (!s) return;
    if (cfg.skills.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    patch("skills", [...cfg.skills, s]);
    setSkillInput("");
  }

  function removeSkill(s: string) {
    patch("skills", cfg.skills.filter((x) => x !== s));
  }

  async function save(publish: boolean) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/assessment-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cfg, isPublished: publish ? true : cfg.isPublished }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(formatApiError(json.error));
        return;
      }
      patch("isPublished", json.data.config.isPublished);
      setToast(publish ? "Assessment published — candidates can take it now." : "Configuration saved.");
      setTimeout(() => setToast(null), 3500);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {toast && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {toast}
        </div>
      )}

      {/* DIFFICULTY */}
      <Section
        title="Difficulty"
        description="How challenging the AI should make the question set."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DIFFICULTY_LEVELS.map((d) => {
            const active = cfg.difficulty === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => patch("difficulty", d)}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-200"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="text-sm font-medium text-slate-900">
                  {DIFFICULTY_META[d].label}
                </div>
                <p className="mt-1 text-xs text-slate-500">{DIFFICULTY_META[d].hint}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* QUESTION TYPES */}
      <Section
        title="Question types"
        description="Enable the formats candidates can be asked. The AI will mix these based on the selected skills."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {QUESTION_TYPES.map((t) => {
            const active = cfg.enabledQuestionTypes.includes(t);
            const isPhase3 = t === "video" || t === "voice";
            return (
              <button
                key={t}
                type="button"
                disabled={isPhase3}
                onClick={() => toggleType(t)}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-indigo-500 bg-indigo-50/60"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } ${isPhase3 ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {QUESTION_TYPE_META[t].label}
                    {isPhase3 && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{QUESTION_TYPE_META[t].hint}</p>
                </div>
                <Checkbox checked={active} readOnly />
              </button>
            );
          })}
        </div>
      </Section>

      {/* DURATION + COUNT */}
      <Section title="Quiz duration & length" description="">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Label>Total duration (minutes)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATION_PRESETS.map((m) => (
                <PresetPill
                  key={m}
                  active={cfg.durationMinutes === m}
                  onClick={() => patch("durationMinutes", m)}
                >
                  {m} min
                </PresetPill>
              ))}
              <input
                type="number"
                min={1}
                max={480}
                value={cfg.durationMinutes}
                onChange={(e) => patch("durationMinutes", Math.max(1, Number(e.target.value) || 0))}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          <div>
            <Label>Number of questions</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COUNT_PRESETS.map((c) => (
                <PresetPill
                  key={c}
                  active={cfg.questionCountMode === "fixed" && cfg.questionCount === c}
                  onClick={() => {
                    patch("questionCountMode", "fixed");
                    patch("questionCount", c);
                  }}
                >
                  {c}
                </PresetPill>
              ))}
              <PresetPill
                active={cfg.questionCountMode === "dynamic"}
                onClick={() => patch("questionCountMode", "dynamic")}
              >
                AI decides
              </PresetPill>
              {cfg.questionCountMode === "fixed" && (
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={cfg.questionCount}
                  onChange={(e) =>
                    patch("questionCount", Math.max(1, Number(e.target.value) || 0))
                  }
                  className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              )}
            </div>
            {cfg.questionCountMode === "dynamic" && (
              <p className="mt-2 text-xs text-slate-500">
                AI will choose a count based on duration and the candidate&apos;s pace.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* SKILLS */}
      <Section
        title="Skills to test"
        description="The AI will only generate questions from these skills."
      >
        <div className="flex flex-wrap gap-2">
          {cfg.skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
            >
              {s}
              <button
                type="button"
                onClick={() => removeSkill(s)}
                className="text-indigo-500 hover:text-indigo-800"
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill(skillInput);
              }
            }}
            placeholder="Add a skill and press Enter"
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => addSkill(skillInput)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            Suggestions
            {jobSkills.length > 0 && " (from job + common)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set([...jobSkills, ...SKILL_SUGGESTIONS]))
              .filter((s) => !cfg.skills.some((c) => c.toLowerCase() === s.toLowerCase()))
              .slice(0, 18)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addSkill(s)}
                  className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                >
                  + {s}
                </button>
              ))}
          </div>
        </div>
      </Section>

      {/* PASSING CRITERIA */}
      <Section
        title="Passing criteria"
        description="Used by the AI evaluator to decide pass / fail."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Label>Overall passing percentage</Label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={cfg.passingCriteria.overallPercent}
                onChange={(e) =>
                  patch("passingCriteria", {
                    ...cfg.passingCriteria,
                    overallPercent: Number(e.target.value),
                  })
                }
                className="flex-1 accent-indigo-600"
              />
              <span className="w-12 text-right text-sm font-semibold text-slate-900">
                {cfg.passingCriteria.overallPercent}%
              </span>
            </div>
          </div>

          <div>
            <Label>Mandatory sections</Label>
            <p className="text-xs text-slate-500">
              Candidate must answer at least one question of each selected type.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {cfg.enabledQuestionTypes.map((t) => {
                const active = cfg.passingCriteria.mandatoryTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      patch("passingCriteria", {
                        ...cfg.passingCriteria,
                        mandatoryTypes: active
                          ? cfg.passingCriteria.mandatoryTypes.filter((x) => x !== t)
                          : [...cfg.passingCriteria.mandatoryTypes, t],
                      })
                    }
                    className={`rounded-full px-3 py-1 text-xs ${
                      active
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-300 text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {QUESTION_TYPE_META[t].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Label>Per-section minimums (optional)</Label>
          <p className="text-xs text-slate-500">
            Require a minimum score in specific question types.
          </p>
          <div className="mt-2 space-y-2">
            {cfg.enabledQuestionTypes.map((t) => {
              const existing = cfg.passingCriteria.sectionMinimums.find((s) => s.type === t);
              return (
                <div key={t} className="flex items-center gap-3">
                  <span className="w-32 text-sm text-slate-700">
                    {QUESTION_TYPE_META[t].label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={existing?.minPercent ?? 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const others = cfg.passingCriteria.sectionMinimums.filter(
                        (s) => s.type !== t
                      );
                      patch("passingCriteria", {
                        ...cfg.passingCriteria,
                        sectionMinimums:
                          v > 0 ? [...others, { type: t, minPercent: v }] : others,
                      });
                    }}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="w-12 text-right text-xs text-slate-600">
                    {existing?.minPercent ?? 0}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ANTI-CHEAT */}
      <Section
        title="Anti-cheating"
        description="Behavior to enforce while the candidate takes the assessment."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Detect tab switching"
            hint="Flag when the candidate leaves the assessment tab."
            checked={cfg.antiCheat.tabSwitchDetection}
            onChange={(v) =>
              patch("antiCheat", { ...cfg.antiCheat, tabSwitchDetection: v })
            }
          />
          <Toggle
            label="Require fullscreen"
            hint="Force fullscreen for the entire attempt."
            checked={cfg.antiCheat.fullscreenRequired}
            onChange={(v) =>
              patch("antiCheat", { ...cfg.antiCheat, fullscreenRequired: v })
            }
          />
          <Toggle
            label="Block copy / paste"
            hint="Disable clipboard within the assessment view."
            checked={cfg.antiCheat.blockCopyPaste}
            onChange={(v) =>
              patch("antiCheat", { ...cfg.antiCheat, blockCopyPaste: v })
            }
          />
          <Toggle
            label="Webcam monitoring"
            hint="Detect multiple people or no face during the attempt."
            checked={cfg.antiCheat.webcamMonitoring}
            onChange={(v) =>
              patch("antiCheat", { ...cfg.antiCheat, webcamMonitoring: v })
            }
          />
          <Toggle
            label="Track suspicious activity"
            hint="Log violations to the candidate report for HR review."
            checked={cfg.antiCheat.trackSuspiciousActivity}
            onChange={(v) =>
              patch("antiCheat", { ...cfg.antiCheat, trackSuspiciousActivity: v })
            }
          />
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <Label>Auto-terminate after N violations</Label>
            <p className="text-xs text-slate-500">0 = never auto-terminate.</p>
            <input
              type="number"
              min={0}
              max={50}
              value={cfg.antiCheat.maxViolations}
              onChange={(e) =>
                patch("antiCheat", {
                  ...cfg.antiCheat,
                  maxViolations: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="mt-2 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        </div>
      </Section>

      {/* CODING SETTINGS — only shown if a coding-like type is enabled */}
      {codingEnabled && (
        <Section
          title="Coding playground"
          description="Languages and limits for coding / SQL / debugging questions."
        >
          <div>
            <Label>Allowed languages</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CODING_LANGUAGES.map((lang) => {
                const active = cfg.coding.languages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() =>
                      patch("coding", {
                        ...cfg.coding,
                        languages: active
                          ? cfg.coding.languages.filter((l) => l !== lang)
                          : [...cfg.coding.languages, lang],
                      })
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      active
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-300 text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {CODING_LANG_LABELS[lang]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Execution timeout (seconds per run)</Label>
              <input
                type="number"
                min={1}
                max={60}
                value={cfg.coding.timeoutSeconds}
                onChange={(e) =>
                  patch("coding", {
                    ...cfg.coding,
                    timeoutSeconds: Math.max(1, Math.min(60, Number(e.target.value) || 1)),
                  })
                }
                className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Bounded by Piston&apos;s free-tier limits.
              </p>
            </div>
            <Toggle
              label="AI quality analysis"
              hint="Score code quality, complexity, and approach beyond correctness."
              checked={cfg.coding.enableQualityAnalysis}
              onChange={(v) => patch("coding", { ...cfg.coding, enableQualityAnalysis: v })}
            />
          </div>
        </Section>
      )}

      {/* ACTIONS */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:px-5">
        <p className="text-xs text-slate-500">
          {cfg.isPublished ? (
            <>
              <span className="font-medium text-emerald-700">Published.</span> Candidates can
              take this assessment now.
            </>
          ) : (
            "Save a draft any time. Publish when ready to let candidates start."
          )}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => save(false)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save(true)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {cfg.isPublished ? "Update & republish" : "Save & publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

function PresetPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-indigo-600 text-white"
          : "border border-slate-300 text-slate-700 hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

function Checkbox({ checked, readOnly }: { checked: boolean; readOnly?: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border ${
        checked ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"
      }`}
      aria-hidden={readOnly}
    >
      {checked && (
        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6L5 8.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-slate-300"
      }`}
    >
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 flex-none items-center rounded-full transition ${
          checked ? "bg-indigo-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </label>
  );
}

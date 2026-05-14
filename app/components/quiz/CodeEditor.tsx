"use client";

import { useCallback, useState } from "react";

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  compileError?: string;
  error?: string;
}

interface CodeEditorProps {
  language: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Languages Piston supports via /api/code/run. Drives whether Run is shown. */
  runnable?: boolean;
}

const LANGUAGE_LABEL: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  cpp: "C++",
  sql: "SQL",
};

export default function CodeEditor({
  language,
  value,
  onChange,
  disabled,
  runnable = true,
}: Readonly<CodeEditorProps>) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab inserts two spaces instead of moving focus.
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = `${value.slice(0, start)}  ${value.slice(end)}`;
        onChange(next);
        // restore caret position after insert
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [onChange, value]
  );

  const runCode = useCallback(async () => {
    if (running || disabled) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ stdout: "", stderr: "", exitCode: -1, error: data.error ?? "Run failed" });
      } else {
        setResult(data as RunResult);
      }
    } catch {
      setResult({ stdout: "", stderr: "", exitCode: -1, error: "Network error — please try again" });
    } finally {
      setRunning(false);
    }
  }, [disabled, language, running, value]);

  const langLabel = LANGUAGE_LABEL[language] ?? language;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-2">
        <span className="text-xs font-semibold text-slate-300">{langLabel}</span>
        {runnable && (
          <button
            type="button"
            onClick={runCode}
            disabled={running || disabled}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {running ? "Running…" : "Run"}
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={14}
        spellCheck={false}
        className="block w-full resize-y bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-emerald-100 outline-none placeholder:text-slate-500 disabled:opacity-60"
        placeholder={`Write your ${langLabel} solution here…`}
      />
      {result && (
        <div className="border-t border-slate-800 bg-slate-900 p-3 text-xs">
          {result.error ? (
            <p className="text-rose-300">{result.error}</p>
          ) : (
            <div className="space-y-2">
              {result.compileError && (
                <div>
                  <p className="font-semibold text-amber-300">Compile error</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-amber-100">
                    {result.compileError}
                  </pre>
                </div>
              )}
              {result.stdout && (
                <div>
                  <p className="font-semibold text-emerald-300">stdout</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-emerald-100">
                    {result.stdout}
                  </pre>
                </div>
              )}
              {result.stderr && (
                <div>
                  <p className="font-semibold text-rose-300">stderr</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-rose-200">
                    {result.stderr}
                  </pre>
                </div>
              )}
              {!result.stdout && !result.stderr && !result.compileError && (
                <p className="text-slate-400">
                  Ran with exit code {result.exitCode}. No output.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

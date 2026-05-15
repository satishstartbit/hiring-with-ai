"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  PAGE_SIZE_OPTIONS,
  type CandidateListRow,
  type SortField,
} from "@/app/lib/candidates/passedCandidatesShared";

const STAGE_META: Record<string, { label: string; className: string }> = {
  screening: { label: "Screening", className: "bg-slate-100 text-slate-700" },
  quiz_in_progress: { label: "Quiz in progress", className: "bg-amber-100 text-amber-700" },
  quiz_completed: { label: "Quiz passed", className: "bg-indigo-100 text-indigo-700" },
  interview_in_progress: { label: "Interviewing", className: "bg-violet-100 text-violet-700" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700" },
};

const SORT_LABELS: Record<SortField, string> = {
  updatedAt: "Last activity",
  appliedAt: "Applied date",
  quizSubmittedAt: "Quiz submitted",
  name: "Name",
  jobTitle: "Job",
  resumeMatchScore: "Resume match",
  answerScore: "Quiz score",
  stage: "Stage",
  interviewScore: "Interview score",
  passed: "Passed status",
};

function PassBadge({ passed, passLabel }: Readonly<{ passed: boolean; passLabel: string }>) {
  if (passed) {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        {passLabel}
      </span>
    );
  }
  if (passLabel === "Not passed") {
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
        {passLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
      {passLabel}
    </span>
  );
}

function scorePillClass(score: number): string {
  if (score >= 75) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-rose-700";
}

function ScoreCell({ score }: Readonly<{ score?: number | null }>) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className={`text-sm font-bold tabular-nums ${scorePillClass(score)}`}>
      {score}
      <span className="text-xs font-normal text-slate-400">/100</span>
    </span>
  );
}

function buildQueryString(
  base: URLSearchParams,
  updates: Record<string, string | number | undefined>
): string {
  const next = new URLSearchParams(base.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export default function CandidatesListClient({
  candidates,
  total,
  page,
  limit,
  totalPages,
  sort,
  order,
  search,
}: Readonly<{
  candidates: CandidateListRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sort: SortField;
  order: "asc" | "desc";
  search: string;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const pushParams = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const href = `${pathname}${buildQueryString(searchParams, updates)}`;
      startTransition(() => {
        router.push(href);
      });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() === search) return;
      pushParams({ q: searchInput.trim() || undefined, page: 1 });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, pushParams]);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages;
  }, [page, totalPages]);

  function handleSort(field: SortField) {
    if (sort === field) {
      pushParams({ sort: field, order: order === "asc" ? "desc" : "asc", page: 1 });
    } else {
      pushParams({ sort: field, order: field === "name" || field === "jobTitle" ? "asc" : "desc", page: 1 });
    }
  }

  function sortIndicator(field: SortField): string {
    if (sort !== field) return "";
    return order === "asc" ? " ↑" : " ↓";
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="block min-w-[200px] flex-1 sm:max-w-md">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, email, job, company…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Per page
          </span>
          <select
            value={limit}
            onChange={(e) => pushParams({ limit: e.target.value, page: 1 })}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[180px]">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sort by
          </span>
          <select
            value={sort}
            onChange={(e) =>
              pushParams({
                sort: e.target.value,
                order: e.target.value === "name" || e.target.value === "jobTitle" ? "asc" : "desc",
                page: 1,
              })
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {(Object.keys(SORT_LABELS) as SortField[]).map((field) => (
              <option key={field} value={field}>
                {SORT_LABELS[field]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-slate-500">
        {total === 0 ? (
          "No candidates match your filters."
        ) : (
          <>
            Showing <span className="font-medium text-slate-700">{from}–{to}</span> of{" "}
            <span className="font-medium text-slate-700">{total}</span>
            {search ? (
              <>
                {" "}
                for &ldquo;<span className="font-medium text-slate-700">{search}</span>&rdquo;
              </>
            ) : null}
            {isPending && <span className="ml-2 text-indigo-600">Updating…</span>}
          </>
        )}
      </p>

      {candidates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h3 className="text-base font-semibold text-slate-900">No results</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try a different search term or clear filters.
          </p>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                pushParams({ q: undefined, page: 1 });
              }}
              className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div
          className={`overflow-x-auto rounded-lg border border-slate-200 bg-white ${isPending ? "opacity-60" : ""}`}
        >
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">
                  <SortHeader label="Candidate" field="name" onSort={handleSort} indicator={sortIndicator("name")} />
                </th>
                <th className="px-4 py-2">
                  <SortHeader label="Job" field="jobTitle" onSort={handleSort} indicator={sortIndicator("jobTitle")} />
                </th>
                <th className="px-4 py-2">Resume</th>
                <th className="px-4 py-2">
                  <SortHeader
                    label="Match"
                    field="resumeMatchScore"
                    onSort={handleSort}
                    indicator={sortIndicator("resumeMatchScore")}
                  />
                </th>
                <th className="px-4 py-2">
                  <SortHeader
                    label="Quiz"
                    field="answerScore"
                    onSort={handleSort}
                    indicator={sortIndicator("answerScore")}
                  />
                </th>
                <th className="px-4 py-2">
                  <SortHeader
                    label="Interview"
                    field="interviewScore"
                    onSort={handleSort}
                    indicator={sortIndicator("interviewScore")}
                  />
                </th>
                <th className="px-4 py-2">
                  <SortHeader
                    label="Status"
                    field="passed"
                    onSort={handleSort}
                    indicator={sortIndicator("passed")}
                  />
                </th>
                <th className="px-4 py-2">
                  <SortHeader label="Stage" field="stage" onSort={handleSort} indicator={sortIndicator("stage")} />
                </th>
                <th className="px-4 py-2">
                  <SortHeader
                    label="Applied"
                    field="appliedAt"
                    onSort={handleSort}
                    indicator={sortIndicator("appliedAt")}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const stage = STAGE_META[c.stage] ?? {
                  label: c.stage,
                  className: "bg-slate-100 text-slate-600",
                };
                const role = c.currentTitle
                  ? c.currentCompany
                    ? `${c.currentTitle} · ${c.currentCompany}`
                    : c.currentTitle
                  : null;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/candidates/${c.id}`}
                        className="block font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-slate-500">{c.email}</div>
                      {role && <div className="text-xs text-slate-400">{role}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.jobTitle}</td>
                    <td className="px-4 py-3">
                      {c.resumeFilename ? (
                        <a
                          href={`/api/resumes/${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`View ${c.resumeFilename}`}
                          className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                        >
                          View
                        </a>
                      ) : (
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          No resume
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ScoreCell score={c.resumeMatchScore} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreCell score={c.answerScore} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreCell score={c.interviewScore} />
                    </td>
                    <td className="px-4 py-3">
                      <PassBadge passed={c.passed} passLabel={c.passLabel} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${stage.className}`}
                      >
                        {stage.label}
                      </span>
                      {c.proctoringFlagged && (
                        <span className="mt-1 block text-xs font-semibold text-rose-600">
                          ⚠ Proctoring flagged
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {c.appliedAt
                        ? new Date(c.appliedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav
          className="flex flex-wrap items-center justify-center gap-1"
          aria-label="Pagination"
        >
          <PaginationButton
            disabled={page <= 1 || isPending}
            onClick={() => pushParams({ page: page - 1 })}
          >
            Previous
          </PaginationButton>
          {pageNumbers[0] > 1 && (
            <>
              <PaginationButton disabled={isPending} onClick={() => pushParams({ page: 1 })}>
                1
              </PaginationButton>
              {pageNumbers[0] > 2 && <span className="px-1 text-slate-400">…</span>}
            </>
          )}
          {pageNumbers.map((p) => (
            <PaginationButton
              key={p}
              active={p === page}
              disabled={isPending}
              onClick={() => pushParams({ page: p })}
            >
              {p}
            </PaginationButton>
          ))}
          {pageNumbers[pageNumbers.length - 1] < totalPages && (
            <>
              {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                <span className="px-1 text-slate-400">…</span>
              )}
              <PaginationButton disabled={isPending} onClick={() => pushParams({ page: totalPages })}>
                {totalPages}
              </PaginationButton>
            </>
          )}
          <PaginationButton
            disabled={page >= totalPages || isPending}
            onClick={() => pushParams({ page: page + 1 })}
          >
            Next
          </PaginationButton>
        </nav>
      )}
    </div>
  );
}

function SortHeader({
  label,
  field,
  onSort,
  indicator,
}: Readonly<{
  label: string;
  field: SortField;
  onSort: (field: SortField) => void;
  indicator: string;
}>) {
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-0.5 font-semibold uppercase tracking-wide text-slate-500 hover:text-indigo-700"
    >
      {label}
      <span className="text-indigo-600 normal-case">{indicator}</span>
    </button>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
  active,
}: Readonly<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[2.25rem] rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : disabled
            ? "cursor-not-allowed text-slate-300"
            : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

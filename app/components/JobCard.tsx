"use client";

import Link from "next/link";
import { useState } from "react";
import ApplyModal from "./ApplyModal";

interface Job {
  _id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  status: string;
  applicantCount: number;
  description?: string;
  requirements?: string[];
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-blue-50 text-blue-700 border-blue-200",
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  closed: "bg-red-50 text-red-700 border-red-200",
  filled: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function JobCard({ job }: { readonly job: Job }) {
  const [showModal, setShowModal] = useState(false);
  const createdAt = new Date(job.createdAt).toLocaleDateString();
  const description = job.description?.trim();
  const topRequirements = job.requirements?.slice(0, 2) ?? [];

  return (
    <>
      <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-colors hover:border-blue-300">
        <div className="border-b border-slate-100 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {job.department}
              </p>
              <h3 className="mt-1 line-clamp-2 text-lg font-bold leading-snug text-slate-950">
                {job.title}
              </h3>
            </div>
            <span
              className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-bold capitalize ${
                STATUS_BADGE[job.status] || STATUS_BADGE.draft
              }`}
            >
              {job.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
            <MetaPill label="Location" value={job.location} />
            <MetaPill label="Type" value={job.type} />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          {description ? (
            <p className="line-clamp-3 text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No description has been generated for this role yet.
            </p>
          )}

          {topRequirements.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {topRequirements.map((requirement) => (
                <span
                  key={requirement}
                  className="max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
                  title={requirement}
                >
                  {requirement}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto pt-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Applicants
                </p>
                <p className="mt-1 text-2xl font-bold text-red-700">
                  {job.applicantCount}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Created
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{createdAt}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/jobs/${job._id}`}
                className="flex-1 rounded-md border border-blue-200 px-3 py-2 text-center text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50"
              >
                View Details
              </Link>
              {job.status === "active" && (
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>
      </article>

      {showModal && (
        <ApplyModal
          jobId={job._id}
          jobTitle={job.title}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-slate-700">{value}</p>
    </div>
  );
}

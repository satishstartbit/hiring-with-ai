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
  filled: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function JobCard({ job }: { readonly job: Job }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <article className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-slate-950">{job.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{job.department}</p>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-1 text-xs font-bold ${
              STATUS_BADGE[job.status] || STATUS_BADGE.draft
            }`}
          >
            {job.status}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
          <span>{job.location}</span>
          <span>/</span>
          <span>{job.type}</span>
          <span>/</span>
          <span>{job.applicantCount} applicants</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {new Date(job.createdAt).toLocaleDateString()}
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={`/jobs/${job._id}`}
              className="rounded-md border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50"
            >
              Details
            </Link>
            {job.status === "active" && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700"
              >
                Apply
              </button>
            )}
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

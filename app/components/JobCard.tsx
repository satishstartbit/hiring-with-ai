"use client";

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
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  draft: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  closed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  filled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default function JobCard({ job }: { readonly job: Job }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 hover:border-gray-500 transition-colors flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate">{job.title}</h3>
            <p className="text-sm text-gray-400">{job.department}</p>
          </div>
          <span
            className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full border ${
              STATUS_BADGE[job.status] || STATUS_BADGE.draft
            }`}
          >
            {job.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-4">
          <span>📍 {job.location}</span>
          <span>⏱ {job.type}</span>
          <span>👥 {job.applicantCount} applicants</span>
        </div>

        <div className="mt-auto flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {new Date(job.createdAt).toLocaleDateString()}
          </span>
          {job.status === "active" && (
            <button
              onClick={() => setShowModal(true)}
              className="text-xs font-medium px-3 py-1.5 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Apply →
            </button>
          )}
        </div>
      </div>

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

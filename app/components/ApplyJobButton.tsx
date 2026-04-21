"use client";

import { useState } from "react";
import ApplyModal from "./ApplyModal";

export default function ApplyJobButton({
  jobId,
  jobTitle,
}: {
  jobId: string;
  jobTitle: string;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
      >
        Apply
      </button>
      {showModal && (
        <ApplyModal
          jobId={jobId}
          jobTitle={jobTitle}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

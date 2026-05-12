"use client";

export default function ShareToLinkedInButton({
  jobId,
  jobTitle,
}: Readonly<{ jobId: string; jobTitle: string }>) {
  function share() {
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const jobUrl = `${base}/jobs/${jobId}`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`;
    window.open(url, "linkedin-share", "noopener,noreferrer,width=600,height=720");
  }

  return (
    <button
      onClick={share}
      title={`Share "${jobTitle}" on LinkedIn`}
      className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19 3A2 2 0 0 1 21 5v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14ZM8.34 18.34V10.5H5.67v7.84h2.67ZM7 9.34a1.54 1.54 0 1 0 0-3.08 1.54 1.54 0 0 0 0 3.08Zm11.34 9V14a3.36 3.36 0 0 0-3.34-3.66 2.9 2.9 0 0 0-2.6 1.43V10.5h-2.67c.04.76 0 7.84 0 7.84h2.67V14a1.83 1.83 0 0 1 .1-.66 1.46 1.46 0 0 1 1.37-.98c.97 0 1.36.74 1.36 1.81v4.17h2.67Z" />
      </svg>
      Share to LinkedIn
    </button>
  );
}

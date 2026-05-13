import Link from "next/link";

/**
 * Link-based Apply button. The /jobs/<id>/apply route is gated by the proxy:
 * guests get redirected to /login?next=..., HR users get bounced to /dashboard,
 * and candidates land on the multi-stage apply page.
 */
export default function ApplyJobButton({
  jobId,
}: Readonly<{
  jobId: string;
  // Kept in props for compatibility with existing call sites; not needed for
  // the link itself since the apply page reads them server-side.
  jobTitle?: string;
  applicationQuestions?: unknown;
}>) {
  return (
    <Link
      href={`/jobs/${jobId}/apply`}
      className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
    >
      Apply
    </Link>
  );
}

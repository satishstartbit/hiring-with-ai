import Link from "next/link";
import { requireCandidate } from "@/app/lib/auth/dal";
import ProfilePhotoUploader from "@/app/components/identity/ProfilePhotoUploader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Identity verification — HireAI" };

export default async function CandidateIdentityPage() {
  // Auth-only; this page doesn't need any user fields server-side — the
  // uploader reads/writes via /api/candidate/identity which scopes everything
  // to the signed-in user.
  await requireCandidate();

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/candidate/profile" className="hover:text-slate-800">
          ← Back to profile
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Step 1 — set up identity
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Identity verification
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Before you can take a screening quiz or AI interview, we need a clear photo of
          you. At the start of each assessment your webcam frame is matched against this
          photo locally in your browser — only the match result is stored.
        </p>
      </header>

      <ProfilePhotoUploader />

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-sm font-semibold text-slate-900">How verification works</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">
          <li>You upload a clear, solo photo. Your browser extracts a 128-number signature.</li>
          <li>The signature and photo are stored on your account.</li>
          <li>
            When you start a quiz or interview, your webcam captures a single frame and the
            same signature is computed. The two are compared locally to confirm it&apos;s you.
          </li>
          <li>Periodic checks during the assessment make sure nobody else takes over.</li>
        </ol>
      </section>
    </div>
  );
}

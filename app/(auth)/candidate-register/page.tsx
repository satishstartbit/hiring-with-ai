import Link from "next/link";
import CandidateRegisterForm from "./CandidateRegisterForm";

export const metadata = { title: "Create candidate account — HireAI" };

export default async function CandidateRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your candidate account</h1>
      <p className="mt-1 text-sm text-slate-600">
        One account lets you apply, take quizzes, and complete AI interviews at your own pace —
        you can return any time to pick up where you left off.
      </p>

      <div className="mt-6">
        <CandidateRegisterForm next={sp.next} />
      </div>

      <p className="mt-6 text-sm text-slate-600">
        Already have an account?{" "}
        <Link
          href={sp.next ? `/login?next=${encodeURIComponent(sp.next)}` : "/login"}
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

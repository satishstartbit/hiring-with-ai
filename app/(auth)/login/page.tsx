import Link from "next/link";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in — HireAI" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-600">Sign in to your HireAI workspace.</p>

      {sp.reset && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Password updated. Sign in with your new password.
        </div>
      )}

      <div className="mt-6">
        <LoginForm next={sp.next} />
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-slate-600 hover:text-slate-900">
          Forgot password?
        </Link>
        <Link href="/register" className="text-slate-600 hover:text-slate-900">
          Create workspace →
        </Link>
      </div>
    </>
  );
}

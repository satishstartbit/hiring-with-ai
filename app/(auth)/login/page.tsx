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
      <p className="mt-1 text-sm text-slate-400">Sign in to your HireAI workspace.</p>

      {sp.reset && (
        <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Password updated. Sign in with your new password.
        </div>
      )}

      <div className="mt-6">
        <LoginForm next={sp.next} />
      </div>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-slate-300 hover:text-white">
          Forgot password?
        </Link>
        <Link href="/register" className="text-slate-300 hover:text-white">
          Create workspace →
        </Link>
      </div>
    </>
  );
}

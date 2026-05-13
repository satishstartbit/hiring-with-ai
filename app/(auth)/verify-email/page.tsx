import Link from "next/link";
import { verifyEmailAction } from "@/app/actions/auth";

export const metadata = { title: "Verify email — HireAI" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const result = token ? await verifyEmailAction(token) : null;
  const success = result?.ok ?? false;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {success ? "Email verified" : "Verify your email"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {result
          ? result.message
          : "No token found. Open the verification link from your inbox to verify."}
      </p>
      <div className="mt-6">
        <Link
          href="/login"
          className="inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Continue to sign in →
        </Link>
      </div>
    </>
  );
}

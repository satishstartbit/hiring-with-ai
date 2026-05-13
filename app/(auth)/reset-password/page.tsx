import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = { title: "Reset password — HireAI" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
      <p className="mt-1 text-sm text-slate-600">Choose a strong password to secure your account.</p>
      <div className="mt-6">
        <ResetPasswordForm token={sp.token ?? ""} />
      </div>
    </>
  );
}

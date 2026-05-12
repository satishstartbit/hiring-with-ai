import RegisterForm from "./RegisterForm";

export const metadata = { title: "Create workspace — HireAI" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
      <p className="mt-1 text-sm text-slate-400">
        Tell us about your company. We&apos;ll set up an admin account and workspace in seconds.
      </p>
      <div className="mt-6">
        <RegisterForm />
      </div>
    </>
  );
}

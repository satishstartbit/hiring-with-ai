"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction, type FormState } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    forgotPasswordAction,
    undefined
  );

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-600">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          {state?.errors?.email && (
            <p className="mt-1 text-xs text-rose-600">{state.errors.email[0]}</p>
          )}
        </div>
        {state?.message && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/login" className="text-indigo-600 hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}

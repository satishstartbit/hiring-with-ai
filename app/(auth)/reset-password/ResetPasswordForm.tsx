"use client";

import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "@/app/actions/auth";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    resetPasswordAction,
    undefined
  );

  if (!token) {
    return (
      <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
        Missing reset token. Request a new link from the forgot password page.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-300">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
        />
        {state?.errors?.password && (
          <p className="mt-1 text-xs text-rose-300">{state.errors.password[0]}</p>
        )}
      </div>
      {state?.message && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 hover:from-indigo-400 hover:to-fuchsia-400 disabled:opacity-60"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

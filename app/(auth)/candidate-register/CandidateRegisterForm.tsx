"use client";

import { useActionState } from "react";
import { registerCandidateAction, type FormState } from "@/app/actions/auth";

export default function CandidateRegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    registerCandidateAction,
    undefined
  );
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        label="Full name"
        name="name"
        type="text"
        autoComplete="name"
        errors={state?.errors?.name}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        errors={state?.errors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        errors={state?.errors?.password}
        hint="At least 8 characters, with a letter and a number."
      />
      {state?.message && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  errors,
  hint,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  errors?: string[];
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {hint && !errors?.length && (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
      {errors && errors.length > 0 && (
        <p className="mt-1 text-xs text-rose-600">{errors[0]}</p>
      )}
    </div>
  );
}

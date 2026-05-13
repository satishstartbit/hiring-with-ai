"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerCompany, type FormState } from "@/app/actions/auth";

const STEPS = ["Company", "Account", "Profile"] as const;

const SIZES = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-500", label: "201–500 employees" },
  { value: "501-1000", label: "501–1,000 employees" },
  { value: "1000+", label: "1,000+ employees" },
] as const;

type FormValues = {
  companyName: string;
  companyDomain: string;
  companySize: string;
  adminName: string;
  companyEmail: string;
  password: string;
  industry: string;
  country: string;
  timezone: string;
  logoUrl: string;
};

const EMPTY: FormValues = {
  companyName: "",
  companyDomain: "",
  companySize: "",
  adminName: "",
  companyEmail: "",
  password: "",
  industry: "",
  country: "",
  timezone: "",
  logoUrl: "",
};

type Errors = Record<string, string[] | undefined>;

export default function RegisterForm() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [localErrors, setLocalErrors] = useState<Errors>({});
  const [state, action, pending] = useActionState<FormState, FormData>(
    registerCompany,
    undefined
  );
  const serverErrors = (state?.errors ?? {}) as Errors;
  const errors: Errors = { ...serverErrors, ...localErrors };

  function update<K extends keyof FormValues>(k: K, v: FormValues[K]) {
    setValues((s) => ({ ...s, [k]: v }));
    if (localErrors[k]) {
      setLocalErrors(({ [k]: _drop, ...rest }) => rest);
    }
  }

  function errorsForStep(s: number): Errors {
    const next: Errors = {};
    if (s === 0) {
      if (values.companyName.trim().length < 2) next.companyName = ["Company name is too short"];
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(values.companyDomain.trim()))
        next.companyDomain = ["Use a domain like acme.com"];
      if (!values.companySize) next.companySize = ["Select a company size"];
    }
    if (s === 1) {
      if (values.adminName.trim().length < 2) next.adminName = ["Your name is too short"];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.companyEmail.trim()))
        next.companyEmail = ["Enter a valid email"];
      if (values.password.length < 8) next.password = ["Password must be at least 8 characters"];
    }
    if (s === 2) {
      if (values.industry.trim().length < 2) next.industry = ["Industry is required"];
      if (values.country.trim().length < 2) next.country = ["Country is required"];
      if (values.timezone.trim().length < 2) next.timezone = ["Timezone is required"];
    }
    return next;
  }

  function goNext() {
    const errs = errorsForStep(step);
    setLocalErrors(errs);
    if (Object.keys(errs).length === 0) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function handleSubmit(formData: FormData) {
    // Re-validate everything before submitting because values can still be edited
    // via Back navigation after passing initial step validation.
    const allErrors: Errors = {
      ...errorsForStep(0),
      ...errorsForStep(1),
      ...errorsForStep(2),
    };
    if (Object.keys(allErrors).length > 0) {
      setLocalErrors(allErrors);
      // Jump back to the first step that has errors so the user can see them
      for (const s of [0, 1, 2]) {
        if (Object.keys(errorsForStep(s)).length > 0) {
          setStep(s);
          break;
        }
      }
      return;
    }
    formData.set("payload", JSON.stringify(values));
    return action(formData);
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <input type="hidden" name="payload" value={JSON.stringify(values)} readOnly />

      <Stepper step={step} />

      {step === 0 && (
        <fieldset className="space-y-4">
          <Field
            label="Company name"
            value={values.companyName}
            onChange={(v) => update("companyName", v)}
            placeholder="Acme, Inc."
            error={errors.companyName?.[0]}
          />
          <Field
            label="Company domain"
            value={values.companyDomain}
            onChange={(v) => update("companyDomain", v)}
            placeholder="acme.com"
            error={errors.companyDomain?.[0]}
          />
          <SelectField
            label="Company size"
            value={values.companySize}
            onChange={(v) => update("companySize", v)}
            options={SIZES as unknown as { value: string; label: string }[]}
            error={errors.companySize?.[0]}
          />
        </fieldset>
      )}

      {step === 1 && (
        <fieldset className="space-y-4">
          <Field
            label="Your name"
            value={values.adminName}
            onChange={(v) => update("adminName", v)}
            placeholder="Jane Doe"
            error={errors.adminName?.[0]}
          />
          <Field
            label="Work email"
            type="email"
            value={values.companyEmail}
            onChange={(v) => update("companyEmail", v)}
            placeholder="you@acme.com"
            error={errors.companyEmail?.[0]}
          />
          <Field
            label="Password"
            type="password"
            value={values.password}
            onChange={(v) => update("password", v)}
            placeholder="At least 8 characters"
            error={errors.password?.[0]}
          />
          <p className="text-xs text-slate-600">
            We&apos;ll create a Company Admin account for this email.
          </p>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="space-y-4">
          <Field
            label="Industry"
            value={values.industry}
            onChange={(v) => update("industry", v)}
            placeholder="SaaS / Fintech / Healthcare"
            error={errors.industry?.[0]}
          />
          <Field
            label="Country"
            value={values.country}
            onChange={(v) => update("country", v)}
            placeholder="United States"
            error={errors.country?.[0]}
          />
          <Field
            label="Timezone"
            value={values.timezone}
            onChange={(v) => update("timezone", v)}
            placeholder="America/New_York"
            error={errors.timezone?.[0]}
          />
          <Field
            label="Company logo URL (optional)"
            value={values.logoUrl}
            onChange={(v) => update("logoUrl", v)}
            placeholder="https://acme.com/logo.png"
            error={errors.logoUrl?.[0]}
          />
        </fieldset>
      )}

      {state?.message && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || pending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Next
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {pending ? "Creating workspace…" : "Create workspace"}
          </button>
        )}
      </div>

      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-medium ${
              i <= step
                ? "bg-indigo-600 text-white"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {i + 1}
          </span>
          <span className={i <= step ? "text-slate-900" : "text-slate-500"}>{label}</span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

"use client";

export type IdentityProcessingPhase = "loading_models" | "extracting" | "uploading";

const COPY: Record<IdentityProcessingPhase, { title: string; detail: string }> = {
  loading_models: {
    title: "Preparing face recognition",
    detail: "Loading the models needed to detect your face…",
  },
  extracting: {
    title: "Analyzing your face",
    detail:
      "Detecting your face and generating a secure 128-point identity signature in your browser…",
  },
  uploading: {
    title: "Saving your identity",
    detail:
      "Storing your profile photo and face embedding on your account. This only takes a moment…",
  },
};

export default function IdentityProcessingOverlay({
  phase,
}: Readonly<{
  phase: IdentityProcessingPhase;
}>) {
  const { title, detail } = COPY[phase];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/25 backdrop-blur-[20px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="identity-processing-title"
      aria-describedby="identity-processing-detail"
    >
      <div className="mx-4 w-full max-w-md rounded-2xl border border-white/40 bg-white/90 p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
          <div
            className="h-12 w-12 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600"
            aria-hidden
          />
          <h2
            id="identity-processing-title"
            className="mt-5 text-lg font-semibold text-slate-900"
          >
            {title}
          </h2>
          <p id="identity-processing-detail" className="mt-2 text-sm leading-relaxed text-slate-600">
            {detail}
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Please keep this tab open and don&apos;t refresh the page.
          </p>
        </div>
      </div>
    </div>
  );
}

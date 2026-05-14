import type { NextRequest } from "next/server";
import { readSession } from "../../../lib/auth/session";

export const dynamic = "force-dynamic";

// Public Piston instance — rate-limited (5 req/sec). Fine for screening, not for
// at-scale execution. If we hit limits we'll self-host an instance later.
const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

// Pin to known-good runtimes. Versions match what Piston publishes via
// /runtimes; "*" lets Piston pick the latest minor.
const LANGUAGE_RUNTIMES: Record<string, { language: string; version: string; filename: string }> = {
  javascript: { language: "javascript", version: "*", filename: "main.js" },
  typescript: { language: "typescript", version: "*", filename: "main.ts" },
  python: { language: "python", version: "*", filename: "main.py" },
  java: { language: "java", version: "*", filename: "Main.java" },
  cpp: { language: "cpp", version: "*", filename: "main.cpp" },
  // SQL is intentionally not in this map — running arbitrary SQL safely needs a
  // sandboxed schema. For now SQL "Run" falls through to the 400 path.
};

interface RunBody {
  language?: unknown;
  code?: unknown;
  stdin?: unknown;
}

interface PistonResponse {
  language?: string;
  version?: string;
  run?: {
    stdout?: string;
    stderr?: string;
    output?: string;
    code?: number;
    signal?: string | null;
  };
  compile?: {
    stdout?: string;
    stderr?: string;
    output?: string;
    code?: number;
  };
  message?: string;
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session?.userId) {
    return Response.json({ error: "Sign in to run code" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RunBody;
  const language = typeof body.language === "string" ? body.language : "";
  const code = typeof body.code === "string" ? body.code : "";
  const stdin = typeof body.stdin === "string" ? body.stdin : "";

  const runtime = LANGUAGE_RUNTIMES[language];
  if (!runtime) {
    return Response.json(
      { error: `Run is not supported for "${language}". Submit when ready.` },
      { status: 400 }
    );
  }
  if (!code.trim()) {
    return Response.json({ error: "Write some code first." }, { status: 400 });
  }
  if (code.length > 50_000) {
    return Response.json({ error: "Code too long to run." }, { status: 413 });
  }

  let resp: Response;
  try {
    resp = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: [{ name: runtime.filename, content: code }],
        stdin,
        run_timeout: 10000,
        compile_timeout: 10000,
      }),
    });
  } catch (err) {
    console.error("[code/run] piston fetch failed:", err);
    return Response.json({ error: "Code runner is unreachable. Try again." }, { status: 502 });
  }

  if (!resp.ok) {
    return Response.json(
      { error: `Code runner returned ${resp.status}` },
      { status: 502 }
    );
  }

  const data = (await resp.json()) as PistonResponse;
  const run = data.run ?? {};
  return Response.json({
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    exitCode: typeof run.code === "number" ? run.code : 0,
    compileError: data.compile?.stderr ?? "",
  });
}

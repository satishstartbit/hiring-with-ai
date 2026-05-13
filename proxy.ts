import { NextRequest, NextResponse } from "next/server";
import { decryptSession, SESSION_COOKIE_NAME, type SessionPayload } from "@/app/lib/auth/session";

const HR_PREFIXES = ["/dashboard"];
const CANDIDATE_PREFIXES = ["/candidate"];
const AUTH_PAGES: ReadonlySet<string> = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/candidate-register",
]);

function startsWith(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isHrArea(pathname: string): boolean {
  return startsWith(pathname, HR_PREFIXES);
}

function isCandidateArea(pathname: string): boolean {
  return startsWith(pathname, CANDIDATE_PREFIXES);
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.has(pathname);
}

/** /jobs/<id>/apply requires login. Everything else under /jobs is public. */
function isJobApply(pathname: string): boolean {
  return /^\/jobs\/[^/]+\/apply(?:\/|$)/.test(pathname);
}

function redirectTo(req: NextRequest, pathname: string, next?: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

function homeFor(session: SessionPayload): string {
  return session.role === "candidate" ? "/candidate" : "/dashboard";
}

function gateHrArea(req: NextRequest, session: SessionPayload | null): NextResponse | null {
  if (!session?.userId) return redirectTo(req, "/login", req.nextUrl.pathname);
  if (session.role === "candidate") return redirectTo(req, "/candidate");
  return null;
}

function gateCandidateArea(req: NextRequest, session: SessionPayload | null): NextResponse | null {
  if (!session?.userId) return redirectTo(req, "/login", req.nextUrl.pathname);
  if (session.role !== "candidate") return redirectTo(req, "/dashboard");
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await decryptSession(token);

  if (isJobApply(pathname) && !session?.userId) {
    return redirectTo(req, "/login", pathname);
  }

  if (isHrArea(pathname)) {
    const blocked = gateHrArea(req, session);
    if (blocked) return blocked;
  }

  if (isCandidateArea(pathname)) {
    const blocked = gateCandidateArea(req, session);
    if (blocked) return blocked;
  }

  if (isAuthPage(pathname) && session?.userId) {
    return redirectTo(req, homeFor(session));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif)$).*)"],
};

import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "../db/models/User";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "hireai_session";
const SESSION_TTL_DAYS = 7;

export type SessionPayload = {
  userId: string;
  // HR-side users always have these; candidates have empty strings.
  companyId: string;
  workspaceId: string;
  workspaceSlug: string;
  role: Role;
  email: string;
  expiresAt: number;
};

function getEncodedKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (>=16 chars required)");
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getEncodedKey());
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(payload: Omit<SessionPayload, "expiresAt">): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const token = await encryptSession({ ...payload, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return decryptSession(token);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

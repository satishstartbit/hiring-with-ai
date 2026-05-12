import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown } };

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function err(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse<ApiErr> {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export function fromError(error: unknown): NextResponse<ApiErr> {
  if (error instanceof ZodError) {
    return err("validation_error", "Invalid input", 422, error.flatten());
  }
  if (error instanceof Error) {
    return err("internal_error", error.message, 500);
  }
  return err("internal_error", "Unexpected error", 500);
}

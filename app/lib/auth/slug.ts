import "server-only";
import { randomBytes } from "node:crypto";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function uniqueSuffix(): string {
  return randomBytes(3).toString("hex");
}

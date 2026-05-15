import type { NextRequest } from "next/server";
import { readSession } from "../../../lib/auth/session";
import { connectDB } from "../../../lib/db/connection";
import { User } from "../../../lib/db/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Buffer + Mongoose, not edge-safe

// Identity-verification descriptor + photo storage for the candidate.
//
// POST  /api/candidate/identity   multipart: photo (image/*) + descriptor (JSON 128-d array)
// GET   /api/candidate/identity   -> { hasDescriptor, descriptor?, photoUrl, updatedAt }
//
// The descriptor is generated CLIENT-SIDE by face-api.js (see
// `app/lib/face/faceApi.ts`) and shipped here as a plain number[]. The
// server never runs face-api itself — it just persists the embedding so the
// initial gate + periodic recheck (also client-side) can compare against it.

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB — generous; client should compress to <500KB
const DESCRIPTOR_LENGTH = 128; // face-api.js descriptor is always 128-d

interface DescriptorPayload {
  descriptor: number[];
}

function parseDescriptor(raw: unknown): number[] | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as DescriptorPayload | number[];
    const arr = Array.isArray(parsed) ? parsed : parsed.descriptor;
    if (!Array.isArray(arr) || arr.length !== DESCRIPTOR_LENGTH) return null;
    if (!arr.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return arr;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session?.userId) {
    return Response.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (session.role !== "candidate") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const photo = formData.get("photo");
  const descriptor = parseDescriptor(formData.get("descriptor"));

  if (!(photo instanceof File)) {
    return Response.json({ error: "Profile photo file is required" }, { status: 400 });
  }
  if (!descriptor) {
    return Response.json(
      { error: "Face descriptor missing or malformed — try a clearer photo" },
      { status: 400 }
    );
  }
  if (!ALLOWED_CONTENT_TYPES.has(photo.type)) {
    return Response.json(
      { error: "Photo must be JPEG, PNG, or WebP" },
      { status: 400 }
    );
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Photo is too large (max 4MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await photo.arrayBuffer());

  await connectDB();
  const now = new Date();
  const updated = await User.findOneAndUpdate(
    { _id: session.userId, deletedAt: null },
    {
      $set: {
        profilePhotoData: buffer,
        profilePhotoContentType: photo.type,
        profilePhotoUpdatedAt: now,
        faceDescriptor: descriptor,
      },
    },
    { new: true, projection: { profilePhotoUpdatedAt: 1 } }
  ).lean();

  if (!updated) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    updatedAt: updated.profilePhotoUpdatedAt,
    photoUrl: "/api/candidate/identity/photo",
  });
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session?.userId) {
    return Response.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (session.role !== "candidate") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const user = await User.findOne({ _id: session.userId, deletedAt: null })
    .select("+faceDescriptor profilePhotoContentType profilePhotoUpdatedAt")
    .lean();

  if (!user) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const includeDescriptor = url.searchParams.get("include") === "descriptor";

  const hasDescriptor = Array.isArray(user.faceDescriptor) && user.faceDescriptor.length === 128;

  return Response.json({
    hasDescriptor,
    descriptor: hasDescriptor && includeDescriptor ? user.faceDescriptor : null,
    photoUrl: user.profilePhotoUpdatedAt ? "/api/candidate/identity/photo" : null,
    updatedAt: user.profilePhotoUpdatedAt ?? null,
  });
}

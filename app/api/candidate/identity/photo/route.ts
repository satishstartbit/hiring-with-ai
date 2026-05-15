import { readSession } from "@/app/lib/auth/session";
import { bufferFromMongo } from "@/app/lib/db/bufferFromMongo";
import { connectDB } from "@/app/lib/db/connection";
import { User } from "@/app/lib/db/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Serve the candidate's stored profile photo as a raw binary response.
// Auth-gated to the owning user — HR doesn't fetch through this route,
// they get served via a separate (future) HR-scoped endpoint that includes
// match results + access logging.

export async function GET() {
  const session = await readSession();
  if (!session?.userId) {
    return new Response("Sign in to continue", { status: 401 });
  }
  if (session.role !== "candidate") {
    return new Response("Forbidden", { status: 403 });
  }

  await connectDB();
  const user = await User.findOne({ _id: session.userId, deletedAt: null })
    .select("+profilePhotoData profilePhotoContentType profilePhotoUpdatedAt")
    .lean();

  const bytes = bufferFromMongo(user?.profilePhotoData);
  if (!bytes?.length) {
    return new Response("No profile photo uploaded", { status: 404 });
  }

  const rawType = user?.profilePhotoContentType ?? "image/jpeg";
  const contentType = rawType === "image/jpg" ? "image/jpeg" : rawType;
  const body = new Uint8Array(bytes);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      // Profile photos are user-private; never let an intermediary cache.
      "Cache-Control": "private, no-store",
    },
  });
}

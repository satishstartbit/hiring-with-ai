import { readSession } from "../../../../lib/auth/session";
import { connectDB } from "../../../../lib/db/connection";
import { User } from "../../../../lib/db/models/User";

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

  if (!user?.profilePhotoData) {
    return new Response("No profile photo uploaded", { status: 404 });
  }

  const contentType = user.profilePhotoContentType ?? "image/jpeg";
  // profilePhotoData comes back as a Buffer-like; coerce to a Uint8Array
  // to satisfy the Response body type without a copy on Node 20+.
  const body = new Uint8Array(user.profilePhotoData as unknown as Buffer);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      // Profile photos are user-private; never let an intermediary cache.
      "Cache-Control": "private, no-store",
    },
  });
}

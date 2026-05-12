import { deleteSession } from "@/app/lib/auth/session";
import { ok } from "@/app/lib/api/response";

export async function POST() {
  await deleteSession();
  return ok({ loggedOut: true });
}

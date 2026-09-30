import "server-only";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/route-helpers";
import { getAvatar } from "@/lib/db/avatars";

/** After a conditional `updateAvatar` matched no row: 409 if the avatar is still live (its
 *  front changed underneath the request), 404 if it is gone or archived. */
export async function preconditionFailed(
  clientId: string,
  avatarId: string,
  raceMessage: string,
): Promise<NextResponse<{ error: string }>> {
  const avatar = await getAvatar(clientId, avatarId);
  if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);
  return apiError(raceMessage, 409);
}

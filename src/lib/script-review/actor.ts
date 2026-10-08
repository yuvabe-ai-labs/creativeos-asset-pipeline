// src/lib/script-review/actor.ts
import "server-only";
import type { CallerContext } from "@/lib/dal-logic";
import { resolveDisplayNames } from "@/lib/db/profiles";
import { REVIEWER_NAME_MAX } from "@/lib/client-review/constants";

/** The team member's name as the client reads it under a reply and in the activity. Copied onto the
 *  row when written, because the activity is never rewritten (spec 4 §7). */
export async function teamActorName(caller: CallerContext): Promise<string> {
  const names = await resolveDisplayNames(caller.orgId, [caller.userId]);
  const name = names.get(caller.userId)?.trim() || caller.email?.split("@")[0]?.trim() || "The team";
  return name.slice(0, REVIEWER_NAME_MAX);
}

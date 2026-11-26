import "server-only";
import type { CallerContext } from "@/lib/dal";
import { listAgencyVoiceIds } from "@/lib/db/client-voices";
import { accessOf } from "@/lib/permissions/server";
import { clientIdsWith } from "@/lib/permissions/check";

/** The voice ids recorded for the clients this caller can see in this agency. The account-wide
 *  voice routes have no client in the URL; with these and the stock voices they show only what
 *  the caller's own clients have, never another agency's clones (named after their clients). */
export function agencyVoiceIds(caller: CallerContext, orgId: string): Promise<string[]> {
  return listAgencyVoiceIds(orgId, clientIdsWith(accessOf(caller), orgId, "view"));
}

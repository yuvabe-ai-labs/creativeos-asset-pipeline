import "server-only";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import type { ClientRow } from "@/lib/db/types";
import { journeyState, type JourneyState } from "./stages";

/** What the client frame draws: the tabs' name and states, and the guide's status. */
export type FrameClient = {
  client: { slug: string; name: string; kbStatus: ClientRow["kb_status"] };
  state: JourneyState;
};

/** The client behind a slug, for the frame. Null for a missing client or one outside the caller's
 *  org: the page decides what to show, and the tabs must never name a client the caller may not
 *  see. Both reads are cache()d per request, so the page under the frame shares them. */
export async function loadFrameClient(slug: string): Promise<FrameClient | null> {
  const [client, effectiveOrgId] = await Promise.all([getClientBySlug(slug), resolveOrgId()]);
  if (!client || client.org_id !== effectiveOrgId) return null;
  return {
    client: { slug: client.slug, name: client.name, kbStatus: client.kb_status },
    state: journeyState(client),
  };
}

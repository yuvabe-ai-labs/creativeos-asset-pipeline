import "server-only";
import { hasCopilotMessages, insertOpeningIfEmpty } from "@/lib/db/copilot-messages";
import type { ClientRow } from "@/lib/db/types";
import { openingMessage } from "@/lib/journey/kb-copilot/context";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import { ONBOARDING } from "./schema";

/** A thread's opening is only shown, not stored, until something is written to it. Anything that
 *  writes a line from outside the chat (a save on the page, an approval) calls this first, so that
 *  line is never the thread's first: the opening stays, for the person and for the model. One small
 *  read when the thread has already begun. */
export async function ensureOpening(client: ClientRow): Promise<void> {
  if (await hasCopilotMessages(client.id, ONBOARDING)) return;
  const { ctx } = await loadKbContext(client);
  await insertOpeningIfEmpty(client.id, ONBOARDING, openingMessage(ctx));
}

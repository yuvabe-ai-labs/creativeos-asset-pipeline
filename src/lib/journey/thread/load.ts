import "server-only";
import { listCopilotMessages } from "@/lib/db/copilot-messages";
import type { ClientRow } from "@/lib/db/types";
import { fallbackSuggestions, liveStatus, openingMessage, type KbContext } from "@/lib/journey/kb-copilot/context";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import { ONBOARDING, type ThreadMessage, type ThreadState } from "./schema";

// The one read of a client's onboarding thread, for every stage page (journey map §2). Today its
// live status and fallback reply choices come from the brand KB alone; later stages add theirs
// here, so the same messages are never read or cached a second way.

/** The id of the opening line while it is only shown, not yet stored. */
export const VIRTUAL_OPENING_ID = "opening";

export function threadState(ctx: KbContext, stored: ThreadMessage[]): ThreadState {
  // Nothing is stored until the person sends a message, so opening the page writes nothing.
  const messages: ThreadMessage[] = stored.length > 0
    ? stored
    : [{ id: VIRTUAL_OPENING_ID, role: "assistant", content: openingMessage(ctx), card: null, attachments: [], suggestions: [], createdAt: "" }];
  const live = liveStatus(ctx);
  const last = messages[messages.length - 1];
  const offered = last.role === "assistant" && last.suggestions.length > 0 ? last.suggestions : fallbackSuggestions(ctx);
  // The copilot asks nothing while something runs (spec §2.2), so it offers nothing either.
  return { messages, live, suggestions: live.length > 0 ? [] : offered };
}

/** Throws when either read fails: a thread that could not be read is never shown as empty. */
export async function loadThread(client: ClientRow): Promise<ThreadState> {
  const [{ ctx }, stored] = await Promise.all([loadKbContext(client), listCopilotMessages(client.id, ONBOARDING)]);
  return threadState(ctx, stored);
}

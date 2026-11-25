import "server-only";
import { listCopilotMessages } from "@/lib/db/copilot-messages";
import type { ClientRow } from "@/lib/db/types";
import { fallbackSuggestions, isBuilding, liveStatus, openingMessage, type KbContext } from "@/lib/journey/kb-copilot/context";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import { readKBFieldValues } from "@/lib/db/kb";
import { outOfDatePaths } from "@/lib/kb/changes/card";
import { kbWaiting } from "@/lib/journey/kb-copilot/waiting";
import { marketWithThread } from "@/lib/journey/market-copilot/context";
import { ONBOARDING, VIRTUAL_OPENING_ID, type ThreadMessage, type ThreadState } from "./schema";

// The one read of a client's onboarding thread, for every stage page (journey map §2). Today its
// live status and fallback reply choices come from the brand KB alone; later stages add theirs
// here, so the same messages are never read or cached a second way.

export function threadState(read: KbContext, stored: ThreadMessage[]): ThreadState {
  // The brands card waiting on the person is only in the thread (D530).
  const ctx: KbContext = read.market ? { ...read, market: marketWithThread(read.market, stored) } : read;
  // Nothing is stored until the person sends a message, so opening the page writes nothing.
  const messages: ThreadMessage[] = stored.length > 0
    ? stored
    : [{ id: VIRTUAL_OPENING_ID, role: "assistant", content: openingMessage(ctx), card: null, attachments: [], suggestions: [], createdAt: "" }];
  const live = liveStatus(ctx);
  // A note (a save on the page) is not part of the conversation: the choices under the copilot's
  // last words stay on offer after one.
  const last = messages.findLast((m) => m.card?.kind !== "note") ?? messages[messages.length - 1];
  const offered = last.role === "assistant" && last.suggestions.length > 0 ? last.suggestions : fallbackSuggestions(ctx);
  // The copilot asks nothing while something runs (spec §2.2), so it offers nothing either. A
  // failure that is only being shown is not something running.
  // That means the build. Collecting and studying images run on beside the review (spec §2.2), and
  // a question asked meanwhile keeps its choices.
  return { messages, live, suggestions: isBuilding(ctx) ? [] : offered, waiting: kbWaiting(ctx, messages) };
}

/** Throws when any read fails: a thread that could not be read is never shown as empty. */
export async function loadThread(client: ClientRow): Promise<ThreadState> {
  const [{ ctx }, stored] = await Promise.all([loadKbContext(client), listCopilotMessages(client.id, ONBOARDING)]);
  return threadState(ctx, await markOutOfDate(stored));
}

/** Each pending change card gains the fields changed by hand since it was made (D517). Only the
 *  paths on pending cards are read, by JSON path; with no pending card nothing more is read. */
async function markOutOfDate(messages: ThreadMessage[]): Promise<ThreadMessage[]> {
  const pending = messages.filter((m) => m.card?.kind === "change" && m.card.status === "pending");
  if (pending.length === 0) return messages;
  const paths = new Map<string, Set<string>>();
  for (const m of pending) {
    if (m.card?.kind !== "change") continue;
    const set = paths.get(m.card.versionId) ?? new Set<string>();
    for (const f of m.card.fields) set.add(f.path);
    paths.set(m.card.versionId, set);
  }
  const values = new Map(await Promise.all(
    [...paths].map(async ([versionId, set]) => [versionId, await readKBFieldValues(versionId, [...set])] as const),
  ));
  return messages.map((m) =>
    m.card?.kind === "change" && m.card.status === "pending"
      ? { ...m, outOfDate: outOfDatePaths(m.card, values.get(m.card.versionId) ?? {}) }
      : m,
  );
}

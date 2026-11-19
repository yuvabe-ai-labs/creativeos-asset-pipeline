import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { rowToThreadMessage, type CopilotMessageRow } from "@/lib/journey/thread/rows";
import { changeCardSchema, ONBOARDING, type Attachment, type ChangeCard, type CopilotThread, type ThreadCard, type ThreadMessage } from "@/lib/journey/thread/schema";

// The saved onboarding thread of a client (D496). Every query filters on client_id AND thread:
// withClient authorises the CLIENT in the URL, and a client may gain other threads later.

/** The newest messages kept in memory for one thread. Older ones stay stored. */
const THREAD_READ_LIMIT = 200;
const UNIQUE_VIOLATION = "23505";

const COLUMNS = "id, role, content, card, attachments, suggestions, created_at";

export type NewCopilotMessage = {
  /** Made by the caller when something else must name this message (a turn's trace, D509). */
  id?: string;
  role: "user" | "assistant"; content: string;
  card?: ThreadCard | null; attachments?: Attachment[]; suggestions?: string[];
  /** The person this message is about (who approved, who saved). A person's own message is always
   *  stored under the caller; the copilot's is stored under nobody unless this says otherwise. */
  createdBy?: string | null;
};

/** The thread in order, oldest first. Throws when the read fails: a failed read is never "empty". */
export async function listCopilotMessages(clientId: string, thread: CopilotThread): Promise<ThreadMessage[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_copilot_messages").select(COLUMNS)
    .eq("client_id", clientId).eq("thread", thread)
    .order("seq", { ascending: false })
    .limit(THREAD_READ_LIMIT);
  if (error) throw error;
  return ((data ?? []) as CopilotMessageRow[]).reverse().map(rowToThreadMessage);
}

function toRow(clientId: string, thread: CopilotThread, userId: string | null, m: NewCopilotMessage) {
  return {
    ...(m.id ? { id: m.id } : {}),
    client_id: clientId, thread, role: m.role, content: m.content,
    card: m.card ?? null,
    attachments: m.attachments ?? [],
    suggestions: m.suggestions ?? [],
    created_by: m.role === "user" ? userId : (m.createdBy ?? null),
  };
}

export async function insertCopilotMessages(
  clientId: string, thread: CopilotThread, userId: string | null, messages: NewCopilotMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  const supabase = createServerSupabase();
  // One insert keeps them in order: `seq` is assigned row by row in array order.
  const { error } = await supabase.from("client_copilot_messages").insert(messages.map((m) => toRow(clientId, thread, userId, m)));
  if (error) throw error;
}

/** Whether anything has been stored in the thread yet. Throws when the read fails. */
export async function hasCopilotMessages(clientId: string, thread: CopilotThread): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_copilot_messages").select("id")
    .eq("client_id", clientId).eq("thread", thread)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Stores the opening message only when the thread has no rows yet. Safe when two turns race: the
 *  partial unique index lets one opening in, and the loser gets `false`. Returns true if it inserted. */
export async function insertOpeningIfEmpty(clientId: string, thread: CopilotThread, content: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_copilot_messages").select("id")
    .eq("client_id", clientId).eq("thread", thread)
    .limit(1);
  // A failed read must not fall through to the insert.
  if (error) throw error;
  if ((data ?? []).length > 0) return false;
  const { error: insertError } = await supabase.from("client_copilot_messages").insert({
    ...toRow(clientId, thread, null, { role: "assistant", content }),
    is_opening: true,
  });
  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) return false;
    throw insertError;
  }
  return true;
}

/** Settles a change card (D505): writes `next` only while the stored card is still pending, so two
 *  people deciding at once settle it once. False when someone settled it first. */
export async function claimChangeCard(clientId: string, messageId: string, next: ChangeCard): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_copilot_messages").update({ card: next })
    .eq("id", messageId).eq("client_id", clientId).eq("thread", ONBOARDING).eq("card->>status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Puts a card back on its message: a claimed change card whose write then failed. */
export async function setMessageCard(clientId: string, messageId: string, card: ThreadCard): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_copilot_messages").update({ card })
    .eq("id", messageId).eq("client_id", clientId).eq("thread", ONBOARDING);
  if (error) throw error;
}

/** Every settled change card of the client's onboarding thread, however old: what a person turned
 *  down is remembered for good. Throws when it cannot be read: never "nothing was refused". */
export async function listSettledChangeCards(clientId: string): Promise<ChangeCard[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_copilot_messages").select("card")
    .eq("client_id", clientId).eq("thread", ONBOARDING).eq("card->>kind", "change")
    .in("card->>status", ["applied", "discarded"]);
  if (error) throw error;
  return ((data ?? []) as { card: unknown }[]).flatMap((row) => {
    const parsed = changeCardSchema.safeParse(row.card);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Every change card of the client's onboarding thread still waiting for a decision, with its
 *  message id (piece 2b: a newer image study overtakes an earlier study's card). Throws when it
 *  cannot be read: never "nothing is waiting". */
export async function listPendingChangeCards(clientId: string): Promise<{ id: string; card: ChangeCard }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_copilot_messages").select("id, card")
    .eq("client_id", clientId).eq("thread", ONBOARDING).eq("card->>kind", "change").eq("card->>status", "pending");
  if (error) throw error;
  return ((data ?? []) as { id: string; card: unknown }[]).flatMap((row) => {
    const parsed = changeCardSchema.safeParse(row.card);
    return parsed.success ? [{ id: row.id, card: parsed.data }] : [];
  });
}

/** One message of the client's onboarding thread, or null when it is not there. */
export async function getCopilotMessage(clientId: string, messageId: string): Promise<ThreadMessage | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_copilot_messages").select(COLUMNS)
    .eq("id", messageId).eq("client_id", clientId).eq("thread", ONBOARDING)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToThreadMessage(data as CopilotMessageRow) : null;
}

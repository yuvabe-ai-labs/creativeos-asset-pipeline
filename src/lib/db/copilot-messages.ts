import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { rowToThreadMessage, type CopilotMessageRow } from "@/lib/journey/thread/rows";
import type { Attachment, CopilotThread, ThreadCard, ThreadMessage } from "@/lib/journey/thread/schema";

// The saved onboarding thread of a client (D496). Every query filters on client_id AND thread:
// withClient authorises the CLIENT in the URL, and a client may gain other threads later.

/** The newest messages kept in memory for one thread. Older ones stay stored. */
const THREAD_READ_LIMIT = 200;
const UNIQUE_VIOLATION = "23505";

const COLUMNS = "id, role, content, card, attachments, suggestions, created_at";

export type NewCopilotMessage = {
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

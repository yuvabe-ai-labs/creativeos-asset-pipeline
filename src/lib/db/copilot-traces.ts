import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ONBOARDING } from "@/lib/journey/thread/schema";
import type { NewTurnTrace, TraceMark, TurnLine, TurnTrace } from "@/lib/journey/kb-copilot/trace";

// Copilot turn traces (D521, migration 0066). Every read filters on client_id: withClient authorises
// the client in the URL. The list never reads `trace`; a whole trace is read only when opened.

export async function insertTurnTrace(row: NewTurnTrace): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("copilot_turn_traces").insert({
    client_id: row.clientId, thread: ONBOARDING, message_id: row.messageId, created_by: row.createdBy,
    sent_text: row.sentText, tools: row.tools, marks: row.marks, duration_ms: row.durationMs, trace: row.trace,
  });
  if (error) throw error;
}

const LINE_COLUMNS = "id, message_id, created_at, sent_text, tools, marks, duration_ms";

type LineRow = { id: string; message_id: string | null; created_at: string; sent_text: string; tools: string[]; marks: string[]; duration_ms: number };

const toLine = (r: LineRow): TurnLine => ({
  id: r.id, messageId: r.message_id, createdAt: r.created_at, sentText: r.sent_text,
  tools: r.tools, marks: r.marks as TraceMark[], durationMs: r.duration_ms,
});

/** One client's newest lines since `since`, newest first. Never reads `trace`. Throws when the read fails. */
export async function listTurnLines(clientId: string, since: string, limit: number): Promise<TurnLine[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("copilot_turn_traces").select(LINE_COLUMNS)
    .eq("client_id", clientId).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as LineRow[]).map(toLine);
}

/** One trace of this client, whole; null when it is gone or belongs to another client. */
export async function getTurnTrace(clientId: string, id: string): Promise<(TurnLine & { trace: TurnTrace }) | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("copilot_turn_traces").select(`${LINE_COLUMNS}, trace`)
    .eq("client_id", clientId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as LineRow & { trace: TurnTrace };
  return { ...toLine(row), trace: row.trace };
}

/** Removes every trace created before `cutoff` (the daily sweep, spec §3.3). Returns how many went. */
export async function deleteTurnTracesBefore(cutoff: string): Promise<number> {
  const supabase = createServerSupabase();
  const { error, count } = await supabase.from("copilot_turn_traces").delete({ count: "exact" }).lt("created_at", cutoff);
  if (error) throw error;
  return count ?? 0;
}

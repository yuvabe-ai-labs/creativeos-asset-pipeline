import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ONBOARDING } from "@/lib/journey/thread/schema";
import type { NewTurnTrace } from "@/lib/journey/kb-copilot/trace";

// Copilot turn traces (D509, migration 0065). Every read filters on client_id: withClient authorises
// the client in the URL. The list never reads `trace`; a whole trace is read only when opened.

export async function insertTurnTrace(row: NewTurnTrace): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("copilot_turn_traces").insert({
    client_id: row.clientId, thread: ONBOARDING, message_id: row.messageId, created_by: row.createdBy,
    sent_text: row.sentText, tools: row.tools, marks: row.marks, duration_ms: row.durationMs, trace: row.trace,
  });
  if (error) throw error;
}

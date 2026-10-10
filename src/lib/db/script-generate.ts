import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { listAvatars } from "@/lib/db/avatars";
import { listScripts } from "@/lib/db/scripts";
import { libraryFormats } from "@/lib/scripts/copilot/prompt-context";
import { changeWithRetry, type Change, type ChangeOutcome } from "@/lib/scripts/copilot/change";
import { rowToGenerateScript, rowToMessage, type GenerateScriptRow, type ScriptMessageRow } from "@/lib/scripts/copilot/rows";
import { fillToFinal } from "@/lib/scripts/copilot/fill-to-final";
import {
  briefSchema, type Brief, type CopilotAvatar, type GenerateScript, type GenerateState, type MessageCard,
  type ProposalCard, type ScriptMessage, type ScriptNotes, type ScriptPatch, type UnwrittenScript,
} from "@/lib/scripts/copilot/schema";

// Spec 2 (Generate). Every query filters on client_id as well as the script id: withClient
// authorises the CLIENT in the URL, not the ids beside it (as src/lib/db/scripts.ts).

export async function createGenerateScript(input: {
  clientId: string; userId: string; brief: Brief; notes: ScriptNotes; opening: string;
}): Promise<GenerateScript> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .insert({ client_id: input.clientId, stage: "generate", doc: null, brief: input.brief, notes: input.notes, created_by: input.userId })
    .select("*")
    .single();
  if (error) throw error;
  const script = rowToGenerateScript(data as GenerateScriptRow);
  if (!script) throw new Error("The new script could not be read back.");
  await insertScriptMessages(input.clientId, script.id, null, [{ role: "assistant", content: input.opening, card: null }]);
  return script;
}

export async function getGenerateScript(clientId: string, scriptId: string): Promise<GenerateScript | null> {
  if (!isUuid(scriptId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts").select("*")
    .eq("id", scriptId).eq("client_id", clientId).is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToGenerateScript(data as GenerateScriptRow) : null;
}

/** Compare-and-set: writes only if the stored version is still `expectedVersion` and the script is
 *  still at Generate. Null when either moved on. */
export async function saveGenerateScript(clientId: string, scriptId: string, expectedVersion: number, patch: ScriptPatch): Promise<GenerateScript | null> {
  if (!isUuid(scriptId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .update({ ...patch, doc_version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq("id", scriptId).eq("client_id", clientId).eq("stage", "generate")
    .eq("doc_version", expectedVersion).is("archived_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToGenerateScript(data as GenerateScriptRow) : null;
}

export function changeGenerateScript<T>(clientId: string, scriptId: string, change: (current: GenerateScript) => Change<T>): Promise<ChangeOutcome<T>> {
  return changeWithRetry(
    {
      read: () => getGenerateScript(clientId, scriptId),
      save: (expected, patch) => saveGenerateScript(clientId, scriptId, expected, patch),
    },
    change,
  );
}

export async function listScriptMessages(clientId: string, scriptId: string): Promise<ScriptMessage[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_script_messages").select("id, role, content, card, created_at")
    .eq("script_id", scriptId).eq("client_id", clientId)
    .order("seq", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ScriptMessageRow[]).map(rowToMessage);
}

export async function insertScriptMessages(
  clientId: string, scriptId: string, userId: string | null,
  messages: { role: "user" | "assistant"; content: string; card: MessageCard | null }[],
): Promise<void> {
  if (messages.length === 0) return;
  const supabase = createServerSupabase();
  // One insert keeps them in order: `seq` is assigned row by row in array order.
  const { error } = await supabase.from("client_script_messages").insert(
    messages.map((m) => ({
      script_id: scriptId, client_id: clientId, role: m.role, content: m.content, card: m.card,
      created_by: m.role === "user" ? userId : null,
    })),
  );
  if (error) throw error;
}

export async function setMessageCard(clientId: string, scriptId: string, messageId: string, card: MessageCard): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_script_messages").update({ card })
    .eq("id", messageId).eq("script_id", scriptId).eq("client_id", clientId);
  if (error) throw error;
}

/** Settles a before-and-after card (accepted or rejected) only while it is still pending, so two
 *  accepts racing (two tabs, a retry) cannot both apply it. False when it was already settled. */
export async function claimProposalCard(clientId: string, scriptId: string, messageId: string, card: ProposalCard): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_script_messages").update({ card })
    .eq("id", messageId).eq("script_id", scriptId).eq("client_id", clientId).eq("card->>status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Scripts with no draft yet, newest first, for the library. */
export async function listUnwrittenScripts(clientId: string): Promise<UnwrittenScript[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts").select("id, brief, updated_at")
    .eq("client_id", clientId).eq("stage", "generate").is("doc", null).is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as { id: string; brief: unknown; updated_at: string }[]).map((r) => {
    const parsed = briefSchema.safeParse(r.brief);
    const b = parsed.success ? parsed.data : null;
    const title = b?.card?.title.trim() || b?.occasion.value.trim() || "New script";
    return { id: r.id, title, updatedAt: r.updated_at };
  });
}

/** Delete from the library: archives a script the copilot has not written yet. One conditional
 *  update, so a draft landing at the same moment wins and nothing is archived. A drafted script
 *  owns storyboards, a review link and an append-only activity log, so it is never deleted here.
 *  False when nothing matched. */
export async function archiveUnwrittenScript(clientId: string, scriptId: string): Promise<boolean> {
  if (!isUuid(scriptId)) return false;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", scriptId).eq("client_id", clientId).eq("stage", "generate")
    .is("doc", null).is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Generate → Visualise (spec 2 §10), only for a drafted script still at Generate on the version the
 *  fill-to-final check just passed. False when anything moved on. */
export async function markScriptFinal(clientId: string, scriptId: string, checkedVersion: number): Promise<boolean> {
  if (!isUuid(scriptId)) return false;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .update({ stage: "visualise", updated_at: new Date().toISOString() })
    .eq("id", scriptId).eq("client_id", clientId).eq("stage", "generate")
    .eq("doc_version", checkedVersion).not("doc", "is", null).is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** The avatars the copilot may cast: saved (ready) and live. Spec 3 makes the rest. */
export async function listCopilotAvatars(clientId: string): Promise<CopilotAvatar[]> {
  const avatars = await listAvatars(clientId);
  return avatars
    .filter((a) => a.status === "ready" && !a.archivedAt)
    .map((a) => ({ id: a.id, name: a.name, story: a.story ?? "", front: a.front?.url ?? null, specific: a.personType === "specific" }));
}

/** Everything the Generate workspace shows. Every Generate route returns this, so the browser's
 *  cache is replaced whole after any change (src/hooks/queries/script-generate.ts). */
export async function loadGenerateState(clientId: string, scriptId: string): Promise<GenerateState | null> {
  const script = await getGenerateScript(clientId, scriptId);
  if (!script) return null;
  const [messages, avatars, library] = await Promise.all([
    listScriptMessages(clientId, scriptId),
    listCopilotAvatars(clientId),
    script.doc ? [] : listScripts(clientId),
  ]);
  const formats = libraryFormats(library).map((f) => f.format);
  return { script, messages, avatars, formats, openItems: fillToFinal(script.doc, script.notes) };
}

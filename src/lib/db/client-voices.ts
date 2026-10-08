import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// D292 — which ElevenLabs account voices belong to which client. Every query filters on
// client_id: withClient authorises the CLIENT in the URL, not the voice id beside it.

export type ClientVoiceSource = "library" | "clone";

export async function listClientVoiceIds(clientId: string): Promise<string[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_voices")
    .select("elevenlabs_voice_id")
    .eq("client_id", clientId);
  if (error) throw error;
  return ((data ?? []) as { elevenlabs_voice_id: string }[]).map((r) => r.elevenlabs_voice_id);
}

/** Records a voice for a client. Recording the same voice twice is a no-op. */
export async function addClientVoice(args: {
  clientId: string;
  voiceId: string;
  name: string;
  source: ClientVoiceSource;
  userId: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("client_voices").upsert(
    {
      client_id: args.clientId,
      elevenlabs_voice_id: args.voiceId,
      name: args.name,
      source: args.source,
      created_by: args.userId,
    },
    { onConflict: "client_id,elevenlabs_voice_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** False when the client has no such voice recorded. */
export async function removeClientVoice(clientId: string, voiceId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_voices")
    .delete()
    .eq("client_id", clientId)
    .eq("elevenlabs_voice_id", voiceId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** How many OTHER clients have this voice recorded — the slot is only freed at zero. */
export async function countOtherClientsWithVoice(clientId: string, voiceId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("client_voices")
    .select("id", { count: "exact", head: true })
    .eq("elevenlabs_voice_id", voiceId)
    .neq("client_id", clientId);
  if (error) throw error;
  return count ?? 0;
}

/** Names of this client's live (not archived) avatars that declare this voice. */
export async function listLiveAvatarNamesUsingVoice(clientId: string, voiceId: string): Promise<string[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .select("name")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .eq("voice->>voiceId", voiceId);
  if (error) throw error;
  return ((data ?? []) as { name: string }[]).map((r) => r.name || "Untitled avatar");
}

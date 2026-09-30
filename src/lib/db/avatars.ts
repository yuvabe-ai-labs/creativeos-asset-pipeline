import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { patchToRow, rowToAvatar, type AvatarRow } from "@/lib/avatars/rows";
import type { Avatar } from "@/lib/avatars/schema";
import type { AvatarPatch } from "@/lib/avatars/utils";

// Every query filters on client_id as well as the avatar id. withClient authorises the CLIENT
// in the URL, not the avatar id beside it — without this one client could read or change
// another's avatar by guessing an id (the same reasoning as deleteBrandAsset).

export async function listAvatars(clientId: string): Promise<Avatar[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .select("*")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AvatarRow[]).map(rowToAvatar);
}

export async function getAvatar(clientId: string, avatarId: string): Promise<Avatar | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .select("*")
    .eq("id", avatarId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAvatar(data as AvatarRow) : null;
}

export async function createDraftAvatar(args: {
  clientId: string;
  userId: string;
  name?: string;
  story?: string;
}): Promise<Avatar> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .insert({
      client_id: args.clientId,
      created_by: args.userId,
      name: args.name ?? "",
      story: args.story ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToAvatar(data as AvatarRow);
}

export async function updateAvatar(
  clientId: string,
  avatarId: string,
  patch: AvatarPatch,
): Promise<Avatar | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .update({ ...patchToRow(patch), updated_at: new Date().toISOString() })
    .eq("id", avatarId)
    .eq("client_id", clientId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAvatar(data as AvatarRow) : null;
}

/** Archive, never delete (D287): a canvas that already uses the avatar keeps working.
 *  False when the avatar does not exist, belongs to another client, or is already archived. */
export async function archiveAvatar(clientId: string, avatarId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", avatarId)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

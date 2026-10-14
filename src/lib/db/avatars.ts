import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { patchToRow, rowToAvatar, type AvatarRow } from "@/lib/avatars/rows";
import type { Avatar } from "@/lib/avatars/schema";
import { isUuid, type AvatarPatch } from "@/lib/avatars/utils";

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
  // Postgres throws on a non-UUID id; a malformed id is simply not found.
  if (!isUuid(avatarId)) return null;
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
  // Optional precondition closing the read-then-write window: a route reads the avatar, plans
  // the change, then writes it, and a front replacement can land in between. Filtering the
  // write itself on the front image the caller saw makes the update match no row — rather than
  // silently landing on a different photo — when that race happens; the route tells this apart
  // from "avatar not found" (D289 amended). `ifFrontUrl: null` expresses "front is still
  // empty" — the precondition a first pick on a new draft needs, since there is no front URL
  // yet to compare against.
  opts?: { ifFrontUrl?: string | null },
): Promise<Avatar | null> {
  if (!isUuid(avatarId)) return null;
  const supabase = createServerSupabase();
  const query = supabase
    .from("client_avatars")
    .update({ ...patchToRow(patch), updated_at: new Date().toISOString() })
    .eq("id", avatarId)
    .eq("client_id", clientId);
  if (opts?.ifFrontUrl !== undefined) {
    if (opts.ifFrontUrl === null) {
      query.is("front", null);
    } else {
      // PostgREST JSON-path filter on a jsonb text field, same form as
      // node-file-cleanup.ts's `.eq("data->>fileUrl", fileUrl)`.
      query.eq("front->>url", opts.ifFrontUrl);
    }
  }
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  return data ? rowToAvatar(data as AvatarRow) : null;
}

/** Archive, never delete (D287): a canvas that already uses the avatar keeps working.
 *  False when the avatar does not exist, belongs to another client, or is already archived. */
export async function archiveAvatar(clientId: string, avatarId: string): Promise<boolean> {
  if (!isUuid(avatarId)) return false;
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

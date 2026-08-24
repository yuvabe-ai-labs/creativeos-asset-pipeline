import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// R11.3/R11.5: resolve user ids to CURRENT display names, scoped to one org.
//
// The org filter lives in the QUERY, not in the caller's discipline. Attribution must
// never resolve to a name from another organization, and the way to guarantee that is to
// make a foreign id simply absent from the result — not to trust every call site to
// remember to check. Callers render a missing id as the legacy `operator` string, or
// "Unknown" (R11.4).
//
// Resolving on read (rather than denormalising a name onto the version row) is what makes
// R11.3 true: a renamed user is never shown under a stale name, because the name was never
// copied anywhere to go stale.
//
// Two queries plus a JS join, not a PostgREST embed: org_memberships and profiles both
// reference auth.users but neither has a direct FK to the other, so there is nothing for
// PostgREST to auto-embed across. Same shape as listOrgMembers and resolveCallerContext.
export async function resolveDisplayNames(
  orgId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const supabase = createServerSupabase();

  const { data: members, error: memErr } = await supabase
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .in("user_id", unique);
  if (memErr) throw memErr;

  const allowed = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (allowed.length === 0) return new Map();

  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", allowed);
  if (profErr) throw profErr;

  return new Map(
    ((profiles ?? []) as { user_id: string; display_name: string }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );
}

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUserWithRetry } from "@/lib/supabase/get-user-with-retry";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import {
  mapAppMetadataToPlatformRole,
  mapAppMetadataToMustChangePassword,
  presetKeyToOrgRole,
  type CallerContext,
} from "./dal-logic";
import { accessFromRow, type MembershipAccessRow } from "@/lib/permissions/access";

export type { CallerContext } from "./dal-logic";

// D489/D492: ONE round trip returns the membership and everything access needs. Several rows
// = several agencies, which is not allowed yet (the one_org_per_user index); when it is, the
// agency switcher's choice picks the row here, and nowhere else.
// cache() dedupes within one render (so both resolvers share one RPC per user id), not inside
// route handlers.
const loadMembershipAccess = cache(async (userId: string): Promise<MembershipAccessRow | null> => {
  const db = createServerSupabase();
  const { data, error } = await db.rpc("get_membership_access", { p_user_id: userId });
  if (error) throw error;
  const rows = (data ?? []) as MembershipAccessRow[];
  if (rows.length > 1) throw new Error("Belonging to more than one agency is not supported yet.");
  return rows[0] ?? null;
});

function buildCallerContext(
  user: NonNullable<Awaited<ReturnType<typeof getUserWithRetry>>>,
  platformRole: CallerContext["platformRole"],
  mustChangePassword: boolean,
  row: MembershipAccessRow,
): CallerContext {
  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
    orgId: row.org_id,
    orgRole: presetKeyToOrgRole(row.preset_key),
    mustChangePassword,
    access: accessFromRow(row),
  };
}

// The primary auth entry point. Cached per request (React cache) so N callers in one page
// render share one session read + one membership query; cache() does not dedupe inside route
// handlers, so routes get the caller from their chokepoint instead. Redirects to /login if
// unauthenticated.
export const resolveCallerContext = cache(async (): Promise<CallerContext> => {
  const supabase = await createSSRServerClient();
  const user = await getUserWithRetry(supabase);
  if (!user) redirect("/login");

  const platformRole = mapAppMetadataToPlatformRole(user.app_metadata);
  const mustChangePassword = mapAppMetadataToMustChangePassword(user.app_metadata);

  const row = await loadMembershipAccess(user.id);
  if (!row) {
    // Authenticated but unprovisioned — treat as no access.
    redirect("/login?error=no-membership");
  }

  return buildCallerContext(user, platformRole, mustChangePassword, row);
});

// Non-redirecting variant of resolveCallerContext(), for callers that must never trigger a
// navigation as a side effect of checking who's logged in — e.g. the impersonation banner,
// which renders on every page including /login itself. Returns null instead of redirecting
// when there's no session; do not use this for anything that gates access to real data (use
// resolveCallerContext() for that — its redirect is the correct behavior everywhere else).
export const resolveCallerContextOrNull = cache(async (): Promise<CallerContext | null> => {
  const supabase = await createSSRServerClient();
  const user = await getUserWithRetry(supabase);
  if (!user) return null;

  const platformRole = mapAppMetadataToPlatformRole(user.app_metadata);
  const mustChangePassword = mapAppMetadataToMustChangePassword(user.app_metadata);

  const row = await loadMembershipAccess(user.id);
  if (!row) return null;

  return buildCallerContext(user, platformRole, mustChangePassword, row);
});

// The org whose data the caller should see. Defaults to the caller's own org; when a
// valid, live-re-checked impersonation session is active (Stage 4, D81), returns the
// target org instead. See src/lib/auth/impersonation.ts for the cookie mechanics.
export const resolveOrgId = cache(async (): Promise<string> => {
  const impersonation = await resolveImpersonationState();
  if (impersonation.isImpersonating) return impersonation.targetOrgId;

  const caller = await resolveCallerContext();
  return caller.orgId;
});

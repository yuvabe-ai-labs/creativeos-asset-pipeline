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
  type CallerContext,
  type OrgRole,
} from "./dal-logic";

export type { CallerContext } from "./dal-logic";

// The primary auth entry point (from Stage 1C onward). Every route handler / server
// action / protected page will call this at the top. Cached per request (React cache)
// so N callers in one render share one session read + one membership query. Redirects
// to /login if unauthenticated — note /login doesn't exist until Stage 1C, so hitting
// this unauthenticated in 1B correctly redirects toward a page that 404s for now.
export const resolveCallerContext = cache(async (): Promise<CallerContext> => {
  const supabase = await createSSRServerClient();
  const user = await getUserWithRetry(supabase);
  if (!user) redirect("/login");

  const platformRole = mapAppMetadataToPlatformRole(user.app_metadata);
  const mustChangePassword = mapAppMetadataToMustChangePassword(user.app_metadata);

  // Membership read uses the service-role client. org_memberships has no RLS by design
  // in Stage 1 (app-layer enforces) — see the Stage 1 plan's Global Constraints.
  const db = createServerSupabase();
  const { data: membership, error } = await db
    .from("org_memberships")
    .select("org_id, org_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership) {
    // Authenticated but unprovisioned — treat as no access.
    redirect("/login?error=no-membership");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
    orgId: membership.org_id as string,
    orgRole: membership.org_role as OrgRole,
    mustChangePassword,
  };
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

  const db = createServerSupabase();
  const { data: membership, error } = await db
    .from("org_memberships")
    .select("org_id, org_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
    orgId: membership.org_id as string,
    orgRole: membership.org_role as OrgRole,
    mustChangePassword,
  };
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

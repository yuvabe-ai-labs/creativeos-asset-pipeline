import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  mapAppMetadataToPlatformRole,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const platformRole = mapAppMetadataToPlatformRole(user.app_metadata);

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
  };
});

// The org whose data the caller should see. In Stage 1C this is just their own org;
// Stage 4 layers impersonation on top by reading a cookie here.
export const resolveOrgId = cache(async (): Promise<string> => {
  const caller = await resolveCallerContext();
  return caller.orgId;
});

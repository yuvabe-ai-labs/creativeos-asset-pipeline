import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { orgRoleToIdentityRole } from "@/lib/dal-logic";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";

// Explicit, not just relying on cookies() usage inside resolveCallerContext() to implicitly
// opt this route out of caching — this is the identity endpoint every auth-state transition
// (login, sign-out + sign-in as someone else, a forced password change) depends on returning
// fresh data for, every single time. Paired with useIdentity()'s fetch({ cache: "no-store" }).
export const dynamic = "force-dynamic";

// Feeds useIdentity(). Returns the display name + the frozen Identity.role (owner/senior →
// "senior" so Approve shows — see dal-logic) alongside the real orgRole, kept separate: the
// popover needs to show an Owner "Owner", not "Senior".
export async function GET() {
  const caller = await resolveCallerContext();
  const db = createServerSupabase();
  const [{ data, error }, org, creditsUsed] = await Promise.all([
    db.from("profiles").select("display_name").eq("user_id", caller.userId).maybeSingle(),
    getOrgById(caller.orgId),
    getOrgCreditUsage(caller.orgId),
  ]);
  if (error) return apiError("Failed to load profile.", 500);

  return apiOk({
    name: (data?.display_name as string) ?? "User",
    role: orgRoleToIdentityRole(caller.orgRole),
    orgRole: caller.orgRole,
    platformRole: caller.platformRole,
    orgId: caller.orgId,
    orgName: org?.name ?? null,
    creditsUsed,
    monthlyCreditLimit: org?.monthly_credit_limit ?? null,
  });
}

import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { orgRoleToIdentityRole } from "@/lib/dal-logic";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";

// Feeds the future useIdentity() swap (Stage 1C). Returns the display name + the frozen
// Identity.role (owner/senior → "senior" so Approve shows). See dal-logic.
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
    platformRole: caller.platformRole,
    orgId: caller.orgId,
    orgName: org?.name ?? null,
    creditsUsed,
    monthlyCreditLimit: org?.monthly_credit_limit ?? null,
  });
}

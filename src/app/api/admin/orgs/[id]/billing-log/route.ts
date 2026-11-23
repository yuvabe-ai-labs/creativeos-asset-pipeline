import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listBillingLog } from "@/lib/db/billing-admin";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { pageParam } from "@/lib/billing/usage-page-size";

// GET /api/admin/orgs/:id/billing-log?page=N — older pages of an agency's billing log (D529). Page 1
// comes with the admin page itself. Super admin only, like the sibling generations route.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id: orgId } = await params;
  const page = pageParam(new URL(req.url).searchParams.get("page"));
  return withTryCatch("Could not load the billing log.", async () => apiOk(await listBillingLog(orgId, page)));
}

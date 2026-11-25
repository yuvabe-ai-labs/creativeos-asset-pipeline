import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listRecentPayments } from "@/lib/db/billing-admin-payments";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { pageParam } from "@/lib/billing/usage-page-size";

// GET /api/admin/payments?page=N — older pages of Admin › Payments (D588). Page 1 comes with the
// page itself. Super admin only.
export async function GET(req: Request) {
  await requireSuperAdmin();
  const page = pageParam(new URL(req.url).searchParams.get("page"));
  return withTryCatch("Could not load payments.", async () => apiOk(await listRecentPayments(page)));
}

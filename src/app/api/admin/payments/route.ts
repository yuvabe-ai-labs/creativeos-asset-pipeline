import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listAdminPaymentsPage } from "@/lib/db/billing-admin-payments";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { paymentFiltersFromParams } from "@/lib/billing/admin-payments-filters";

// GET /api/admin/payments?range=…&status=…&q=…&page=N — Admin › Payments' ledger for other filters
// and older pages (D588, D592): the page of payments and the totals by status. The page's first
// view comes with the page itself. Super admin only.
export async function GET(req: Request) {
  await requireSuperAdmin();
  const filters = paymentFiltersFromParams(new URL(req.url).searchParams);
  return withTryCatch("Could not load payments.", async () => apiOk(await listAdminPaymentsPage(filters)));
}

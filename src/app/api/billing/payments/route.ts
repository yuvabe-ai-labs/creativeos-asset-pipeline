import { apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { listOwnerPayments } from "@/lib/db/billing-owner";
import { pageParam } from "@/lib/billing/usage-page-size";

// GET /api/billing/payments?page=N — older pages of the owner's payments (D529), the caller's own
// agency only. Page 1 comes with the Billing page itself.
export async function GET(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not load payments.", async () =>
      apiOk(await listOwnerPayments(orgId, pageParam(new URL(req.url).searchParams.get("page")))),
    ),
  );
}

import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { payNowLink } from "@/lib/billing/subscriptions";

// The owner pays a due plan charge (D526): answers the payment page to open.
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not open the payment page.", async () => {
      const result = await payNowLink(orgId);
      return result.ok ? apiOk(result.value) : apiError(result.error, result.status);
    }),
  );
}

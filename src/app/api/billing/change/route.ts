import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { changePlan } from "@/lib/billing/subscriptions";

// The owner moves to another plan from the next payment (D580).
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not change the plan.", async () => {
      const body = (await req.json().catch(() => null)) as { priceId?: unknown } | null;
      if (typeof body?.priceId !== "string" || !body.priceId) return apiError("Pick a plan.", 400);
      const result = await changePlan(orgId, body.priceId);
      return result.ok ? apiOk(result.value) : apiError(result.error, result.status);
    }),
  );
}

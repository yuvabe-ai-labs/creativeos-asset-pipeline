import "server-only";
import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";

/** The owner's billing pages: the agency being acted in, or the 404 page for anyone without
 *  view_credits (members never see billing, D523). */
export async function requireBillingOwner(): Promise<string> {
  const { caller, effectiveOrgId } = await resolveActingCaller();
  if (check(accessOf(caller), "view_credits", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  return effectiveOrgId;
}

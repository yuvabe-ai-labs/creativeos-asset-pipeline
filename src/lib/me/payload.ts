// src/lib/me/payload.ts
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import { check } from "@/lib/permissions/check";
import { orderedPermissions } from "@/lib/permissions/model";
import { accessOf, resolveActingCallerOrNull, type ActingCaller } from "@/lib/permissions/server";
import type { MePayload } from "./types";

// One builder for /api/me and the root layout, so the first HTML and every refetch carry the
// same thing. The reads run in parallel; the credit read runs only for someone who may see it.
export async function buildMePayload({ caller, effectiveOrgId }: ActingCaller): Promise<MePayload> {
  const access = accessOf(caller);
  const org = access.orgs.get(effectiveOrgId);
  const showCredits = check(access, "view_credits", { orgId: effectiveOrgId, clientId: null }) === "allow";
  const [name, orgRow, creditsUsed] = await Promise.all([
    getDisplayName(caller.userId),
    getOrgById(effectiveOrgId),
    showCredits ? getOrgCreditUsage(effectiveOrgId) : Promise.resolve(null),
  ]);
  return {
    name: name ?? "User",
    platformRole: caller.platformRole,
    orgId: effectiveOrgId,
    orgName: orgRow?.name ?? null,
    isOwner: org?.isOwner ?? false,
    accessGiven: org?.accessGiven ?? false,
    permissions: org ? orderedPermissions(org.permissions) : [],
    clients: org
      ? [...org.clients]
          .map(([clientId, set]) => ({ clientId, permissions: orderedPermissions(set) }))
          .sort((a, b) => a.clientId.localeCompare(b.clientId))
      : [],
    creditsUsed,
    monthlyCreditLimit: showCredits ? (orgRow?.monthly_credit_limit ?? null) : null,
  };
}

// For the root layout. A failure here must not take every page down: the layout passes null and
// the browser fetches /api/me on mount. The server still refuses what it must, and a failed access
// read on a page is that page's error, never "no access" (spec §4.1).
export async function loadInitialMe(): Promise<MePayload | null> {
  try {
    const acting = await resolveActingCallerOrNull();
    return acting ? await buildMePayload(acting) : null;
  } catch (e) {
    unstable_rethrow(e);
    console.error("[layout] could not load the access payload; the browser will fetch it", e);
    return null;
  }
}

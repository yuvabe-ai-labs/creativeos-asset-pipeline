// src/lib/me/payload.ts
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import { check, clientIdsWith } from "@/lib/permissions/check";
import { packAccessRules } from "@/lib/permissions/browser";
import { accessOf, resolveActingCallerOrNull, type ActingCaller } from "@/lib/permissions/server";
import type { MePayload } from "./types";

// One builder for /api/me and the root layout, so the first HTML and every refetch carry the
// same thing. The reads run in parallel; the credit read runs only for someone who may see it.
// Until Task 7 the payload keeps its old fields, worked out from the six-permission access.
export async function buildMePayload({ caller, effectiveOrgId }: ActingCaller): Promise<MePayload> {
  const access = accessOf(caller);
  const on = { orgId: effectiveOrgId, clientId: null };
  const everything = access.isSuperAdmin || access.orgs.get(effectiveOrgId)?.isOwner === true;
  const showCredits = check(access, "view_credits", on) === "allow";
  const approves = check(access, "approve", on) === "allow";
  const scope = clientIdsWith(access, effectiveOrgId, "view");
  const [name, org, creditsUsed] = await Promise.all([
    getDisplayName(caller.userId),
    getOrgById(effectiveOrgId),
    showCredits ? getOrgCreditUsage(effectiveOrgId) : Promise.resolve(null),
  ]);
  return {
    name: name ?? "User",
    platformRole: caller.platformRole,
    orgId: effectiveOrgId,
    orgName: org?.name ?? null,
    presetKey: everything ? "owner" : "member",
    presetName: everything ? "Owner" : "Member",
    permissions: packAccessRules(access, effectiveOrgId),
    clientScope: scope ?? "all",
    creditsUsed,
    monthlyCreditLimit: showCredits ? (org?.monthly_credit_limit ?? null) : null,
    role: approves ? "senior" : "designer",
    orgRole: everything ? "owner" : "designer",
  };
}

// For the root layout. A failure here must not take every page down: the layout passes null and
// the browser fetches /api/me on mount, as before this plan. The server still refuses what it must.
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

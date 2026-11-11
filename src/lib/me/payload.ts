// src/lib/me/payload.ts
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { orgRoleToIdentityRole } from "@/lib/dal-logic";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import { getPresetName } from "@/lib/db/presets";
import { can } from "@/lib/permissions/check";
import { packAccessRules } from "@/lib/permissions/browser";
import { accessOf, resolveActingCallerOrNull, type ActingCaller } from "@/lib/permissions/server";
import type { MePayload } from "./types";

// One builder for /api/me and the root layout, so the first HTML and every refetch carry the
// same thing. The reads run in parallel; the credit read runs only for someone who may see it.
export async function buildMePayload({ caller, effectiveOrgId }: ActingCaller): Promise<MePayload> {
  const access = accessOf(caller);
  const showCredits = can(access, "credits.view");
  const [name, org, presetName, creditsUsed] = await Promise.all([
    getDisplayName(caller.userId),
    getOrgById(effectiveOrgId),
    getPresetName(access.presetKey),
    showCredits ? getOrgCreditUsage(effectiveOrgId) : Promise.resolve(null),
  ]);
  return {
    name: name ?? "User",
    platformRole: caller.platformRole,
    orgId: effectiveOrgId,
    orgName: org?.name ?? null,
    presetKey: access.presetKey,
    presetName,
    permissions: packAccessRules(access),
    clientScope: access.clientScope === "all" ? "all" : [...access.clientScope].sort(),
    creditsUsed,
    monthlyCreditLimit: showCredits ? (org?.monthly_credit_limit ?? null) : null,
    role: orgRoleToIdentityRole(caller.orgRole),
    orgRole: caller.orgRole,
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

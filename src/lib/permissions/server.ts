import "server-only";
import { cache } from "react";
import { resolveCallerContext, resolveCallerContextOrNull, type CallerContext } from "@/lib/dal";
import { resolveImpersonationState, type ImpersonationState } from "@/lib/auth/impersonation";
import { impersonatedAccess, type Access } from "./model";

// Fails closed: a caller without loaded access can do nothing. Tests that mock the caller get
// owner access by default through vitest.setup.ts, which replaces this one function.
export function accessOf(caller: { access?: Access }): Access {
  if (!caller.access) throw new Error("Access was not loaded for this request.");
  return caller.access;
}

export type ActingCaller = {
  caller: CallerContext;
  effectiveOrgId: string;
  impersonation: ImpersonationState;
};

function actingFrom(caller: CallerContext, impersonation: ImpersonationState): ActingCaller {
  if (impersonation.isImpersonating) {
    return { caller: { ...caller, access: impersonatedAccess(caller.userId, impersonation.targetOrgId) }, effectiveOrgId: impersonation.targetOrgId, impersonation };
  }
  return { caller, effectiveOrgId: caller.orgId, impersonation };
}

// The caller and the agency they are acting in, resolved once. While a super admin
// impersonates (D81) they act as that agency's owner: the target org, owner access. caller.orgId
// stays their own (attribution and credits already use effectiveOrgId, as withNode did).
// React cache() dedupes this within a page render; route handlers call it once and pass it on.
export const resolveActingCaller = cache(async (): Promise<ActingCaller> => {
  const [caller, impersonation] = await Promise.all([resolveCallerContext(), resolveImpersonationState()]);
  return actingFrom(caller, impersonation);
});

// The same without a redirect, for the root layout, which renders on /login and the public
// review pages too. Null = nobody signed in (or no membership).
export const resolveActingCallerOrNull = cache(async (): Promise<ActingCaller | null> => {
  const [caller, impersonation] = await Promise.all([resolveCallerContextOrNull(), resolveImpersonationState()]);
  return caller ? actingFrom(caller, impersonation) : null;
});

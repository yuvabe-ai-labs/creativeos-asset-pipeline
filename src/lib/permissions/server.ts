import "server-only";
import { cache } from "react";
import { resolveCallerContext, type CallerContext } from "@/lib/dal";
import { resolveImpersonationState, type ImpersonationState } from "@/lib/auth/impersonation";
import { ownerAccess, type Access } from "./access";

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

// The caller and the agency they are acting in, resolved once. While a super admin
// impersonates (D81) they act as that agency's owner: the target org, owner access. caller.orgId
// stays their own (attribution and credits already use effectiveOrgId, as withNode did).
// React cache() dedupes this within a page render; route handlers call it once and pass it on.
export const resolveActingCaller = cache(async (): Promise<ActingCaller> => {
  const [caller, impersonation] = await Promise.all([resolveCallerContext(), resolveImpersonationState()]);
  if (impersonation.isImpersonating) {
    return { caller: { ...caller, access: ownerAccess() }, effectiveOrgId: impersonation.targetOrgId, impersonation };
  }
  return { caller, effectiveOrgId: caller.orgId, impersonation };
});

import "server-only";
import type { CallerContext } from "@/lib/dal";
import type { ImpersonationState } from "@/lib/auth/impersonation";
import { accessOf, resolveActingCaller } from "./server";
import { resolveTarget, type ActionTarget, type ResolvedTarget } from "./targets";
import { denialFor, ForbiddenError } from "./check";
import type { PermissionKey } from "./catalogue";

export const NOT_FOUND_MESSAGE = "Not found.";

export type ActionGuard =
  | { need: PermissionKey; on: ActionTarget }
  /** The action checks permission itself, after reading what it acts on. Say why. */
  | { custom: string };

export type ActionContext = {
  caller: CallerContext;
  effectiveOrgId: string;
  target: ResolvedTarget | null;
  /** Resolved with the caller, so withAction's write gate does not read it again. */
  impersonation: ImpersonationState;
};

// D490 for server actions: the same agency + client scope + tick rule as the API chokepoints.
// Throws (server actions throw on invalid states in this codebase); "Not found." never says
// whether the row exists in another agency or outside the person's clients. The target row
// does not depend on the caller, so both are read at once.
export async function checkActionAccess(guard: ActionGuard): Promise<ActionContext> {
  const targetRef = "custom" in guard || guard.on === "agency" ? null : guard.on;
  const [acting, target] = await Promise.all([
    resolveActingCaller(),
    targetRef ? resolveTarget(targetRef) : Promise.resolve(null),
  ]);
  const base = { caller: acting.caller, effectiveOrgId: acting.effectiveOrgId, impersonation: acting.impersonation };
  if ("custom" in guard) return { ...base, target: null };

  const access = accessOf(acting.caller);
  if (guard.on === "agency") {
    if (denialFor(access, guard.need, null)) throw new ForbiddenError();
    return { ...base, target: null };
  }

  if (!target || target.orgId !== acting.effectiveOrgId) throw new Error(NOT_FOUND_MESSAGE);
  const denied = denialFor(access, guard.need, target.clientId);
  if (denied === "not_found") throw new Error(NOT_FOUND_MESSAGE);
  if (denied === "forbidden") throw new ForbiddenError();
  return { ...base, target };
}

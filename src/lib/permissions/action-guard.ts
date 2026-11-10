import "server-only";
import type { CallerContext } from "@/lib/dal";
import { accessOf, resolveActingCaller } from "./server";
import { resolveTarget, type ActionTarget, type ResolvedTarget } from "./targets";
import { denialFor, ForbiddenError } from "./check";
import type { PermissionKey } from "./catalogue";

export const NOT_FOUND_MESSAGE = "Not found.";

export type ActionGuard =
  | { need: PermissionKey; on: ActionTarget }
  /** The action checks permission itself, after reading what it acts on. Say why. */
  | { custom: string };

export type ActionContext = { caller: CallerContext; effectiveOrgId: string; target: ResolvedTarget | null };

// D490 for server actions: the same agency + client scope + tick rule as the API chokepoints.
// Throws (server actions throw on invalid states in this codebase); "Not found." never says
// whether the row exists in another agency or outside the person's clients.
export async function checkActionAccess(guard: ActionGuard): Promise<ActionContext> {
  const acting = await resolveActingCaller();
  const base = { caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
  if ("custom" in guard) return { ...base, target: null };

  const access = accessOf(acting.caller);
  if (guard.on === "agency") {
    if (denialFor(access, guard.need, null)) throw new ForbiddenError();
    return { ...base, target: null };
  }

  const target = await resolveTarget(guard.on);
  if (!target || target.orgId !== acting.effectiveOrgId) throw new Error(NOT_FOUND_MESSAGE);
  const denied = denialFor(access, guard.need, target.clientId);
  if (denied === "not_found") throw new Error(NOT_FOUND_MESSAGE);
  if (denied === "forbidden") throw new ForbiddenError();
  return { ...base, target };
}

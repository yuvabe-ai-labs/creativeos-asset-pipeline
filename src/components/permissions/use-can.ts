"use client";

import { useMemo } from "react";
import { useAbility } from "@casl/react";
import { useMe } from "@/hooks/queries/me";
import type { AppAbility } from "@/lib/permissions/ability";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { canInBrowser } from "@/lib/permissions/browser";

// Every browser check goes through these: what to SHOW, never what to permit (the server decides).
// In-memory, from the one ability AccessProvider holds; the ability only changes when the rules
// do, so a canvas drag never re-renders a gated component.

export function useAppAbility(): AppAbility {
  return useAbility<AppAbility>();
}

/** With a client: that client. Without: whether the person has the key for any client. */
export function useCan(key: PermissionKey, clientId?: string): boolean {
  return canInBrowser(useAppAbility(), key, clientId);
}

export function useCanSeeClient(clientId: string): boolean {
  const scope = useMe().data?.clientScope;
  const picked = useMemo(() => (scope && scope !== "all" ? new Set(scope) : null), [scope]);
  if (!scope) return false;
  return scope === "all" || (picked?.has(clientId) ?? false);
}

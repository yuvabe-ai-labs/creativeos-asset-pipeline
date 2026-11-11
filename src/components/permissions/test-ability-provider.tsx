"use client";

import type { ReactNode } from "react";
import { AbilityProvider } from "@casl/react";
import { browserClientScope } from "@/lib/permissions/browser";
import { ClientScopeContext } from "./client-scope";
import { buildAbility, buildRules } from "@/lib/permissions/ability";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/lib/permissions/catalogue";

/** For component tests: an ability with these keys (default: every key) for these clients (default: all). */
export function TestAbilityProvider({
  keys = ALL_PERMISSION_KEYS,
  clientIds,
  children,
}: {
  keys?: readonly PermissionKey[];
  clientIds?: readonly string[];
  children: ReactNode;
}) {
  const ability = buildAbility(buildRules(new Set(keys), clientIds ? new Set(clientIds) : "all"));
  return (
    <AbilityProvider value={ability}>
      <ClientScopeContext.Provider value={browserClientScope(clientIds ?? "all")}>{children}</ClientScopeContext.Provider>
    </AbilityProvider>
  );
}

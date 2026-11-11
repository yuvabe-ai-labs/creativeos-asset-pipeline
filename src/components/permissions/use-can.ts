"use client";

import { useContext } from "react";
import { useAbility } from "@casl/react";
import type { AppAbility } from "@/lib/permissions/ability";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { canInBrowser, canSeeClientInScope } from "@/lib/permissions/browser";
import { canDownload } from "@/lib/permissions/downloads";
import { ClientScopeContext } from "./client-scope";

// Every browser check goes through these: what to SHOW, never what to permit (the server decides).
// In-memory, from the one ability and scope AccessProvider holds; they only change when the rules
// do, so a canvas drag never re-renders a gated component.

export function useAppAbility(): AppAbility {
  return useAbility<AppAbility>();
}

/** With a client: that client. Without: whether the person has the key for any client. */
export function useCan(key: PermissionKey, clientId?: string): boolean {
  return canInBrowser(useAppAbility(), key, clientId);
}

/** Whether to show a download button. `approved`: the file is an approved version. */
export function useCanDownload(clientId: string, approved: boolean): boolean {
  return canDownload(useAppAbility(), clientId, approved);
}

export function useCanSeeClient(clientId: string): boolean {
  return canSeeClientInScope(useContext(ClientScopeContext), clientId);
}

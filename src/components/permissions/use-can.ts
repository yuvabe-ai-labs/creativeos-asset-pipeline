"use client";

import { useContext } from "react";
import { check } from "@/lib/permissions/check";
import type { Action } from "@/lib/permissions/model";
import { AccessContext } from "./access-context";

// Every browser check: what to SHOW, never what to permit (the server runs the same check()).
// One Access in context; a check is a Map lookup, so a canvas drag never re-renders a gated
// component.

/** With a client: that client. Without: on at least one client (nav, tabs), or an owner-only
 *  action. An empty client id is what useClientId() returns outside a canvas: it fails closed. */
export function useCan(action: Action, clientId?: string): boolean {
  const { access, orgId } = useContext(AccessContext);
  if (clientId === "") return false;
  return check(access, action, { orgId, clientId: clientId ?? null }) === "allow";
}

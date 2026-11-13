// src/lib/permissions/check.ts
import { isPermission, NO_CLIENT_PERMISSIONS, PERMISSIONS, type Access, type Action, type ClientPermissions, type Permission } from "./model";

export const FORBIDDEN_MESSAGE = "You don't have access to this. Ask your agency owner.";

export class ForbiddenError extends Error {
  constructor() {
    super(FORBIDDEN_MESSAGE);
    this.name = "ForbiddenError";
  }
}

// D504: the one checker (spec §4.2), on the server and in the browser. Every step is a Map or
// Set lookup. Rules that depend on the resource itself can be added behind this function later
// without touching routes or screens.

export type Decision = "allow" | "not_found" | "forbidden";

/** clientId null: "on at least one client the person can view", for routes and nav items not
 *  rooted at one client (the voice library, the moodboard index, the review inbox). */
export type CheckTarget = { orgId: string; clientId: string | null };

export function check(access: Access, action: Action, { orgId, clientId }: CheckTarget): Decision {
  if (access.isSuperAdmin) return "allow";
  const org = access.orgs.get(orgId);
  if (!org) return "not_found";
  if (org.isOwner) return "allow";
  // A refusal never confirms that a client the person is not on exists: for a real client the
  // visibility step comes before the owner-only one.
  if (clientId !== null) {
    const row = org.accessGiven ? org.clients.get(clientId) : undefined;
    if (!row || !row.has("view")) return "not_found";
    if (!isPermission(action)) return "forbidden";
    return row.has(action) ? "allow" : "forbidden";
  }
  if (!isPermission(action)) return "forbidden";
  if (!org.accessGiven || !org.anyClient.has("view")) return "not_found";
  return org.anyClient.has(action) ? "allow" : "forbidden";
}

/** The clients a list keeps to: those the person can view that hold `action`. null = every
 *  client of the agency (the owner, a super admin). */
export function clientIdsWith(access: Access, orgId: string, action: Permission): string[] | null {
  if (access.isSuperAdmin) return null;
  const org = access.orgs.get(orgId);
  if (!org) return [];
  if (org.isOwner) return null;
  if (!org.accessGiven) return [];
  const ids: string[] = [];
  for (const [id, set] of org.clients) if (set.has("view") && set.has(action)) ids.push(id);
  return ids.sort();
}

/** Spec §2.4: signed up and waiting, or on no client they can view. They see only /onboarding. */
export function isWaiting(access: Access, orgId: string): boolean {
  if (access.isSuperAdmin) return false;
  const org = access.orgs.get(orgId);
  if (!org || org.isOwner) return false;
  return !org.accessGiven || !org.anyClient.has("view");
}

/** The six answers for one client. An empty client id (outside a canvas) answers none. */
export function clientPermissionsFor(access: Access, orgId: string, clientId: string): ClientPermissions {
  if (clientId === "") return NO_CLIENT_PERMISSIONS;
  const out = { ...NO_CLIENT_PERMISSIONS };
  for (const p of PERMISSIONS) out[p] = check(access, p, { orgId, clientId }) === "allow";
  return out;
}

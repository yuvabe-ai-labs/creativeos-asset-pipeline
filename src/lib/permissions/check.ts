// src/lib/permissions/check.ts
import {
  CLIENT_ACTIONS,
  NO_CLIENT_PERMISSIONS,
  OWNER_ACTIONS,
  PERMISSIONS,
  permissionFor,
  type Access,
  type Action,
  type ClientAction,
  type ClientPermissions,
  type OwnerAction,
  type Permission,
} from "./model";

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

/** clientId null: "on at least one client", for routes and nav items not rooted at one client
 *  (the voice library, the moodboard index, the review inbox). */
export type CheckTarget = { orgId: string; clientId: string | null };

const OWNER_ACTION_SET: ReadonlySet<string> = new Set(OWNER_ACTIONS);
const isOwnerAction = (action: Action): action is OwnerAction => OWNER_ACTION_SET.has(action);

export function check(access: Access, action: Action, { orgId, clientId }: CheckTarget): Decision {
  if (access.isSuperAdmin) return "allow";
  const org = access.orgs.get(orgId);
  if (!org) return "not_found";
  if (org.isOwner) return "allow";
  // A refusal never confirms that a client the person is not on exists: for a named client the
  // visibility step comes before the owner-only one.
  const row = clientId !== null && org.accessGiven ? org.clients.get(clientId) : undefined;
  if (clientId !== null && !row) return "not_found";
  if (isOwnerAction(action)) return "forbidden";
  if (clientId === null && (!org.accessGiven || org.clients.size === 0)) return "not_found";
  const needed = permissionFor(action);
  if (needed === null) return "allow";
  return (row ?? org.anyClient).has(needed) ? "allow" : "forbidden";
}

/** The clients a list keeps to: for `view` every client the person is on, otherwise those holding
 *  the permission the action needs. null = every client of the agency (the owner, a super admin). */
export function clientIdsWith(access: Access, orgId: string, action: Permission | ClientAction): string[] | null {
  if (access.isSuperAdmin) return null;
  const org = access.orgs.get(orgId);
  if (!org) return [];
  if (org.isOwner) return null;
  if (!org.accessGiven) return [];
  const needed = permissionFor(action);
  const ids: string[] = [];
  for (const [id, set] of org.clients) if (needed === null || set.has(needed)) ids.push(id);
  return ids.sort();
}

/** Spec §2.4: signed up and waiting, or a member on no client. They see only /onboarding. */
export function isWaiting(access: Access, orgId: string): boolean {
  if (access.isSuperAdmin) return false;
  const org = access.orgs.get(orgId);
  if (!org || org.isOwner) return false;
  return !org.accessGiven || org.clients.size === 0;
}

/** View, edit and the five permissions for one client. An empty client id (outside a canvas)
 *  answers none. */
export function clientPermissionsFor(access: Access, orgId: string, clientId: string): ClientPermissions {
  if (clientId === "") return NO_CLIENT_PERMISSIONS;
  const out = { ...NO_CLIENT_PERMISSIONS };
  for (const a of [...CLIENT_ACTIONS, ...PERMISSIONS]) out[a] = check(access, a, { orgId, clientId }) === "allow";
  return out;
}

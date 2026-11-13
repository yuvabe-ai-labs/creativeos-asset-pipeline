import { subject } from "@casl/ability";
import { isClientScopedKey, splitKey, type AgencyKey, type ClientScopedKey, type PermissionKey } from "./catalogue";
import type { Access } from "./access";
import { isPermission, type Access as SixAccess, type Action, type Permission } from "./model";

export const FORBIDDEN_MESSAGE = "You don't have access to this. Ask your agency owner.";

export class ForbiddenError extends Error {
  constructor() {
    super(FORBIDDEN_MESSAGE);
    this.name = "ForbiddenError";
  }
}

export function canSeeClient(access: Access, clientId: string): boolean {
  return access.clientScope === "all" || access.clientScope.has(clientId);
}

/** The client ids a list query should be limited to; null = every client in the agency. */
export function scopeIds(access: Access): string[] | null {
  return access.clientScope === "all" ? null : [...access.clientScope];
}

// Server checks. A client-scoped key must name the client: asking CASL about a subject TYPE
// ignores conditions and answers "yes if any rule exists" (D499's sharp edge).
export function can(access: Access, key: ClientScopedKey, clientId: string): boolean;
export function can(access: Access, key: AgencyKey): boolean;
export function can(access: Access, key: PermissionKey, clientId?: string): boolean {
  const { area, level } = splitKey(key);
  if (isClientScopedKey(key)) {
    if (!clientId) return false;
    return access.ability.can(level, subject(area, { clientId }));
  }
  return access.ability.can(level, area);
}

// For routes not rooted at one client (the voice library, the moodboard index, the review
// inbox): the key is held and the person can see at least one client. Such routes then filter
// what they return with canSeeClient.
export function canAnywhere(access: Access, key: PermissionKey): boolean {
  if (!access.permissions.has(key)) return false;
  if (!isClientScopedKey(key)) return true;
  return access.clientScope === "all" || access.clientScope.size > 0;
}

export type Denial = "not_found" | "forbidden";

// Out of scope is checked first and answers not_found, so a refusal never confirms that a
// client the person can't see exists (D496).
export function denialFor(access: Access, key: PermissionKey, clientId: string | null): Denial | null {
  if (clientId !== null && !canSeeClient(access, clientId)) return "not_found";
  if (!isClientScopedKey(key)) return can(access, key as AgencyKey) ? null : "forbidden";
  if (clientId === null) return canAnywhere(access, key) ? null : "forbidden";
  return can(access, key, clientId) ? null : "forbidden";
}

// ── D504: the one checker (spec §4.2). Task 5 moves every caller onto it and removes the
// functions above. Every step is a Map or Set lookup.

export type Decision = "allow" | "not_found" | "forbidden";

/** clientId null: "on at least one client the person can view", for routes and nav items not
 *  rooted at one client (the voice library, the moodboard index, the review inbox). */
export type CheckTarget = { orgId: string; clientId: string | null };

export function check(access: SixAccess, action: Action, { orgId, clientId }: CheckTarget): Decision {
  if (access.isSuperAdmin) return "allow";
  const org = access.orgs.get(orgId);
  if (!org) return "not_found";
  if (org.isOwner) return "allow";
  if (!isPermission(action)) return "forbidden";
  if (!org.accessGiven) return "not_found";
  if (clientId === null) {
    if (!org.anyClient.has("view")) return "not_found";
    return org.anyClient.has(action) ? "allow" : "forbidden";
  }
  const row = org.clients.get(clientId);
  if (!row || !row.has("view")) return "not_found";
  return row.has(action) ? "allow" : "forbidden";
}

/** The clients a list keeps to: those the person can view that hold `action`. null = every
 *  client of the agency (the owner, a super admin). */
export function clientIdsWith(access: SixAccess, orgId: string, action: Permission): string[] | null {
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
export function isWaiting(access: SixAccess, orgId: string): boolean {
  if (access.isSuperAdmin) return false;
  const org = access.orgs.get(orgId);
  if (!org || org.isOwner) return false;
  return !org.accessGiven || !org.anyClient.has("view");
}

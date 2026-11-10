import { subject } from "@casl/ability";
import { isClientScopedKey, splitKey, type AgencyKey, type ClientScopedKey, type PermissionKey } from "./catalogue";
import type { Access } from "./access";

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

// Server checks. A client-scoped key must name the client: asking CASL about a subject TYPE
// ignores conditions and answers "yes if any rule exists" (D493's sharp edge).
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
// client the person can't see exists (D490).
export function denialFor(access: Access, key: PermissionKey, clientId: string | null): Denial | null {
  if (clientId !== null && !canSeeClient(access, clientId)) return "not_found";
  if (!isClientScopedKey(key)) return can(access, key as AgencyKey) ? null : "forbidden";
  if (clientId === null) return canAnywhere(access, key) ? null : "forbidden";
  return can(access, key, clientId) ? null : "forbidden";
}

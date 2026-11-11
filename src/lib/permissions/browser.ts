import { subject } from "@casl/ability";
import { packRules, unpackRules, type PackRule } from "@casl/ability/extra";
import { buildAbility, buildRules, type AppAbility, type AppRule } from "./ability";
import { isClientScopedKey, splitKey, type PermissionKey } from "./catalogue";
import type { Access } from "./access";

// D493 §6.3: the server packs the person's rules into the first HTML and /api/me; the browser
// unpacks them into one ability. Rules are only ever built on the server (plan 1); nothing here
// turns browser input into a rule.

export type PackedRules = PackRule<AppRule>[];

export function packAccessRules(access: Access): PackedRules {
  return packRules(buildRules(access.permissions, access.clientScope));
}

export function rulesFromPacked(packed: PackedRules): AppRule[] {
  return unpackRules<AppRule>(packed);
}

export function abilityFromPacked(packed: PackedRules): AppAbility {
  return buildAbility(rulesFromPacked(packed));
}

// What to SHOW. With a client, a client-scoped key is checked for that client. Without one it
// asks about the subject type, which CASL answers "yes if any rule exists": right for a tab or
// a nav item, never enough on the server (plan 1's can() requires the client there).
export function canInBrowser(ability: AppAbility, key: PermissionKey, clientId?: string): boolean {
  const { area, level } = splitKey(key);
  if (clientId && isClientScopedKey(key)) return ability.can(level, subject(area, { clientId }));
  return ability.can(level, area);
}

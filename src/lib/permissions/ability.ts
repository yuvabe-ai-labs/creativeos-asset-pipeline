import { createMongoAbility, type ForcedSubject, type MongoAbility } from "@casl/ability";
import { isClientScopedKey, splitKey, type Area, type Level, type PermissionKey } from "./catalogue";

// D499. Level = action, area = subject, a picked client list = a clientId condition. Rules are
// built ONLY from catalogue keys and database ids (never from a request), which is what keeps
// CASL's 2026 prototype-pollution advisories out of reach.

export type ClientScope = "all" | ReadonlySet<string>;
type Abilities = [Level, Area | ForcedSubject<Area>];
export type AppAbility = MongoAbility<Abilities>;
export type AppRule = { action: Level; subject: Area; conditions?: { clientId: { $in: string[] } } };

export function buildRules(permissions: ReadonlySet<PermissionKey>, scope: ClientScope): AppRule[] {
  const ids = scope === "all" ? null : [...scope].sort();
  return [...permissions].sort().map((key) => {
    const { area, level } = splitKey(key);
    return ids && isClientScopedKey(key)
      ? { action: level, subject: area, conditions: { clientId: { $in: ids } } }
      : { action: level, subject: area };
  });
}

export function buildAbility(rules: AppRule[]): AppAbility {
  return createMongoAbility<Abilities>(rules);
}

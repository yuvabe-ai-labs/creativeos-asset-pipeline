import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalogue";
import { computeEffective } from "./effective";
import { buildAbility, buildRules, type AppAbility, type ClientScope } from "./ability";

/** What one person may do in the agency they are acting in. Built once per request. */
export type Access = {
  presetKey: string;
  isOwner: boolean;
  permissions: ReadonlySet<PermissionKey>;
  clientScope: ClientScope;
  ability: AppAbility;
};

/** One row of get_membership_access() (migration 0062). Arrays come back null when empty in some drivers. */
export type MembershipAccessRow = {
  org_id: string;
  preset_key: string;
  is_owner: boolean;
  all_clients: boolean;
  preset_keys: string[] | null;
  granted: string[] | null;
  revoked: string[] | null;
  client_ids: string[] | null;
};

function makeAccess(presetKey: string, isOwner: boolean, permissions: ReadonlySet<PermissionKey>, clientScope: ClientScope): Access {
  return { presetKey, isOwner, permissions, clientScope, ability: buildAbility(buildRules(permissions, clientScope)) };
}

export function accessFromRow(row: MembershipAccessRow): Access {
  const permissions = computeEffective({
    isOwner: row.is_owner,
    presetKeys: row.preset_keys ?? [],
    granted: row.granted ?? [],
    revoked: row.revoked ?? [],
  });
  // An owner always sees every client, whatever all_clients says.
  const scope: ClientScope = row.is_owner || row.all_clients ? "all" : new Set(row.client_ids ?? []);
  return makeAccess(row.preset_key, row.is_owner, permissions, scope);
}

/** Everything, every client. Used for a super admin impersonating an agency (D81). */
export function ownerAccess(): Access {
  return makeAccess("owner", true, new Set(ALL_PERMISSION_KEYS), "all");
}

export { makeAccess as _makeAccessForTests };

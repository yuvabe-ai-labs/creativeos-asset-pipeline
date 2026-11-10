import { ALL_PERMISSION_KEYS, type PermissionKey } from "./catalogue";
import { _makeAccessForTests, type Access, type MembershipAccessRow } from "./access";

export function testOwnerAccess(): Access {
  return _makeAccessForTests("owner", true, new Set(ALL_PERMISSION_KEYS), "all");
}

/** Exactly these keys (no view-implication), all clients unless clientIds is given. */
export function testAccess(opts: { keys: readonly PermissionKey[]; clientIds?: readonly string[]; presetKey?: string }): Access {
  return _makeAccessForTests(
    opts.presetKey ?? "designer",
    false,
    new Set(opts.keys),
    opts.clientIds ? new Set(opts.clientIds) : "all",
  );
}

export function testMembershipRow(overrides: Partial<MembershipAccessRow> = {}): MembershipAccessRow {
  return {
    org_id: "org-1",
    preset_key: "owner",
    is_owner: true,
    all_clients: true,
    preset_keys: [],
    granted: [],
    revoked: [],
    client_ids: [],
    ...overrides,
  };
}

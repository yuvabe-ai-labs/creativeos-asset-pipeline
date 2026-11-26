// src/lib/permissions/test-fixtures.ts
import { accessFromRows, type Access, type MembershipAccessRow, type Permission } from "./model";

/** Everything, in whichever agency is acted in. For tests about something other than permissions
 *  (vitest.setup.ts falls back to it when a mocked caller has no access). */
export function testAllowAllAccess(): Access {
  return accessFromRows("test-user", true, []);
}

/** The owner of `orgId`: everything on every client of that agency, nothing elsewhere. */
export function testOwnerAccess(orgId = "org-1"): Access {
  return accessFromRows("test-user", false, [testMembershipRow({ org_id: orgId, is_owner: true })]);
}

/** A member of `orgId` (access given unless said otherwise), on `clientIds` with `permissions`
 *  there. `clients` adds clients with their own set (a database edit, spec §8). */
export function testAccess(opts: {
  permissions: readonly Permission[];
  clientIds: readonly string[];
  clients?: Readonly<Record<string, readonly Permission[]>>;
  orgId?: string;
  accessGiven?: boolean;
}): Access {
  const clients = [
    ...opts.clientIds.map((id) => ({ client_id: id, permissions: [...opts.permissions] })),
    ...Object.entries(opts.clients ?? {}).map(([id, set]) => ({ client_id: id, permissions: [...set] })),
  ];
  return accessFromRows("test-user", false, [
    testMembershipRow({
      org_id: opts.orgId ?? "org-1",
      is_owner: false,
      access_given_at: opts.accessGiven === false ? null : "2026-11-13T09:00:00.000Z",
      permissions: [...opts.permissions],
      clients,
    }),
  ]);
}

export function testMembershipRow(overrides: Partial<MembershipAccessRow> = {}): MembershipAccessRow {
  return {
    org_id: "org-1",
    org_name: "Yuvabe Studios",
    is_owner: true,
    access_given_at: "2026-11-13T09:00:00.000Z",
    permissions: [],
    clients: [],
    ...overrides,
  };
}

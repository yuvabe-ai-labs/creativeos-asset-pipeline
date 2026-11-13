// src/lib/permissions/model.ts
// D500, D507: six permissions. The owner sets a person's agency-level set on the Team page; each
// client the person is on stores the effective copy (migration 0062, membership_clients). No
// server-only imports: the browser builds the same Access from /api/me and runs the same check()
// (D504), so the two cannot disagree.

export const PERMISSIONS = ["view", "edit", "generate", "approve", "share", "delete"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Only the owner (and the super admin): inviting, adding and removing people on a client is manage_team. */
export const OWNER_ACTIONS = ["manage_team", "manage_clients", "view_credits"] as const;
export type OwnerAction = (typeof OWNER_ACTIONS)[number];

export type Action = Permission | OwnerAction;
export const ACTIONS: readonly Action[] = [...PERMISSIONS, ...OWNER_ACTIONS];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);
const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_SET.has(value);
}

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTION_SET.has(value);
}

/** Values that are not one of the six (from the database or a request) are dropped, never trusted. */
export function toPermissionSet(values: readonly unknown[] | null | undefined): ReadonlySet<Permission> {
  return new Set((values ?? []).filter(isPermission));
}

/** In the fixed order of PERMISSIONS: what is stored, sent and shown as chips. */
export function orderedPermissions(values: Iterable<Permission>): Permission[] {
  const held = new Set(values);
  return PERMISSIONS.filter((p) => held.has(p));
}

export type OrgAccess = {
  orgId: string;
  orgName: string;
  isOwner: boolean;
  /** False while a person has signed up and waits for the owner (access_given_at null). */
  accessGiven: boolean;
  /** The agency-level set: what the owner edits on the Team page. */
  permissions: ReadonlySet<Permission>;
  /** Each client the person is on, with the effective set there. The owner has none. */
  clients: ReadonlyMap<string, ReadonlySet<Permission>>;
  /** What the person holds on at least one client they can view: "anywhere" in one lookup. */
  anyClient: ReadonlySet<Permission>;
};

export type Access = {
  userId: string;
  isSuperAdmin: boolean;
  /** One entry in this version (one agency per person, D508); keyed so several can follow. */
  orgs: ReadonlyMap<string, OrgAccess>;
};

export type OrgAccessInput = {
  orgId: string;
  orgName: string;
  isOwner: boolean;
  accessGiven: boolean;
  permissions: readonly unknown[] | null;
  clients: readonly { clientId: string; permissions: readonly unknown[] | null }[] | null;
};

export function buildOrgAccess(input: OrgAccessInput): OrgAccess {
  const clients = new Map<string, ReadonlySet<Permission>>();
  const anyClient = new Set<Permission>();
  for (const c of input.clients ?? []) {
    const set = toPermissionSet(c.permissions);
    clients.set(c.clientId, set);
    if (input.accessGiven && set.has("view")) for (const p of set) anyClient.add(p);
  }
  return {
    orgId: input.orgId,
    orgName: input.orgName,
    isOwner: input.isOwner,
    accessGiven: input.accessGiven,
    permissions: toPermissionSet(input.permissions),
    clients,
    anyClient,
  };
}

/** One row of get_membership_access() (migration 0062). */
export type MembershipAccessRow = {
  org_id: string;
  org_name: string;
  is_owner: boolean;
  access_given_at: string | null;
  permissions: string[] | null;
  clients: { client_id: string; permissions: string[] | null }[] | null;
};

export function accessFromRows(userId: string, isSuperAdmin: boolean, rows: readonly MembershipAccessRow[]): Access {
  return {
    userId,
    isSuperAdmin,
    orgs: new Map(
      rows.map((r) => [
        r.org_id,
        buildOrgAccess({
          orgId: r.org_id,
          orgName: r.org_name,
          isOwner: r.is_owner,
          accessGiven: r.access_given_at !== null,
          permissions: r.permissions,
          clients: (r.clients ?? []).map((c) => ({ clientId: c.client_id, permissions: c.permissions })),
        }),
      ]),
    ),
  };
}

/** A super admin viewing as an agency (D81) acts as its owner there. */
export function impersonatedAccess(userId: string, orgId: string): Access {
  return {
    userId,
    isSuperAdmin: true,
    orgs: new Map([
      [orgId, buildOrgAccess({ orgId, orgName: "", isOwner: true, accessGiven: true, permissions: PERMISSIONS, clients: [] })],
    ]),
  };
}

/** Nothing known yet (the browser before /api/me answers): every check fails closed. */
export const NO_ACCESS: Access = { userId: "", isSuperAdmin: false, orgs: new Map() };

/** The six answers for one client: what the canvas works out once and its nodes read. */
export type ClientPermissions = Readonly<Record<Permission, boolean>>;

export const NO_CLIENT_PERMISSIONS: ClientPermissions = {
  view: false, edit: false, generate: false, approve: false, share: false, delete: false,
};

export const ALL_CLIENT_PERMISSIONS: ClientPermissions = {
  view: true, edit: true, generate: true, approve: true, share: true, delete: true,
};

// src/lib/permissions/model.ts
// D538, D545: five permissions. Being on a client (having its membership_clients row, once access
// is given) is what lets a person see it; an empty set there means "look only". `view` and `edit`
// are actions, not permissions: `view` needs only the row, `edit` needs Generate. The owner sets a
// person's agency-level set on the Team page; each client the person is on stores the effective
// copy (migration 0062). No server-only imports: the browser builds the same Access from /api/me
// and runs the same check() (D542), so the two cannot disagree.

export const PERMISSIONS = ["generate", "approve", "share", "delete", "invite"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** What routes and screens ask for that is not a permission: seeing a client and changing work. */
export const CLIENT_ACTIONS = ["view", "edit"] as const;
export type ClientAction = (typeof CLIENT_ACTIONS)[number];

/** Only the owner (and the super admin): removing people, giving access, editing permissions,
 *  resending and cancelling invites are manage_team. Inviting is the `invite` permission. */
export const OWNER_ACTIONS = ["manage_team", "manage_clients", "view_credits"] as const;
export type OwnerAction = (typeof OWNER_ACTIONS)[number];

export type Action = Permission | ClientAction | OwnerAction;
export const ACTIONS: readonly Action[] = [...PERMISSIONS, ...CLIENT_ACTIONS, ...OWNER_ACTIONS];

/** The permission a client action needs: none for `view` (the row is enough), Generate for `edit`,
 *  and a permission needs itself. */
export function permissionFor(action: Permission | ClientAction): Permission | null {
  if (action === "view") return null;
  if (action === "edit") return "generate";
  return action;
}

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);
const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_SET.has(value);
}

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTION_SET.has(value);
}

/** Values that are not one of the five (from the database or a request) are dropped, never trusted. */
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
  /** Each client the person is on, with the effective set there (empty = look only). The owner
   *  has none. `clients.size > 0` is "on at least one client". */
  clients: ReadonlyMap<string, ReadonlySet<Permission>>;
  /** What the person holds on at least one client they are on, once access is given: "anywhere"
   *  in one lookup. */
  anyClient: ReadonlySet<Permission>;
};

export type Access = {
  userId: string;
  isSuperAdmin: boolean;
  /** One entry in this version (one agency per person, D546); keyed so several can follow. */
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
    if (input.accessGiven) for (const p of set) anyClient.add(p);
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

/** The answers for one client (view, edit and the five permissions): what the canvas works out
 *  once and its nodes read. */
export type ClientPermissions = Readonly<Record<Permission | ClientAction, boolean>>;

export const NO_CLIENT_PERMISSIONS: ClientPermissions = {
  view: false, edit: false, generate: false, approve: false, share: false, delete: false, invite: false,
};

export const ALL_CLIENT_PERMISSIONS: ClientPermissions = {
  view: true, edit: true, generate: true, approve: true, share: true, delete: true, invite: true,
};

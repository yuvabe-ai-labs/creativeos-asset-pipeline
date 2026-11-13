# Permissions, plan 3 of 4: five permissions in the core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Tasks 1 to 10 were built with six permissions; Task 11 moves the code to five.

**Goal:** The server and the browser decide with five permissions (`generate, approve, share, delete, invite`) stored on the person and copied onto each client they are on, one owner per agency, with CASL, the 59-key catalogue and presets gone, and people waiting for access shown the onboarding screen. Being on a client (its `membership_clients` row, with access given) is what lets a person see it; a row with no permissions means they can look only. `view` and `edit` are actions, not permissions: `view` needs only the client row, `edit` needs Generate.

**Architecture:**
- **Data:** migration 0062 is rewritten (never applied anywhere): `org_memberships` gains `is_owner`, `permissions text[]`, `access_given_at`, `invited_by`; `membership_clients` holds each client row with its own `permissions`; a cascade trigger applies agency-level changes to every row; a deferred trigger keeps an owner; `org_invitations` carries `client_id` / `as_owner`. One RPC, `get_membership_access`, returns everything a request needs.
- **Checker:** `src/lib/permissions/model.ts` builds one `Access` (Maps and Sets) from the RPC rows; `check(access, action, { orgId, clientId })` in `src/lib/permissions/check.ts` is the only function that decides, on the server and in the browser. It has no server-only imports.
- **Enforcement:** the chokepoints (`withClient`, `withCanvas`, `withNode`, `withMoodboard`, `withAccess`, `withAction`, `loadClientPage`, `loadCanvasPage`) keep their required `need`, now one of ten plain actions (the five permissions, `view`, `edit`, and the three owner-only actions). The coverage tests keep failing any route or action without one.
- **Browser:** `/api/me` sends the person's agency, owner flag, whether access is given, their permissions and each client's permissions. `AccessProvider` builds the same `Access` once per payload and puts it in context; `useCan(action, clientId?)` calls `check`. The canvas works out its permissions for its client once and nodes read them from context.

**Tech Stack:**
- Next.js 16.2.6 App Router (Server Components, route handlers, server actions)
- React 19.2.4, TanStack Query 5.104
- Supabase Postgres through the service-role client (`createServerSupabase`)
- shadcn on Base UI (`Button`, `Tooltip`), React Flow (`@xyflow/react`)
- Vitest in the `node` environment; components render with `renderToStaticMarkup`

**Spec:** [docs/superpowers/specs/2026-11-12-agency-permissions-design.md](../specs/2026-11-12-agency-permissions-design.md) (revised 13 Nov), ADRs D500–D509 in [the roadmap §7](../specs/2026-05-30-creativeos-staging-roadmap.md). Plans 1 and 2: [core](2026-11-11-permission-access-core.md), [browser](2026-11-11-permission-access-browser.md). Plan 4 (people, invites, admin): [2026-11-13-permissions-people-and-invites.md](2026-11-13-permissions-people-and-invites.md).

## Global Constraints

- **Worktree:** work only in `C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm` on `feat/permission-access-browser`. Never touch `C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-asset-pipeline`. Never use bare `git stash`.
- **Commits:** one per task, with the exact message given. No Claude/AI attribution of any kind: no `Co-Authored-By` line, no "Generated with" line. Check with `git log -1 --format=%B`; if a trailer slipped in, `git commit --amend -m "<exact message>"`.
- **Never** run SQL against any database, apply a migration, or push.
- **Packages:** `node_modules` is a junction into the other checkout. Never run `npm install <pkg>` or `npm uninstall`. Removing a dependency (Task 9) edits `package.json` and runs `npm install --package-lock-only --ignore-scripts`, which rewrites only `package-lock.json`.
- **SQL and anything containing `$`** is written with the Write/Edit tools, never a shell heredoc or `echo`. Functions use `$$` quoting.
- **The five permissions, exactly and in this order:** `generate, approve, share, delete, invite`. There is no View or Edit permission: being on a client (its row, with access given) lets a person see it, and a row with no permissions means they can look only. Actions add `view` and `edit` (not permissions: `view` needs only the client row, `edit` needs `generate`) and `manage_team, manage_clients, view_credits` (owner only). Inviting to a client and adding people already in the agency to it need `invite` on that client; removing people, giving access, editing permissions, resend and cancel stay `manage_team`.
- **Check order (spec §4.2):**
  1. Super admin: allow.
  2. No membership in `orgId`: `not_found`.
  3. Owner of `orgId`: allow.
  4. A named client (`clientId` set) with access not given or no row for it: `not_found`. This comes before step 5 so that refusing an owner-only action never confirms that a client the person is not on exists.
  5. `manage_team`, `manage_clients`, `view_credits`: `forbidden`.
  6. No client named, and access not given or no client rows: `not_found`.
  7. `view`: allow. Otherwise the permission the action needs (`edit` needs `generate`; every other action needs itself) is in the client row (or, with no client named, in any of the person's rows): allow; otherwise `forbidden`.
- **Refusals:** `not_found` → 404 (routes), `notFound()` (pages); `forbidden` → 403 with exactly `You don't have access to this. Ask your agency owner.` A refusal never confirms that another agency's row, or a client the person is not on, exists.
- **Browser rules (spec §5):** missing Generate shows the button disabled with exactly `Generating is turned off for you. Ask your agency owner.`; without Generate the controls for changing work by hand are hidden; missing Approve, Share, Delete or Invite hides the control; without Generate the canvas is read-only through `useCanvasEditable()` (`can("edit")`).
- **Onboarding copy, exactly:** `You're being onboarded. Hang in there.` / `{Agency} is setting up your access. Your clients will appear here once it's ready.`
- **Performance (AGENTS.md):** one `get_membership_access` per request; every check is a Map or Set lookup; nothing per node, card or row makes a call or opens a channel; the canvas computes its permissions once; independent reads in one `Promise.all`.
- **Data fetching:** `/api/me` stays on the three layers (`src/services/me.service.ts` → `src/hooks/queries/me.ts` with `meKeys` → consumers). One owner: `useIdentity()` selects from `useMe()`.
- **Controls:** shadcn primitives from `src/components/ui/*` only. **Copy:** plain words; no vendor names, no raw errors, no em-dash phrasing.
- **Tests:** run per directory from the uppercase path: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run <dir or file>` (a lowercase `c:/` cwd fails every suite). Typecheck `npx tsc --noEmit`; lint `npx eslint <changed files>`. Known pre-existing, not yours: tsc `src/app/api/nodes/[id]/image-generate/route.test.ts(56,12) TS2304`; vitest "refuses a deprecated model" in `src/app/api/nodes/[id]/composite-generate` and `src/app/api/nodes/[id]/image-generate`. A timeout in an API route test is re-run alone before it counts.
- **Old tests:** a test that encodes the old model is rewritten in the task that changes the behaviour, or deleted only when the module it tests is deleted, and the step says so.

## Decisions this plan makes

- **`clientId: null` means "on at least one client the person is on".** Routes not rooted at one client (`withAccess`: the voice library, the moodboard index, the review inbox and counts) and nav items use it. `OrgAccess.anyClient` is precomputed when the access is built, so this is one Set lookup, not a scan.
- **One bridge commit each way, then gone.** Task 5 switches the server to the new `Access` while routes still name the old keys: `src/lib/permissions/legacy-need.ts` maps an old key to its action (spec §4.3), and Task 6 renames every `need` and deletes the file. Task 5 also turns the new access back into CASL rules for the browser (`packAccessRules`), deleted in Task 7. Each task stays reviewable on its own and every commit compiles.
- **Page denials are all the 404 page** (`notFound()`), including another agency's client, which used to redirect home (spec §4.4). `loadCanvasPage` keeps answering `null` for "not found" so `/eval` keeps its own "Canvas not found".
- **A new client row always starts as a copy of the person's agency set**, set by the `before insert` trigger that also refuses owner rows, so no insert path can forget it (spec §2.3).
- **Downloads come with being on the client** (D507): the download gates from plan 2 Task 10 (`5b19e86a`, committed, never reviewed) are reverted in Task 3, and its review is this plan's Task 3.
- **Review counts are of the clients where the person has Approve; the inbox lists the clients they are on**, with pending work only when they hold Approve somewhere. The per-type count path (`org_review_counts_for_types`) is no longer called; the SQL function stays (spec §3).
- **`useCanvasEditable()` stays the lock's answer**, and the lock is only requested by someone who can edit (plan 2 Task 7), so it is `can("edit")` (Generate) and the edit lock held. Nothing about the D33 lock changes.
- **Plan 2 Task 11** (profile shows the role; `orgRole` and `Identity.role` go) is folded into Tasks 5 and 7. **Task 12** (a lint rule against comparing preset names) is dropped: there are no presets left to compare. **Task 13's** verification is Task 12 here.

## File structure

| File | Role |
|---|---|
| `src/lib/permissions/model.ts` (new) | `Permission`, `Action`, `OrgAccess`, `Access`, builders from the RPC row and from `/api/me`, client permission constants |
| `src/lib/permissions/check.ts` | `check`, `clientIdsWith`, `isWaiting`, `clientPermissionsFor`, refusal copy |
| `src/lib/permissions/test-fixtures.ts` | `testAllowAllAccess`, `testOwnerAccess`, `testAccess`, `testMembershipRow` |
| `src/lib/permissions/onboarding.ts` (new) | `sendWaitingToOnboarding` for the home page |
| `src/lib/me/access.ts` (new) | `accessFromMe`: the browser's `Access` from the payload |
| `src/components/permissions/access-context.tsx` (new) | the one `Access` in context |
| `src/components/permissions/client-permissions.tsx` (new) | the canvas's permission booleans, computed once |
| `src/components/permissions/test-access-provider.tsx` (new) | component tests' provider |
| `src/app/onboarding/page.tsx` (new), `src/components/onboarding/onboarding-notice.tsx` (new) | the onboarding screen |
| `supabase/migrations/0062_permission_based_access.sql` | rewritten |
| Deleted | `access.ts`, `ability.ts`, `browser.ts`, `catalogue.ts`, `effective.ts`, `presets.ts`, `node-area.ts`, `downloads.ts` (Task 3), `seed-matches-catalogue.test.ts`, `src/lib/db/presets.ts`, `test-ability-provider.tsx`, `client-scope.ts`, `use-can-approve-node.ts`, `use-client-sections.ts`, `@casl/ability`, `@casl/react` |

---

### Task 1: Six permissions, one `Access` and one `check()`

**Files:**
- Create: `src/lib/permissions/model.ts`, `src/lib/permissions/model.test.ts`
- Modify: `src/lib/permissions/check.ts` (add the new checker beside the old functions, which Task 5 removes)
- Test: `src/lib/permissions/check.test.ts` (rewritten: its old tests cover `can`/`canAnywhere`/`denialFor`/`scopeIds`, which Task 5 deletes; until then the chokepoint tests in `route-helpers.test.ts` keep covering them)

**Interfaces:**
- Consumes: nothing.
- Produces (in `model.ts`): `PERMISSIONS`, `type Permission`, `OWNER_ACTIONS`, `type OwnerAction`, `type Action`, `ACTIONS`, `isPermission(v: unknown): v is Permission`, `isAction(v: unknown): v is Action`, `toPermissionSet(values: readonly unknown[] | null | undefined): ReadonlySet<Permission>`, `orderedPermissions(values: Iterable<Permission>): Permission[]`, `type OrgAccess`, `type Access`, `type OrgAccessInput`, `buildOrgAccess(input: OrgAccessInput): OrgAccess`, `type MembershipAccessRow`, `accessFromRows(userId: string, isSuperAdmin: boolean, rows: readonly MembershipAccessRow[]): Access`, `impersonatedAccess(userId: string, orgId: string): Access`, `NO_ACCESS: Access`.
- Produces (in `check.ts`): `type Decision = "allow" | "not_found" | "forbidden"`, `type CheckTarget = { orgId: string; clientId: string | null }`, `check(access, action, target): Decision`, `clientIdsWith(access, orgId, action: Permission): string[] | null`, `isWaiting(access, orgId): boolean`. `FORBIDDEN_MESSAGE` and `ForbiddenError` already exist.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/permissions/model.test.ts
import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  PERMISSIONS,
  accessFromRows,
  impersonatedAccess,
  isAction,
  isPermission,
  orderedPermissions,
  toPermissionSet,
  type MembershipAccessRow,
} from "./model";

const row = (over: Partial<MembershipAccessRow> = {}): MembershipAccessRow => ({
  org_id: "org-1",
  org_name: "Acme Agency",
  is_owner: false,
  access_given_at: "2026-11-13T09:00:00.000Z",
  permissions: [],
  clients: [],
  ...over,
});

describe("the six permissions", () => {
  it("are view, edit, generate, approve, share, delete, in that order", () => {
    expect(PERMISSIONS).toEqual(["view", "edit", "generate", "approve", "share", "delete"]);
  });

  it("plus three owner-only actions make the nine actions", () => {
    expect(ACTIONS).toEqual([...PERMISSIONS, "manage_team", "manage_clients", "view_credits"]);
    expect(isAction("manage_team")).toBe(true);
    expect(isPermission("manage_team")).toBe(false);
    expect(isAction("scripts.view")).toBe(false);
  });

  it("drops anything that is not one of the six", () => {
    expect([...toPermissionSet(["view", "scripts.approve", 7, null, "share"])]).toEqual(["view", "share"]);
    expect(toPermissionSet(null).size).toBe(0);
  });

  it("orders a set the canonical way", () => {
    expect(orderedPermissions(new Set(["delete", "view", "approve"] as const))).toEqual(["view", "approve", "delete"]);
  });
});

describe("accessFromRows", () => {
  it("builds one OrgAccess per row, keyed by agency", () => {
    const access = accessFromRows("u1", false, [
      row({ permissions: ["view", "edit"], clients: [{ client_id: "c1", permissions: ["view", "edit"] }] }),
    ]);
    const org = access.orgs.get("org-1")!;
    expect(access.userId).toBe("u1");
    expect(access.isSuperAdmin).toBe(false);
    expect(org.orgName).toBe("Acme Agency");
    expect(org.accessGiven).toBe(true);
    expect([...org.permissions]).toEqual(["view", "edit"]);
    expect([...org.clients.get("c1")!]).toEqual(["view", "edit"]);
  });

  it("counts only viewable rows of someone with access given towards anyClient", () => {
    const given = accessFromRows("u1", false, [
      row({ clients: [{ client_id: "c1", permissions: ["view", "approve"] }, { client_id: "c2", permissions: ["delete"] }] }),
    ]).orgs.get("org-1")!;
    expect([...given.anyClient].sort()).toEqual(["approve", "view"]);
    const waiting = accessFromRows("u1", false, [
      row({ access_given_at: null, clients: [{ client_id: "c1", permissions: ["view"] }] }),
    ]).orgs.get("org-1")!;
    expect(waiting.accessGiven).toBe(false);
    expect(waiting.anyClient.size).toBe(0);
  });

  it("reads a null client list as none", () => {
    expect(accessFromRows("u1", false, [row({ clients: null })]).orgs.get("org-1")!.clients.size).toBe(0);
  });
});

describe("impersonatedAccess", () => {
  it("is the target agency's owner, as a super admin", () => {
    const access = impersonatedAccess("op", "org-9");
    expect(access.isSuperAdmin).toBe(true);
    expect(access.orgs.get("org-9")?.isOwner).toBe(true);
    expect(access.orgs.size).toBe(1);
  });
});
```

Replace the whole of `src/lib/permissions/check.test.ts` with:

```ts
// src/lib/permissions/check.test.ts
import { describe, it, expect } from "vitest";
import { accessFromRows, impersonatedAccess, PERMISSIONS, type MembershipAccessRow, type Permission } from "./model";
import { check, clientIdsWith, isWaiting, FORBIDDEN_MESSAGE } from "./check";

function row(over: Partial<MembershipAccessRow> = {}): MembershipAccessRow {
  return {
    org_id: "org-1",
    org_name: "Acme Agency",
    is_owner: false,
    access_given_at: "2026-11-13T09:00:00.000Z",
    permissions: [],
    clients: [],
    ...over,
  };
}
function member(clients: Record<string, Permission[]>, over: Partial<MembershipAccessRow> = {}) {
  return accessFromRows("u1", false, [
    row({ clients: Object.entries(clients).map(([client_id, permissions]) => ({ client_id, permissions })), ...over }),
  ]);
}
const owner = () => accessFromRows("u1", false, [row({ is_owner: true })]);
const on = (clientId: string | null, orgId = "org-1") => ({ orgId, clientId });
const ALL: Permission[] = [...PERMISSIONS];

describe("check, in the order of spec §4.2", () => {
  it("1. lets a super admin do anything, in any agency", () => {
    const admin = accessFromRows("op", true, []);
    expect(check(admin, "manage_team", on(null, "org-9"))).toBe("allow");
    expect(check(admin, "delete", on("c1", "org-9"))).toBe("allow");
  });

  it("2. answers not found in an agency the person is not in", () => {
    expect(check(member({ c1: ALL }), "view", on("c1", "org-2"))).toBe("not_found");
    expect(check(member({ c1: ALL }), "manage_team", on(null, "org-2"))).toBe("not_found");
  });

  it("3. lets the owner do everything on every client, including one added later", () => {
    for (const action of [...ALL, "manage_team", "manage_clients", "view_credits"] as const) {
      expect(check(owner(), action, on("client-added-later"))).toBe("allow");
    }
    expect(check(owner(), "manage_team", on(null))).toBe("allow");
  });

  it("4. forbids the owner-only actions to a member holding all six", () => {
    const m = member({ c1: ALL });
    expect(check(m, "manage_team", on("c1"))).toBe("forbidden");
    expect(check(m, "manage_clients", on(null))).toBe("forbidden");
    expect(check(m, "view_credits", on(null))).toBe("forbidden");
  });

  it("5. answers not found before access is given, off the client, or without View on it", () => {
    expect(check(member({ c1: ALL }, { access_given_at: null }), "view", on("c1"))).toBe("not_found");
    expect(check(member({ c1: ALL }), "view", on("c2"))).toBe("not_found");
    expect(check(member({ c1: ["edit", "generate"] }), "edit", on("c1"))).toBe("not_found");
  });

  it("6. allows what the client row holds and forbids the rest", () => {
    const m = member({ c1: ["view", "edit"] });
    expect(check(m, "view", on("c1"))).toBe("allow");
    expect(check(m, "edit", on("c1"))).toBe("allow");
    expect(check(m, "generate", on("c1"))).toBe("forbidden");
    expect(check(m, "delete", on("c1"))).toBe("forbidden");
  });

  it("lets a person with View only see the client and do nothing else", () => {
    const m = member({ c1: ["view"] });
    expect(check(m, "view", on("c1"))).toBe("allow");
    for (const action of ["edit", "generate", "approve", "share", "delete"] as const) {
      expect(check(m, action, on("c1"))).toBe("forbidden");
    }
  });

  it("decides each client by its own row (a database edit, spec §8)", () => {
    const m = member({ c1: ["view", "edit", "generate"], c2: ["view"] }, { permissions: ["view", "edit", "generate"] });
    expect(check(m, "generate", on("c1"))).toBe("allow");
    expect(check(m, "generate", on("c2"))).toBe("forbidden");
  });

  it("without a client, asks whether the person holds the action on a client they can view", () => {
    const m = member({ c1: ["view", "approve"], c2: ["approve"] });
    expect(check(m, "approve", on(null))).toBe("allow");
    expect(check(m, "delete", on(null))).toBe("forbidden");
    expect(check(member({ c2: ["approve"] }), "approve", on(null))).toBe("not_found");
    expect(check(member({}), "view", on(null))).toBe("not_found");
  });

  it("ignores stored values that are not one of the six", () => {
    expect(check(member({ c1: ["view", "scripts.approve" as Permission] }), "approve", on("c1"))).toBe("forbidden");
  });

  it("treats a super admin viewing as an agency as its owner", () => {
    expect(check(impersonatedAccess("op", "org-9"), "manage_team", on(null, "org-9"))).toBe("allow");
  });
});

describe("clientIdsWith", () => {
  it("is null (every client of the agency) for the owner and a super admin", () => {
    expect(clientIdsWith(owner(), "org-1", "view")).toBeNull();
    expect(clientIdsWith(accessFromRows("op", true, []), "org-9", "approve")).toBeNull();
  });

  it("lists, sorted, the clients the person can view that hold the action", () => {
    const m = member({ c2: ["view", "approve"], c1: ["view", "approve"], c3: ["view"], c4: ["approve"] });
    expect(clientIdsWith(m, "org-1", "approve")).toEqual(["c1", "c2"]);
    expect(clientIdsWith(m, "org-1", "view")).toEqual(["c1", "c2", "c3"]);
  });

  it("is empty before access is given and in another agency", () => {
    expect(clientIdsWith(member({ c1: ALL }, { access_given_at: null }), "org-1", "view")).toEqual([]);
    expect(clientIdsWith(member({ c1: ALL }), "org-2", "view")).toEqual([]);
  });
});

describe("isWaiting (spec §2.4)", () => {
  it("is true for someone signed up and waiting, and for someone on no client they can view", () => {
    expect(isWaiting(member({ c1: [] }, { access_given_at: null }), "org-1")).toBe(true);
    expect(isWaiting(member({}), "org-1")).toBe(true);
    expect(isWaiting(member({ c1: ["edit"] }), "org-1")).toBe(true);
  });

  it("is false for a member who can view a client, the owner, and a super admin", () => {
    expect(isWaiting(member({ c1: ["view"] }), "org-1")).toBe(false);
    expect(isWaiting(owner(), "org-1")).toBe(false);
    expect(isWaiting(accessFromRows("op", true, []), "org-1")).toBe(false);
  });
});

describe("refusal copy", () => {
  it("is the agreed sentence", () => {
    expect(FORBIDDEN_MESSAGE).toBe("You don't have access to this. Ask your agency owner.");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions/model.test.ts src/lib/permissions/check.test.ts`
Expected: FAIL, `Failed to resolve import "./model"`.

- [ ] **Step 3: Write `model.ts`**

```ts
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
```

- [ ] **Step 4: Add the checker to `check.ts`**

At the top of `src/lib/permissions/check.ts`, after the existing imports, add:

```ts
import { isPermission, type Access as SixAccess, type Action, type Permission } from "./model";
```

(`SixAccess` is a temporary alias: the old `Access` from `./access` is still imported here until Task 5 deletes it and the old functions.)

At the end of the file, add:

```ts
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
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions`
Expected: PASS (`model.test.ts`, `check.test.ts` and every other file in the directory).

Run: `npx tsc --noEmit` and `npx eslint src/lib/permissions/model.ts src/lib/permissions/model.test.ts src/lib/permissions/check.ts src/lib/permissions/check.test.ts`
Expected: only the known tsc line; eslint clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/permissions/model.ts src/lib/permissions/model.test.ts src/lib/permissions/check.ts src/lib/permissions/check.test.ts
git commit -m "feat(permissions): six permissions, one Access and one check() (D504, D507)"
git log -1 --format=%B
```

---

### Task 2: Migration 0062 rewritten for the six-permission schema

**Files:**
- Modify (rewrite): `supabase/migrations/0062_permission_based_access.sql`
- Modify: `docs/auth-production-migration.md` (the "Migration 0062" section, spec §9: same change as the migration)
- Delete: `src/lib/permissions/seed-matches-catalogue.test.ts` (it checks the preset seed this rewrite removes; replaced by the test below)
- Test: `src/lib/permissions/migration-0062.test.ts`

**Interfaces:**
- Consumes: `PERMISSIONS` (Task 1).
- Produces (SQL, all `security definer`, `search_path = public`, service role only): `get_membership_access(p_user_id uuid)` returning `org_id uuid, org_name text, is_owner boolean, access_given_at timestamptz, permissions text[], clients jsonb` (`[{ client_id, permissions }]`); `transfer_agency_owner(p_org_id uuid, p_new_owner uuid) returns void`; `create_agency_with_owner_invite(p_name text, p_slug text, p_owner_email text, p_token text, p_by uuid) returns uuid`; `accept_invitation(p_token text, p_user_id uuid, p_display_name text)` returning `org_id uuid, client_id uuid, as_owner boolean, invited_by uuid`; `list_agency_people(p_org_id uuid)` returning `user_id uuid, display_name text, email text, is_owner boolean, access_given_at timestamptz, permissions text[], joined_at timestamptz, invited_by_name text, invited_client_id uuid, invited_client_name text, client_ids uuid[]`; `find_user_by_email(p_email text)` returning `user_id uuid, org_id uuid`. Tables `membership_clients`, `org_invitations`; `impersonation_audit_log.event_type` gains `admin_action`. Plan 4 calls the invitation and people functions.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/permissions/migration-0062.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSIONS } from "./model";

// The migration was never applied anywhere, so it is rewritten rather than corrected (spec §3).
// SQL is only checked by hand on staging (spec §11); this pins what the code depends on.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0062_permission_based_access.sql"), "utf8");

describe("migration 0062", () => {
  it("allows exactly the six permissions, in the code's order, wherever permissions are stored", () => {
    const lists = [...SQL.matchAll(/permissions <@ array\[([^\]]+)\]::text\[\]/g)].map((m) =>
      m[1].split(",").map((s) => s.trim().replace(/'/g, "")),
    );
    expect(lists).toHaveLength(2);
    for (const list of lists) expect(list).toEqual([...PERMISSIONS]);
  });

  it("has no presets, per-person ticks or all-clients flag", () => {
    for (const gone of ["role_presets", "role_preset_permissions", "membership_permission_changes", "all_clients", "preset_id"]) {
      expect(SQL, gone).not.toContain(gone);
    }
  });

  it("keeps one owner per agency with a unique index, and one agency per person", () => {
    expect(SQL).toMatch(/create unique index if not exists org_memberships_one_owner\s+on org_memberships \(org_id\) where is_owner;/);
    expect(SQL).not.toMatch(/drop index[^;]*one_org_per_user/);
  });

  it("protects the owner at the end of the transaction", () => {
    expect(SQL).toMatch(/create constraint trigger org_memberships_keep_owner\s+after update or delete on org_memberships\s+deferrable initially deferred/);
    expect(SQL).toContain("The agency owner can''t be removed.");
  });

  it("ties every member invitation to a client and the owner's to none", () => {
    expect(SQL).toContain("check ((client_id is null) = as_owner)");
  });

  it("defines the functions the code calls, each for the service role only", () => {
    for (const fn of [
      "get_membership_access(uuid)",
      "transfer_agency_owner(uuid, uuid)",
      "create_agency_with_owner_invite(text, text, text, text, uuid)",
      "accept_invitation(text, uuid, text)",
      "list_agency_people(uuid)",
      "find_user_by_email(text)",
    ]) {
      expect(SQL, fn).toContain(`revoke all on function ${fn} from public, anon, authenticated;`);
      expect(SQL, fn).toContain(`grant execute on function ${fn} to service_role;`);
    }
  });

  it("sets search_path on every security definer function", () => {
    const definers = SQL.match(/security definer/g) ?? [];
    const pinned = SQL.match(/security definer set search_path = public/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(pinned.length).toBe(definers.length);
  });

  it("stores each invite link's token as issued, unique, with no hash", () => {
    expect(SQL).toMatch(/^\s+token\s+text not null,$/m);
    expect(SQL).toContain("create unique index if not exists org_invitations_token_key on org_invitations (token);");
    expect(SQL).not.toMatch(/token_hash|sha256/);
  });

  it("lets the audit log record changes made from Admin", () => {
    expect(SQL).toContain("'admin_action'");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions/migration-0062.test.ts`
Expected: FAIL (the current file still has `role_presets` and no `permissions <@` check).

- [ ] **Step 3: Rewrite the migration**

Replace the whole of `supabase/migrations/0062_permission_based_access.sql` with (Write tool):

```sql
-- D500–D509: six permissions on the person, copied onto each client they are on; one owner per
-- agency; invitations sent from inside a client. This file was never applied anywhere before
-- 13 Nov 2026, so it was rewritten in place (the 11 Nov version, with presets, is at the local
-- tag perm-granular-v1).
-- Apply to an environment's database and verify it BEFORE the code that reads it is deployed
-- there (merging deploys on this repo). The old code keeps working on top of it: it reads
-- org_role, which stays until a later migration drops it. The new code without it fails every
-- signed-in request, because get_membership_access() is missing.

-- ── 1. Memberships: owner flag, agency-level permissions, access given ────────
alter table org_memberships
  add column if not exists is_owner        boolean not null default false,
  add column if not exists permissions     text[]  not null default '{}',
  add column if not exists access_given_at timestamptz,
  add column if not exists invited_by      uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_memberships_permissions_known') then
    alter table org_memberships add constraint org_memberships_permissions_known
      check (permissions <@ array['view','edit','generate','approve','share','delete']::text[]);
  end if;
end
$$;

-- One owner per agency (D500). Several owners later = drop this index; no check assumes one.
create unique index if not exists org_memberships_one_owner
  on org_memberships (org_id) where is_owner;
create index if not exists org_memberships_invited_by_idx on org_memberships (invited_by);
-- org_memberships_one_org_per_user (0012) stays: one agency per person in this version (D508).

-- ── 2. A person's clients, each with the effective permissions there ──────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_id_org_unique') then
    alter table clients add constraint clients_id_org_unique unique (id, org_id);
  end if;
end
$$;

create table if not exists membership_clients (
  user_id     uuid not null,
  org_id      uuid not null,
  client_id   uuid not null,
  permissions text[] not null default '{}'
              constraint membership_clients_permissions_known
              check (permissions <@ array['view','edit','generate','approve','share','delete']::text[]),
  added_by    uuid references auth.users(id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (user_id, org_id, client_id),
  -- The composite keys stop a person being put on another agency's client.
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade,
  foreign key (client_id, org_id) references clients (id, org_id) on delete cascade
);
create index if not exists membership_clients_client_idx on membership_clients (client_id);
create index if not exists membership_clients_added_by_idx on membership_clients (added_by);

-- ── 3. Invitations: sent from inside a client; only the owner's has none ─────
create table if not exists org_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid,
  email       text not null,
  as_owner    boolean not null default false,
  -- The link's token as issued (32 random bytes, base64url), so Copy link always shows the same
  -- link. Server-only like the rest (RLS on, no policies); single use; 7 days.
  token       text not null,
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at  timestamptz,
  foreign key (client_id, org_id) references clients (id, org_id) on delete cascade,
  constraint org_invitations_client_unless_owner check ((client_id is null) = as_owner)
);
create unique index if not exists org_invitations_token_key on org_invitations (token);
-- One open invite per person per agency, and one open owner invite per agency.
create unique index if not exists org_invitations_one_open_per_email
  on org_invitations (org_id, lower(email)) where accepted_at is null and revoked_at is null;
create unique index if not exists org_invitations_one_open_owner
  on org_invitations (org_id) where as_owner and accepted_at is null and revoked_at is null;
-- org_id first: the agency's list and the daily limit (50 sent a day) both read by it.
create index if not exists org_invitations_org_created_idx on org_invitations (org_id, created_at);
create index if not exists org_invitations_client_idx on org_invitations (client_id);
create index if not exists org_invitations_invited_by_idx on org_invitations (invited_by);

-- Default-deny like 0017: only the service-role server path reads or writes these.
alter table membership_clients enable row level security;
alter table org_invitations enable row level security;

-- ── 4. Triggers ───────────────────────────────────────────────────────────────
-- Cascade (spec §3.3): an agency-level change reaches every one of the person's client rows as
-- what was added and what was removed, in one update. A row-level difference (spec §8)
-- survives every change except one to the same permission.
create or replace function cascade_membership_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  added   text[];
  removed text[];
begin
  added   := array(select unnest(new.permissions) except select unnest(old.permissions));
  removed := array(select unnest(old.permissions) except select unnest(new.permissions));
  if cardinality(added) = 0 and cardinality(removed) = 0 then
    return new;
  end if;
  update membership_clients mc
     set permissions = array(
           select kept.p
             from ((select unnest(mc.permissions) as p except select unnest(removed))
                   union
                   select unnest(added)) kept
            order by array_position(array['view','edit','generate','approve','share','delete']::text[], kept.p))
   where mc.user_id = new.user_id and mc.org_id = new.org_id;
  return new;
end;
$$;

drop trigger if exists org_memberships_cascade_permissions on org_memberships;
create trigger org_memberships_cascade_permissions
  after update of permissions on org_memberships
  for each row
  when (old.permissions is distinct from new.permissions)
  execute function cascade_membership_permissions();

-- Owner protection (spec §3.3), checked at the end of the transaction so transfer_agency_owner
-- can demote and promote in one go. An agency has no owner until its invited owner signs up; the
-- rule applies from then. An agency being deleted takes its memberships with it.
create or replace function enforce_agency_keeps_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not old.is_owner then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.is_owner then
    return null;
  end if;
  if not exists (select 1 from organizations where id = old.org_id) then
    return null;
  end if;
  if exists (select 1 from org_memberships where org_id = old.org_id and is_owner) then
    return null;
  end if;
  raise exception 'The agency owner can''t be removed.' using errcode = 'check_violation';
end;
$$;

drop trigger if exists org_memberships_keep_owner on org_memberships;
create constraint trigger org_memberships_keep_owner
  after update or delete on org_memberships
  deferrable initially deferred
  for each row execute function enforce_agency_keeps_owner();

-- 0012's org_memberships_last_owner (org_role based) stays until org_role is dropped. The code
-- that writes memberships keeps org_role in step: 'owner' for the owner, 'designer' for a member
-- who joins, and transfer_agency_owner swaps them.

-- A client row (spec §2.3): never for an owner (they have everything on every client already), and
-- it always starts as a copy of the person's agency-level set, whoever inserts it.
create or replace function prepare_membership_client()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m_is_owner    boolean;
  m_permissions text[];
begin
  select is_owner, permissions into m_is_owner, m_permissions
    from org_memberships where user_id = new.user_id and org_id = new.org_id;
  if not found then
    return new; -- the foreign key refuses it
  end if;
  if m_is_owner then
    raise exception 'The agency owner is on every client already.' using errcode = 'check_violation';
  end if;
  new.permissions := m_permissions;
  return new;
end;
$$;

drop trigger if exists membership_clients_prepare on membership_clients;
create trigger membership_clients_prepare
  before insert on membership_clients
  for each row execute function prepare_membership_client();

-- ── 5. One access read per request ────────────────────────────────────────────
drop function if exists get_membership_access(uuid);
create function get_membership_access(p_user_id uuid)
returns table (
  org_id uuid, org_name text, is_owner boolean, access_given_at timestamptz,
  permissions text[], clients jsonb
)
language sql stable security definer set search_path = public as $$
  select m.org_id, o.name, m.is_owner, m.access_given_at, m.permissions,
         coalesce((select jsonb_agg(jsonb_build_object('client_id', mc.client_id, 'permissions', mc.permissions))
                     from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id), '[]'::jsonb)
    from org_memberships m
    join organizations o on o.id = m.org_id
   where m.user_id = p_user_id;
$$;
revoke all on function get_membership_access(uuid) from public, anon, authenticated;
grant execute on function get_membership_access(uuid) to service_role;

-- ── 6. Owner, agency and invitation functions (spec §3.4, §6.3, §6.6) ─────────
-- The previous owner becomes a member with all six on every client; the new one is promoted and
-- loses their client rows (an owner has none). One transaction; the owner check runs at its end.
create or replace function transfer_agency_owner(p_org_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old uuid;
begin
  if not exists (select 1 from org_memberships where org_id = p_org_id and user_id = p_new_owner) then
    raise exception 'That person is not in this agency.' using errcode = 'no_data_found';
  end if;
  select user_id into v_old from org_memberships where org_id = p_org_id and is_owner;
  if v_old = p_new_owner then
    return;
  end if;
  -- org_role first, so 0012's last-owner trigger sees an owner throughout.
  update org_memberships set org_role = 'owner' where org_id = p_org_id and user_id = p_new_owner;
  if v_old is not null then
    update org_memberships
       set is_owner = false,
           org_role = 'senior',
           permissions = array['view','edit','generate','approve','share','delete'],
           access_given_at = coalesce(access_given_at, now())
     where org_id = p_org_id and user_id = v_old;
    insert into membership_clients (user_id, org_id, client_id)
    select v_old, p_org_id, c.id from clients c where c.org_id = p_org_id
    on conflict do nothing;
  end if;
  delete from membership_clients where org_id = p_org_id and user_id = p_new_owner;
  update org_memberships
     set is_owner = true, access_given_at = coalesce(access_given_at, now())
   where org_id = p_org_id and user_id = p_new_owner;
end;
$$;
revoke all on function transfer_agency_owner(uuid, uuid) from public, anon, authenticated;
grant execute on function transfer_agency_owner(uuid, uuid) to service_role;

-- Add an agency (spec §6.6): the agency and its owner invitation together. The app makes the slug
-- (uniqueSlug) and the link's token.
create or replace function create_agency_with_owner_invite(
  p_name text, p_slug text, p_owner_email text, p_token text, p_by uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into organizations (name, slug) values (p_name, p_slug) returning id into v_org;
  insert into org_invitations (org_id, email, as_owner, token, invited_by)
  values (v_org, lower(p_owner_email), true, p_token, p_by);
  return v_org;
end;
$$;
revoke all on function create_agency_with_owner_invite(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function create_agency_with_owner_invite(text, text, text, text, uuid) to service_role;

-- Accepting (spec §6.3) is single use: the invitation is marked accepted in the same transaction
-- that creates the profile, the membership and, for a member, the invited client's row (with no
-- permissions until the owner gives access; the cascade then fills it).
create or replace function accept_invitation(p_token text, p_user_id uuid, p_display_name text)
returns table (org_id uuid, client_id uuid, as_owner boolean, invited_by uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  inv org_invitations%rowtype;
begin
  update org_invitations i
     set accepted_at = now()
   where i.token = p_token
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  returning i.* into inv;
  if not found then
    raise exception 'This invite link is no longer valid.' using errcode = 'no_data_found';
  end if;
  insert into profiles (user_id, display_name) values (p_user_id, p_display_name)
  on conflict (user_id) do update set display_name = excluded.display_name;
  insert into org_memberships (user_id, org_id, org_role, is_owner, access_given_at, invited_by)
  values (p_user_id, inv.org_id,
          case when inv.as_owner then 'owner' else 'designer' end,
          inv.as_owner,
          case when inv.as_owner then now() end,
          inv.invited_by);
  if not inv.as_owner then
    insert into membership_clients (user_id, org_id, client_id, added_by)
    values (p_user_id, inv.org_id, inv.client_id, inv.invited_by);
  end if;
  return query select inv.org_id, inv.client_id, inv.as_owner, inv.invited_by;
end;
$$;
revoke all on function accept_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function accept_invitation(text, uuid, text) to service_role;

-- The Team page and every Members list read this one call (spec §10): name, email (auth.users),
-- status, permissions, the client they were invited to and by whom, and their client ids.
create or replace function list_agency_people(p_org_id uuid)
returns table (
  user_id uuid, display_name text, email text, is_owner boolean, access_given_at timestamptz,
  permissions text[], joined_at timestamptz, invited_by_name text,
  invited_client_id uuid, invited_client_name text, client_ids uuid[]
)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(p.display_name, 'Unknown'),
         u.email::text,
         m.is_owner,
         m.access_given_at,
         m.permissions,
         m.joined_at,
         ip.display_name,
         inv.client_id,
         ic.name,
         coalesce((select array_agg(mc.client_id order by mc.added_at)
                     from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id), '{}')
    from org_memberships m
    join auth.users u on u.id = m.user_id
    left join profiles p on p.user_id = m.user_id
    left join profiles ip on ip.user_id = m.invited_by
    left join lateral (
      select i.client_id from org_invitations i
       where i.org_id = m.org_id and i.accepted_at is not null and lower(i.email) = lower(u.email)
       order by i.accepted_at desc
       limit 1
    ) inv on true
    left join clients ic on ic.id = inv.client_id
   where m.org_id = p_org_id
   order by m.is_owner desc, m.joined_at;
$$;
revoke all on function list_agency_people(uuid) from public, anon, authenticated;
grant execute on function list_agency_people(uuid) to service_role;

-- Before inviting (spec §6.2): does this email already have a login, and in which agency?
create or replace function find_user_by_email(p_email text)
returns table (user_id uuid, org_id uuid)
language sql stable security definer set search_path = public as $$
  select u.id, m.org_id
    from auth.users u
    left join org_memberships m on m.user_id = u.id
   where lower(u.email) = lower(p_email);
$$;
revoke all on function find_user_by_email(text) from public, anon, authenticated;
grant execute on function find_user_by_email(text) to service_role;

-- ── 7. Day one (spec §3.2): the earliest owner stays owner; everyone else keeps today's access ──
-- Runs once: only while no membership has access given yet. A re-run after people have signed up
-- and are waiting must never hand them all six.
do $$
begin
  if exists (select 1 from org_memberships where access_given_at is not null) then
    return;
  end if;

  update org_memberships m
     set is_owner = true
    from (select distinct on (org_id) org_id, user_id
            from org_memberships
           where org_role = 'owner'
           order by org_id, joined_at, user_id) first_owner
   where m.org_id = first_owner.org_id and m.user_id = first_owner.user_id;

  update org_memberships
     set permissions = array['view','edit','generate','approve','share','delete'],
         access_given_at = now()
   where not is_owner;

  update org_memberships set access_given_at = now() where is_owner;

  insert into membership_clients (user_id, org_id, client_id)
  select m.user_id, m.org_id, c.id
    from org_memberships m
    join clients c on c.org_id = m.org_id
   where not m.is_owner
  on conflict do nothing;
end
$$;

-- ── 8. RLS ready for more than one agency per person (D508) ───────────────────
create or replace function auth_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from org_memberships where user_id = auth.uid()
$$;
revoke all on function auth_org_ids() from public, anon;
grant execute on function auth_org_ids() to authenticated, service_role;

drop policy if exists "org isolation" on canvases;
create policy "org isolation" on canvases for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on client_kb_jobs;
create policy "org isolation" on client_kb_jobs for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on generations;
create policy "org isolation" on generations for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_version_annotations;
create policy "org isolation" on node_version_annotations for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on moodboard_items;
create policy "org isolation" on moodboard_items for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on credit_transactions;
create policy "org isolation" on credit_transactions for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_versions;
create policy "org isolation" on node_versions for select using (org_id in (select auth_org_ids()));
drop policy if exists "org isolation" on node_version_decisions;
create policy "org isolation" on node_version_decisions for select using (org_id in (select auth_org_ids()));

-- ── 9. Nodes and edges stay on their own canvas ───────────────────────────────
-- Canvas saves upsert nodes and edges by the ids the browser sends. Ids are not secret, so
-- without these a save carrying another canvas's node id would move that node onto the caller's
-- canvas, and an edge from another canvas's node would feed its output into the caller's
-- generations. Checked in the database so a save pays no extra round trip; a refused row fails
-- the whole save.
create or replace function keep_node_on_its_canvas()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.canvas_id is distinct from old.canvas_id then
    raise exception 'A node cannot move to another canvas' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists nodes_keep_canvas on nodes;
create trigger nodes_keep_canvas
  before update of canvas_id on nodes
  for each row execute function keep_node_on_its_canvas();

-- Definer: the endpoint check must see both nodes whatever the writer's row access.
create or replace function keep_edge_on_its_canvas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.canvas_id is distinct from old.canvas_id then
    raise exception 'An edge cannot move to another canvas' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from nodes where id = new.source_node_id and canvas_id = new.canvas_id)
     or not exists (select 1 from nodes where id = new.target_node_id and canvas_id = new.canvas_id) then
    raise exception 'An edge must join two nodes on its own canvas' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists edges_keep_canvas on edges;
create trigger edges_keep_canvas
  before insert or update on edges
  for each row execute function keep_edge_on_its_canvas();

-- Pending review counts for some review types only. Same shape as 0031's org_review_counts,
-- grouped in SQL so no row cap undercounts.
create or replace function org_review_counts_for_types(p_org_id uuid, p_node_types text[])
returns table (client_id uuid, canvas_id uuid, pending int)
language sql
stable
as $$
  select client_id, canvas_id, count(*)::int
    from review_queue_items
   where org_id = p_org_id
     and approval_status = 'pending'
     and node_type = any(p_node_types)
   group by client_id, canvas_id;
$$;

-- ── 10. The audit log records changes made from Admin (spec §6.6) ─────────────
alter table impersonation_audit_log drop constraint if exists impersonation_audit_log_event_type_check;
alter table impersonation_audit_log add constraint impersonation_audit_log_event_type_check
  check (event_type in ('session_started', 'elevated_mode_entered', 'write_action', 'session_ended', 'admin_action'));

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Delete the preset seed test**

Run: `git rm src/lib/permissions/seed-matches-catalogue.test.ts`

- [ ] **Step 5: Update the migration doc (spec §9)**

In `docs/auth-production-migration.md`, replace the whole section that starts at `## Migration 0062 — permission-based access (D495–D498, 2026-11-11)` (to the end of the file) with:

````markdown
## Migration 0062 — six permissions, one owner, client members (D500–D509, 2026-11-13)

`supabase/migrations/0062_permission_based_access.sql`. Never applied before 13 Nov 2026, so it
was rewritten in place; the 11 Nov presets version is not applied anywhere and never will be.
Paste into the Supabase SQL editor → Run.

What it adds:
- `org_memberships`: `is_owner` (one per agency, unique index `org_memberships_one_owner`),
  `permissions text[]` (only `view, edit, generate, approve, share, delete`), `access_given_at`
  (null = signed up, waiting for the owner), `invited_by`.
- `membership_clients`: one row per client a person is on, with that client's permissions.
  A new row copies the person's agency set; the owner never has rows.
- `org_invitations`: member invites carry the client; the owner invite (`as_owner`) has none.
  The link's token is stored as issued (unique index), so Copy link shows the same link; single
  use, 7 days, server-only (RLS on, no policies). Resend replaces the token; Cancel revokes.
- Triggers: `org_memberships_cascade_permissions` (an agency-level change reaches every client
  row as what was added and removed), `org_memberships_keep_owner` (deferred: an agency that has
  an owner always keeps one), `membership_clients_prepare` (no owner rows; copies the set).
- Functions (service role only): `get_membership_access`, `transfer_agency_owner`,
  `create_agency_with_owner_invite`, `accept_invitation`, `list_agency_people`,
  `find_user_by_email`; `auth_org_ids()` behind the eight "org isolation" policies.
- `nodes_keep_canvas` / `edges_keep_canvas`: a canvas save can't move another canvas's node or
  join nodes across canvases (a refused row fails the save with `check_violation`).
- `org_review_counts_for_types(uuid, text[])` and `admin_action` in the audit log's event types.

**Day one (runs once):** in each agency the earliest-joined `org_role = 'owner'` membership becomes
the owner. Everyone else gets all six permissions, access given, and a row on every existing
client, so nobody loses access. The backfill is skipped if any membership already has access
given, so a re-run never hands waiting people all six.

**Before applying, list agencies with more than one owner** (the earliest stays owner; the others
become members with all six):

```sql
select o.name, count(*) as owners, array_agg(p.display_name order by m.joined_at) as by_join_date
  from org_memberships m
  join organizations o on o.id = m.org_id
  left join profiles p on p.user_id = m.user_id
 where m.org_role = 'owner'
 group by o.name
having count(*) > 1;
```

**`org_role` stays** and is unread by the new code. New code keeps it in step (`owner` for the
owner, `designer` for a member who joins; `transfer_agency_owner` swaps them) so 0012's
`org_memberships_last_owner` trigger agrees. A later migration drops `org_role` and that trigger
once production runs the new code. Don't create agencies or members with the old admin screens
between applying 0062 and deploying the code: the old screens don't set `is_owner`.

**Ordering** (merging deploys on this repo: Vercel is git-integrated):

1. Run the multi-owner query above and note the result.
2. Apply 0062 (staging before any staging deploy of this branch, production before the merge to
   `main`).
3. Run the checks below.
4. Then deploy the code. Deployed before 0062, `get_membership_access` is missing and every
   signed-in request fails.

**Verify after running:**

```sql
-- expect one owner per agency that had one
select org_id, count(*) from org_memberships where is_owner group by org_id having count(*) <> 1;
-- expect 0: every non-owner has access given and all six permissions
select count(*) from org_memberships
 where not is_owner and (access_given_at is null or cardinality(permissions) <> 6);
-- expect 0: every non-owner is on every client of their agency
select count(*) from org_memberships m join clients c on c.org_id = m.org_id
 where not m.is_owner
   and not exists (select 1 from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id and mc.client_id = c.id);
-- expect 0: no owner has client rows
select count(*) from membership_clients mc join org_memberships m using (user_id, org_id) where m.is_owner;
-- expect one row for a member, with a clients array
select * from get_membership_access('<a member user id>');
-- expect 0: no edge joins nodes on another canvas
select count(*) from edges e
  join nodes s on s.id = e.source_node_id
  join nodes t on t.id = e.target_node_id
 where s.canvas_id <> e.canvas_id or t.canvas_id <> e.canvas_id;
```

**Check by hand on staging (spec §11), in a transaction you roll back:**

```sql
begin;
-- cascade: remove generate at agency level; every client row of that person loses it
update org_memberships set permissions = array['view','edit','approve','share','delete']
 where user_id = '<member>' and org_id = '<agency>';
select client_id, permissions from membership_clients where user_id = '<member>';
-- owner protection: refused with "The agency owner can't be removed." at commit
delete from org_memberships where org_id = '<agency>' and is_owner;
rollback;
```
````

- [ ] **Step 6: Run the tests**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0062_permission_based_access.sql src/lib/permissions/migration-0062.test.ts docs/auth-production-migration.md
git add -u src/lib/permissions/seed-matches-catalogue.test.ts
git commit -m "feat(db): rewrite 0062 for six permissions, one owner and client members (D500-D509)"
git log -1 --format=%B
```

---

### Task 3: Downloads come with View (reviews plan 2 Task 10)

Plan 2 Task 10 (`5b19e86a`) hid download buttons behind `downloads.view` / `downloads.share`. D507 folds downloads into View, and anyone who sees a file can view its client, so the gates go. Nothing else has touched those files since, so the commit reverts cleanly; the revert also puts the two `downloads.*` keys back on `NOT_YET_CHECKED`, which keeps the catalogue coverage test green until Task 6 replaces it.

**Files:**
- Revert: `5b19e86a` (touches `src/components/editor/editor-export-dialog.tsx`, `src/components/editor/editor-render-dialog.tsx`, `src/components/nodes/image-gen-focus-view.tsx`, `src/components/nodes/post-focus-view.tsx`, `src/components/permissions/use-can.ts`, `src/lib/actions/with-action-coverage.test.ts`, `src/lib/permissions/not-yet-checked.ts`; deletes `src/lib/permissions/downloads.ts` and `downloads.test.ts`, whose module goes)
- Test: `src/components/permissions/__tests__/downloads-come-with-view.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no `useCanDownload` and no `canDownload`; download buttons render wherever the file renders.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/permissions/__tests__/downloads-come-with-view.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// D507: View covers downloads. A person who can see a file can see its client, so no download
// button has a permission of its own.
const SURFACES = [
  "src/components/nodes/image-gen-focus-view.tsx",
  "src/components/nodes/post-focus-view.tsx",
  "src/components/editor/editor-export-dialog.tsx",
  "src/components/editor/editor-render-dialog.tsx",
];

describe("downloads come with View", () => {
  it.each(SURFACES)("%s shows its download without a separate check", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/useCanDownload|Downloading is turned off/);
  });

  it("has no download permission module", () => {
    expect(existsSync("src/lib/permissions/downloads.ts")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/permissions/__tests__/downloads-come-with-view.test.ts`
Expected: FAIL (the four files contain `useCanDownload`).

- [ ] **Step 3: Revert the gates**

Run: `git revert --no-commit 5b19e86a`
Expected: no conflicts. `git status` shows the seven modified files and the two deletions listed above.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/permissions src/lib/permissions src/lib/actions/with-action-coverage.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/editor/editor-export-dialog.tsx src/components/editor/editor-render-dialog.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/post-focus-view.tsx src/components/permissions/use-can.ts`
Expected: only the known tsc line; eslint clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/permissions/__tests__/downloads-come-with-view.test.ts
git commit -m "refactor(permissions): downloads come with View; the download gates go (D507)"
git log -1 --format=%B
```

---

### Task 4: Client sections show for everyone who can view the client

With View covering every section (brand setup, scripts, avatars, market), a section link's own `need` always passes for someone who can see the client at all. The filter and its hook go.

**Files:**
- Modify: `src/components/clients/client-sections.ts`, `src/components/clients/client-section-links.tsx`, `src/components/clients/client-row-actions.tsx`, `src/components/clients/client-settings-menu.tsx`, `src/components/clients/client-tile.tsx:76`, `src/app/clients/[id]/(canvases)/page.tsx:74`
- Delete: `src/components/clients/use-client-sections.ts`
- Test: `src/components/clients/__tests__/client-sections.test.tsx` (rewritten: it tested the per-area filter, which no longer exists)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ClientSection` without `need`; `ClientSectionLinks({ slug, clientName })`; `ClientSettingsMenu({ slug })`.

- [ ] **Step 1: Rewrite the test**

```tsx
// src/components/clients/__tests__/client-sections.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CLIENT_SECTIONS } from "../client-sections";
import { ClientSectionLinks } from "../client-section-links";

describe("client sections", () => {
  it("are the same for everyone who can see the client (D507: View covers every section)", () => {
    expect(CLIENT_SECTIONS.map((s) => s.label)).toEqual(["Scripts", "Brand KB", "Brand assets", "Market", "Avatars"]);
    expect(CLIENT_SECTIONS.some((s) => "need" in s)).toBe(false);
  });

  it("the tile's links are the pinned sections", () => {
    const html = renderToStaticMarkup(<ClientSectionLinks slug="acme" clientName="Acme" />);
    expect(html).toContain("Scripts");
    expect(html).toContain("Avatars");
    expect(html).not.toContain("Brand KB");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/clients`
Expected: FAIL (`"need" in s` is true; `ClientSectionLinks` requires `clientId`).

- [ ] **Step 3: Remove `need` and the filter**

`src/components/clients/client-sections.ts`: delete the first line (`import type { ClientScopedKey } …`), delete the `need` field and its comment from `type ClientSection`, and delete the five `need: "…",` lines from `CLIENT_SECTIONS`.

`git rm src/components/clients/use-client-sections.ts`

`src/components/clients/client-section-links.tsx`: replace the `useClientSections` import with `import { CLIENT_SECTIONS } from "@/components/clients/client-sections";`, and replace the signature and first line of the component with:

```tsx
export function ClientSectionLinks({ slug, clientName }: { slug: string; clientName: string }) {
  const pinned = CLIENT_SECTIONS.filter((s) => s.pinned);
```

and delete the line `if (pinned.length === 0) return null;`.

`src/components/clients/client-tile.tsx:76`: `<ClientSectionLinks slug={client.slug} clientName={client.name} />`.

`src/components/clients/client-row-actions.tsx`: replace the `useClientSections` import with `import { CLIENT_SECTIONS } from "@/components/clients/client-sections";`, replace `const unpinned = useClientSections(clientId).filter((s) => !s.pinned);` with `const unpinned = CLIENT_SECTIONS.filter((s) => !s.pinned);`, and change the comment above it to:

```tsx
  // Archive without permission is not shown. The sections are hidden for archived clients:
  // shortcuts into a recovery view would invite work on a client nobody is meant to be working on.
```

`src/components/clients/client-settings-menu.tsx`: replace the `useClientSections` import with `import { CLIENT_SECTIONS } from "@/components/clients/client-sections";`, replace the signature and the two lines after it with:

```tsx
export function ClientSettingsMenu({ slug }: { slug: string }) {
  const sections = CLIENT_SECTIONS;
```

(delete `if (sections.length === 0) return null;`).

`src/app/clients/[id]/(canvases)/page.tsx:74`: `<ClientSettingsMenu slug={client.slug} />`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/clients`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/clients "src/app/clients/[id]/(canvases)/page.tsx"`
Expected: only the known tsc line; eslint clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/clients "src/app/clients/[id]/(canvases)/page.tsx"
git commit -m "refactor(clients): every section shows to anyone who can view the client (D507)"
git log -1 --format=%B
```

---

### Task 5: The server decides with the six permissions

Every request now reads `get_membership_access` into the new `Access` and every chokepoint calls `check`. Routes still name the old keys for this one commit; `legacy-need.ts` maps each to its action (spec §4.3 table). Lists keep to the clients the person can view. The `/api/me` payload keeps its current shape, computed from the new access, so the browser is untouched until Task 7.

**Files:**
- Create: `src/lib/permissions/legacy-need.ts`, `src/lib/permissions/legacy-need.test.ts`
- Modify: `src/lib/permissions/check.ts` (rewrite), `src/lib/permissions/server.ts`, `src/lib/permissions/test-fixtures.ts` (rewrite), `src/lib/permissions/action-guard.ts`, `src/lib/permissions/page.ts`, `src/lib/permissions/browser.ts` (`packAccessRules` bridge), `src/lib/permissions/node-area.ts`, `src/lib/permissions/not-yet-checked.ts`, `src/lib/dal.ts`, `src/lib/dal-logic.ts`, `src/lib/api/route-helpers.ts`, `src/lib/db/review.ts`, `src/lib/review/queue.ts`, `src/lib/db/clients.ts`, `src/lib/actions/approval.ts`, `src/lib/actions/clients.ts`, `src/lib/me/payload.ts`, `src/lib/me/test-fixtures.ts`, `src/app/(home)/page.tsx`, `src/app/clients/[id]/(canvases)/page.tsx`, `src/app/clients/[id]/canvases/[cid]/(canvas)/page.tsx`, `src/app/api/moodboards/route.ts`, `src/app/api/review/counts/route.ts`, `src/app/api/review/inbox/route.ts`, `vitest.setup.ts`
- Delete: `src/lib/permissions/access.ts` (moved into `model.ts`)
- Tests rewritten for the new access: `src/lib/permissions/server.test.ts`, `page.test.ts`, `action-guard.test.ts`, `browser.test.ts`, `node-area.test.ts`, `src/lib/api/route-helpers.test.ts`, `src/lib/dal-org-resolution.test.ts`, `src/lib/dal-logic.test.ts`, `src/lib/actions/approval.test.ts`, `src/lib/actions/clients.test.ts`, `src/lib/actions/canvases.test.ts`, `src/lib/db/scope-filters.test.ts`, `src/app/api/me/route.test.ts`, `src/app/api/copilot/scope.test.ts`, `src/components/permissions/__tests__/access-provider.test.tsx`, `src/hooks/__tests__/use-identity.test.tsx`

**Interfaces:**
- Consumes: Task 1's `model.ts` and `check`.
- Produces: `type Need = Action | PermissionKey` and `actionForNeed(need: Need): Action` (deleted in Task 6); `CallerContext` without `orgRole`, with `access: Access` from `model.ts`; `testAllowAllAccess(): Access`, `testOwnerAccess(orgId?: string): Access`, `testAccess(opts: { permissions: readonly Permission[]; clientIds: readonly string[]; clients?: Readonly<Record<string, readonly Permission[]>>; orgId?: string; accessGiven?: boolean }): Access`, `testMembershipRow(overrides?: Partial<MembershipAccessRow>): MembershipAccessRow`; `getOrgReviewCounts(orgId: string, clientIds: readonly string[] | null): Promise<ReviewCounts>`; `REVIEWABLE_NODE_TYPES` exported from `src/lib/review/queue.ts`; `packAccessRules(access: Access, orgId: string): PackedRules` (deleted in Task 7).

- [ ] **Step 1: Write the failing test for the bridge**

```ts
// src/lib/permissions/legacy-need.test.ts
import { describe, it, expect } from "vitest";
import { actionForNeed } from "./legacy-need";

// Spec §4.3's table, for the one commit in which routes still name the old keys.
describe("actionForNeed", () => {
  it("keeps a plain action as it is", () => {
    expect(actionForNeed("approve")).toBe("approve");
    expect(actionForNeed("manage_team")).toBe("manage_team");
  });

  it("reads an area key as its level", () => {
    expect(actionForNeed("scripts.view")).toBe("view");
    expect(actionForNeed("canvases.edit")).toBe("edit");
    expect(actionForNeed("video_generation.generate")).toBe("generate");
    expect(actionForNeed("scripts.approve")).toBe("approve");
    expect(actionForNeed("client_review.share")).toBe("share");
    expect(actionForNeed("canvases.delete")).toBe("delete");
    expect(actionForNeed("downloads.share")).toBe("share");
  });

  it("reads the agency areas as the owner-only actions", () => {
    expect(actionForNeed("clients.edit")).toBe("manage_clients");
    expect(actionForNeed("clients.delete")).toBe("manage_clients");
    expect(actionForNeed("credits.view")).toBe("view_credits");
    expect(actionForNeed("team.edit")).toBe("manage_team");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions/legacy-need.test.ts`
Expected: FAIL, `Failed to resolve import "./legacy-need"`.

- [ ] **Step 3: The bridge, the checker file and the fixtures**

```ts
// src/lib/permissions/legacy-need.ts
// Task 5 → Task 6 of plan 3 only: routes keep naming the old area keys for one commit while the
// checker is already the six-permission one. Task 6 renames every need and deletes this file.
import { splitKey, type PermissionKey } from "./catalogue";
import { isAction, type Action } from "./model";

export type Need = Action | PermissionKey;

const AGENCY_KEYS: Partial<Record<PermissionKey, Action>> = {
  "clients.edit": "manage_clients",
  "clients.delete": "manage_clients",
  "credits.view": "view_credits",
  "team.view": "manage_team",
  "team.edit": "manage_team",
  "team.delete": "manage_team",
};

export function actionForNeed(need: Need): Action {
  if (isAction(need)) return need;
  return AGENCY_KEYS[need] ?? splitKey(need).level;
}
```

Replace the whole of `src/lib/permissions/check.ts` with:

```ts
// src/lib/permissions/check.ts
import { isPermission, type Access, type Action, type Permission } from "./model";

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

/** clientId null: "on at least one client the person can view", for routes and nav items not
 *  rooted at one client (the voice library, the moodboard index, the review inbox). */
export type CheckTarget = { orgId: string; clientId: string | null };

export function check(access: Access, action: Action, { orgId, clientId }: CheckTarget): Decision {
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
export function clientIdsWith(access: Access, orgId: string, action: Permission): string[] | null {
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
export function isWaiting(access: Access, orgId: string): boolean {
  if (access.isSuperAdmin) return false;
  const org = access.orgs.get(orgId);
  if (!org || org.isOwner) return false;
  return !org.accessGiven || !org.anyClient.has("view");
}
```

`git rm src/lib/permissions/access.ts`

Replace the whole of `src/lib/permissions/test-fixtures.ts` with:

```ts
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
```

Replace the whole of `vitest.setup.ts` with:

```ts
import { vi } from "vitest";

// Many tests mock resolveCallerContext with a partial caller and no `access`. Production accessOf()
// throws on that; in tests it falls back to access that allows everything in any agency, so those
// tests keep testing what they were written for. Tests about permissions pass a real `access` (see
// src/lib/permissions/test-fixtures.ts) or call vi.unmock("@/lib/permissions/server").
vi.mock("@/lib/permissions/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions/server")>();
  const { testAllowAllAccess } = await import("@/lib/permissions/test-fixtures");
  return {
    ...actual,
    accessOf: (caller: { access?: import("@/lib/permissions/model").Access }) => caller.access ?? testAllowAllAccess(),
  };
});
```

- [ ] **Step 4: The caller carries the new access**

`src/lib/dal-logic.ts`: change the first line to `import type { Access } from "@/lib/permissions/model";`; in `CallerContext`, delete the `orgRole` field and its comment and change the `access` comment to `/** D500: what this person may do. Read it through accessOf(), never directly. */`; delete `orgRoleToIdentityRole` and `presetKeyToOrgRole` with their comments. Keep `export type OrgRole` (the admin screens write `org_role` until plan 4).

`src/lib/dal-logic.test.ts`: change the import to `import { mapAppMetadataToPlatformRole, mapAppMetadataToMustChangePassword } from "./dal-logic";` and delete the `describe("orgRoleToIdentityRole", …)` and `describe("presetKeyToOrgRole", …)` blocks (the functions are gone).

`src/lib/dal.ts`: replace the imports from `./dal-logic` and `@/lib/permissions/access` with:

```ts
import {
  mapAppMetadataToPlatformRole,
  mapAppMetadataToMustChangePassword,
  type CallerContext,
} from "./dal-logic";
import { accessFromRows, type MembershipAccessRow } from "@/lib/permissions/model";
```

Replace `loadMembershipAccess` and `buildCallerContext` with:

```ts
// D500/D508: ONE round trip returns the membership and everything access needs. Several rows
// = several agencies, which is not allowed yet (the one_org_per_user index).
// cache() dedupes within one render (so both resolvers share one RPC per user id), not inside
// route handlers. A failed read throws: it is an error page, never "no access" (spec §4.1).
const loadMembershipAccess = cache(async (userId: string): Promise<MembershipAccessRow[]> => {
  const db = createServerSupabase();
  const { data, error } = await db.rpc("get_membership_access", { p_user_id: userId });
  if (error) throw error;
  const rows = (data ?? []) as MembershipAccessRow[];
  if (rows.length > 1) throw new Error("Belonging to more than one agency is not supported yet.");
  return rows;
});
```

```ts
function buildCallerContext(
  user: NonNullable<Awaited<ReturnType<typeof getUserWithRetry>>>,
  platformRole: CallerContext["platformRole"],
  mustChangePassword: boolean,
  rows: MembershipAccessRow[],
): CallerContext {
  return {
    userId: user.id,
    email: user.email ?? null,
    platformRole,
    orgId: rows[0].org_id,
    mustChangePassword,
    access: accessFromRows(user.id, platformRole === "super_admin", rows),
  };
}
```

In `resolveCallerContext`, replace from `const row = await loadMembershipAccess(user.id);` to its `return` with:

```ts
  const rows = await loadMembershipAccess(user.id);
  if (rows.length === 0) {
    // Authenticated but unprovisioned — treat as no access.
    redirect("/login?error=no-membership");
  }

  return buildCallerContext(user, platformRole, mustChangePassword, rows);
```

and in `resolveCallerContextOrNull`:

```ts
  const rows = await loadMembershipAccess(user.id);
  if (rows.length === 0) return null;

  return buildCallerContext(user, platformRole, mustChangePassword, rows);
```

`src/lib/permissions/server.ts`: replace `import { ownerAccess, type Access } from "./access";` with `import { impersonatedAccess, type Access } from "./model";` and in `actingFrom` replace `access: ownerAccess()` with `access: impersonatedAccess(caller.userId, impersonation.targetOrgId)`.

- [ ] **Step 5: Chokepoints, action guard and pages call `check`**

`src/lib/api/route-helpers.ts`:
- Replace the three imports `import { accessOf, resolveActingCaller } …`, `import { denialFor, FORBIDDEN_MESSAGE, type Denial } …` and `import type { PermissionKey } …` with:

```ts
import { accessOf, resolveActingCaller, type ActingCaller } from "@/lib/permissions/server";
import { check, FORBIDDEN_MESSAGE, type Decision } from "@/lib/permissions/check";
import { actionForNeed, type Need } from "@/lib/permissions/legacy-need";
```

- Replace the `Guard` type and `denial` function with:

```ts
// D496/D504: every handler names the one action it needs. Required, so TypeScript forces the
// decision; route-coverage.test.ts fails on any handler that skips the chokepoints.
export type Guard = { need: Need };

function decide(acting: ActingCaller, need: Need, clientId: string | null): Decision {
  return check(accessOf(acting.caller), actionForNeed(need), { orgId: acting.effectiveOrgId, clientId });
}

function denial(decision: Exclude<Decision, "allow">, notFoundMessage: string): AnyResponse {
  return decision === "not_found" ? apiError(notFoundMessage, 404) : apiError(FORBIDDEN_MESSAGE, 403);
}
```

- In `withClient` replace

```ts
  const denied = denialFor(accessOf(acting.caller), guard.need, clientId);
  if (denied) return denial(denied, "Client not found.");
```

with

```ts
  const decision = decide(acting, guard.need, clientId);
  if (decision !== "allow") return denial(decision, "Client not found.");
```

- The same replacement in `withCanvas` (`decide(acting, guard.need, row.client_id)`, message `"Canvas not found."`), `withNode` (`decide(acting, guard.need, canvas.client_id)`, `"Node not found."`), `withMoodboard` (`decide(acting, guard.need, row.client_id)`, `"Moodboard not found."`) and `withAccess` (`decide(acting, guard.need, null)`, `"Not found."`).
- Replace the comment above `withAccess` with:

```ts
// For routes not rooted at one client or resource: the voice library, the moodboard index, the
// review inbox and counts. A client action passes when held on at least one client the person
// can view; the handler then keeps what it returns to those clients (clientIdsWith).
```

`src/lib/permissions/action-guard.ts`: replace the imports of `./check` and `./catalogue` with:

```ts
import { check, ForbiddenError } from "./check";
import { actionForNeed, type Need } from "./legacy-need";
```

change `| { need: PermissionKey; on: ActionTarget }` to `| { need: Need; on: ActionTarget }`, and replace from `const access = accessOf(acting.caller);` to the end of the function with:

```ts
  const access = accessOf(acting.caller);
  const action = actionForNeed(guard.need);
  if (guard.on === "agency") {
    if (check(access, action, { orgId: acting.effectiveOrgId, clientId: null }) !== "allow") throw new ForbiddenError();
    return { ...base, target: null };
  }

  if (!target || target.orgId !== acting.effectiveOrgId) throw new Error(NOT_FOUND_MESSAGE);
  const decision = check(access, action, { orgId: target.orgId, clientId: target.clientId });
  if (decision === "not_found") throw new Error(NOT_FOUND_MESSAGE);
  if (decision === "forbidden") throw new ForbiddenError();
  return { ...base, target };
}
```

Change the comment above `checkActionAccess` from `// D496 for server actions: the same agency + client scope + tick rule as the API chokepoints.` to `// D496/D504 for server actions: the same agency, client and permission rule as the API chokepoints.`

Replace the whole of `src/lib/permissions/page.ts` with:

```ts
import "server-only";
import { notFound } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import type { ClientRow } from "@/lib/db/types";
import type { CallerContext } from "@/lib/dal";
import { accessOf, resolveActingCaller } from "./server";
import { check } from "./check";
import { actionForNeed, type Need } from "./legacy-need";
import { resolveTarget } from "./targets";

// Client pages (spec §4.4): another agency's client, a client the person is not on or can't
// view, and a missing permission all show the 404 page, which never confirms the client exists.
export async function loadClientPage(
  slug: string,
  need: Need,
): Promise<{ client: ClientRow; caller: CallerContext; effectiveOrgId: string }> {
  const [client, acting] = await Promise.all([getClientBySlug(slug), resolveActingCaller()]);
  if (!client || client.org_id !== acting.effectiveOrgId) notFound();
  const decision = check(accessOf(acting.caller), actionForNeed(need), { orgId: acting.effectiveOrgId, clientId: client.id });
  if (decision !== "allow") notFound();
  return { client, caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
}

// Canvas pages outside the client tree (/eval/[canvasId]): another agency's canvas, a canvas on a
// client the person can't view and a missing canvas answer null, so the page shows its own
// "Canvas not found"; a missing permission shows the 404 page. One target read, beside the caller.
export async function loadCanvasPage(
  canvasId: string,
  need: Need,
): Promise<{ clientId: string; caller: CallerContext; effectiveOrgId: string } | null> {
  const [target, acting] = await Promise.all([resolveTarget({ canvasId }), resolveActingCaller()]);
  if (!target?.clientId || target.orgId !== acting.effectiveOrgId) return null;
  const decision = check(accessOf(acting.caller), actionForNeed(need), { orgId: acting.effectiveOrgId, clientId: target.clientId });
  if (decision === "not_found") return null;
  if (decision === "forbidden") notFound();
  return { clientId: target.clientId, caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
}
```

- [ ] **Step 6: Lists keep to the clients the person can view**

`src/lib/review/queue.ts`: add near the top, after the `ReviewCounts` type:

```ts
/** The node types review_queue_items carries (migration 0031). */
export const REVIEWABLE_NODE_TYPES = ["image-gen", "video-gen"] as const;
```

`src/lib/db/review.ts`: delete the three imports of `@/lib/permissions/check`, `@/lib/permissions/node-area` and `@/lib/permissions/access`, and replace the comment and body of `getOrgReviewCounts` with:

```ts
// R5.1/R5.2/R5.3: one read, never one query per row (PRD §8: the client list renders for every
// org member on every visit). Pending counts are of the work the person can approve (D507): the
// clients whose row has Approve, or every client for the owner (null). An empty list reads nothing.
export async function getOrgReviewCounts(orgId: string, clientIds: readonly string[] | null): Promise<ReviewCounts> {
  if (clientIds !== null && clientIds.length === 0) return summarizeCounts([]);
  const inScope = clientIds === null ? null : new Set(clientIds);
  const { data, error } = await createServerSupabase().rpc("org_review_counts", { p_org_id: orgId });
  if (error) throw error;
  const rows = ((data ?? []) as { client_id: string; canvas_id: string; pending: number }[])
    .filter((r) => inScope === null || inScope.has(r.client_id));
  return summarizeCounts(rows.map((r) => ({ clientId: r.client_id, canvasId: r.canvas_id, pending: r.pending })));
}
```

`src/lib/permissions/node-area.ts`: delete the `import type { Access } …` and `import { canAnywhere } …` lines, `REVIEWABLE_NODE_TYPES` and `reviewableNodeTypes` (with their comments). `approveKeyForNodeType` stays until Task 7.

`src/app/api/review/counts/route.ts`: replace the `accessOf` import line with

```ts
import { accessOf } from "@/lib/permissions/server";
import { clientIdsWith } from "@/lib/permissions/check";
```

change the last comment line to `// Counts are of the work the caller can approve: the clients where they hold Approve.` and the body call to `apiOk(await getOrgReviewCounts(orgId, clientIdsWith(accessOf(caller), orgId, "approve"))),`.

Replace the whole of `src/app/api/review/inbox/route.ts` with:

```ts
import { listOrgReviewInbox } from "@/lib/db/review";
import { apiOk, withAccess, withTryCatch } from "@/lib/api/route-helpers";
import { parsePageParams } from "@/lib/review/page-params";
import { REVIEWABLE_NODE_TYPES } from "@/lib/review/queue";
import { accessOf } from "@/lib/permissions/server";
import { check, clientIdsWith } from "@/lib/permissions/check";

// R9.1/R9.5 — "things waiting on you", org-wide.
//
// The user id, review types and clients all come from the session, never from the request, so a
// caller cannot widen their own list into someone else's. Pending work is listed for someone who
// holds Approve on a client; everyone sees their own rejected work, on the clients they can view.
// The rule itself lives in inboxFilterFor / selectInboxFor (pure, proven equivalent in queue.test.ts).
export async function GET(req: Request) {
  const page = parsePageParams(new URL(req.url).searchParams);
  return withAccess(req, { need: "internal_review.view" }, (caller, orgId) =>
    withTryCatch("Failed to load review inbox", async () => {
      const access = accessOf(caller);
      const approves = check(access, "approve", { orgId, clientId: null }) === "allow";
      const items = await listOrgReviewInbox(
        orgId,
        caller.userId,
        { reviewTypes: approves ? REVIEWABLE_NODE_TYPES : [], clientIds: clientIdsWith(access, orgId, "view") },
        page,
      );
      return apiOk({ items, hasMore: items.length === page.limit });
    }),
  );
}
```

`src/app/api/moodboards/route.ts`: replace `import { scopeIds } from "@/lib/permissions/check";` with `import { clientIdsWith } from "@/lib/permissions/check";` and `scopeIds(accessOf(caller))` with `clientIdsWith(accessOf(caller), orgId, "view")`.

Replace `src/app/(home)/page.tsx`'s imports of `@/lib/permissions/server` and `@/lib/permissions/check` and the first lines of `ClientsPage` with:

```tsx
import { resolveActingCaller, accessOf } from "@/lib/permissions/server";
import { clientIdsWith } from "@/lib/permissions/check";
```

```tsx
export default async function ClientsPage() {
  const { caller, effectiveOrgId } = await resolveActingCaller();
  const access = accessOf(caller);
  const clientIds = clientIdsWith(access, effectiveOrgId, "view");
```

and the counts call to `getOrgReviewCounts(effectiveOrgId, clientIdsWith(access, effectiveOrgId, "approve")),`.

`src/app/clients/[id]/(canvases)/page.tsx`: replace `import { can } from "@/lib/permissions/check";` with `import { check, clientIdsWith } from "@/lib/permissions/check";`, the counts call with `getOrgReviewCounts(effectiveOrgId, clientIdsWith(accessOf(caller), effectiveOrgId, "approve")),`, and the `canAddCanvas` line with:

```tsx
  const canAddCanvas = check(accessOf(caller), "edit", { orgId: effectiveOrgId, clientId: client.id }) === "allow";
```

`src/app/clients/[id]/canvases/[cid]/(canvas)/page.tsx`: add `import { clientIdsWith } from "@/lib/permissions/check";` below the `accessOf` import and change the counts call to `getOrgReviewCounts(effectiveOrgId, clientIdsWith(accessOf(caller), effectiveOrgId, "approve")),`.

- [ ] **Step 7: Approving needs Approve on the version's client; creating clients is the owner's**

`src/lib/actions/approval.ts`: replace the five permission imports (`accessOf`, `can, canAnywhere, canSeeClient`, `resolveTarget`, `ClientScopedKey`, `approveKeyForNodeType`, `MEDIA_APPROVE_KEYS`) with:

```ts
import { accessOf } from "@/lib/permissions/server";
import { check } from "@/lib/permissions/check";
import { resolveTarget } from "@/lib/permissions/targets";
```

Replace the guard line with:

```ts
  return withAction("setVersionApprovalAction", { custom: "needs Approve on the version's client; checked after reading the version, and refused as a returned message (BUG-003)" }, async (ctx): Promise<ApprovalActionResult> => {
```

Replace the block from `// R2.1/R2.2, D495 — approving needs Approve on the node's area.` to the closing `}` of the `MEDIA_APPROVE_KEYS` check with:

```ts
    // R2.1/R2.2, D507 — approving needs Approve on the version's client. D166 kept: refuse before
    // any read when the person can approve on no client, so version ids can't be probed. The UI
    // also hides the control, but that is a courtesy on top of this, never the mechanism (R2.3).
    const access = accessOf(caller);
    if (check(access, "approve", { orgId: ctx.effectiveOrgId, clientId: null }) !== "allow") {
      return refuse("You are not permitted to approve or reject work.");
    }
```

and replace the block from `const target = await resolveTarget({ versionId });` to the closing `}` of the `!key || !can(…)` check with:

```ts
    const target = await resolveTarget({ versionId });
    if (!target?.clientId || target.orgId !== ctx.effectiveOrgId) {
      return refuse("Version not found.");
    }
    const decision = check(access, "approve", { orgId: target.orgId, clientId: target.clientId });
    if (decision === "not_found") return refuse("Version not found.");
    if (decision === "forbidden") return refuse("You are not permitted to approve or reject work.");
    const orgId = target.orgId;
```

(The comment above `resolveTarget` about tenancy stays; change its last sentence to `A client the person can't view answers the same way.`)

Replace the whole of `src/lib/actions/clients.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";
import { withAction } from "@/lib/actions/with-action";

// Creating clients is the owner's (manage_clients, spec §2.2). The owner is on every client
// already, so a new client needs no membership row.
export async function createClientAction(input: { name: string }) {
  return withAction("createClientAction", { need: "clients.edit", on: "agency" }, async (ctx) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Client needs a name");
    const client = await createClient({ name, orgId: ctx.effectiveOrgId });
    revalidatePath("/");
    return client;
  });
}
```

`src/lib/db/clients.ts`: delete `addClientToMembership` and `deleteClient` (with its comment); `createClientAction`'s rollback was the only caller of either.

- [ ] **Step 8: `/api/me` keeps its shape, computed from the new access**

`src/lib/permissions/browser.ts`: replace `import type { Access } from "./access";` with

```ts
import type { Access } from "./model";
import { clientIdsWith } from "./check";
```

add `ALL_PERMISSION_KEYS` to the `./catalogue` import, and replace `packAccessRules` with:

```ts
// Task 5 → Task 7 of plan 3 only: the browser still reads CASL rules, so the six-permission
// access is turned back into them. A member holds every area's level they hold on any client
// they can view, on those clients; a per-client difference (spec §8) shows as the union until
// Task 7 sends the access itself.
export function packAccessRules(access: Access, orgId: string): PackedRules {
  const scope = clientIdsWith(access, orgId, "view");
  if (scope === null) return packRules(buildRules(new Set(ALL_PERMISSION_KEYS), "all"));
  const anyClient = access.orgs.get(orgId)?.anyClient ?? new Set();
  const keys = ALL_PERMISSION_KEYS.filter((k) => isClientScopedKey(k) && anyClient.has(splitKey(k).level));
  return packRules(buildRules(new Set(keys), new Set(scope)));
}
```

Replace `buildMePayload` in `src/lib/me/payload.ts` (and its imports of `orgRoleToIdentityRole`, `getPresetName`, `can`, `packAccessRules`) with:

```ts
import { check, clientIdsWith } from "@/lib/permissions/check";
import { packAccessRules } from "@/lib/permissions/browser";
```

```ts
// One builder for /api/me and the root layout, so the first HTML and every refetch carry the
// same thing. The reads run in parallel; the credit read runs only for someone who may see it.
// Until Task 7 the payload keeps its old fields, worked out from the six-permission access.
export async function buildMePayload({ caller, effectiveOrgId }: ActingCaller): Promise<MePayload> {
  const access = accessOf(caller);
  const on = { orgId: effectiveOrgId, clientId: null };
  const everything = access.isSuperAdmin || access.orgs.get(effectiveOrgId)?.isOwner === true;
  const showCredits = check(access, "view_credits", on) === "allow";
  const approves = check(access, "approve", on) === "allow";
  const scope = clientIdsWith(access, effectiveOrgId, "view");
  const [name, org, creditsUsed] = await Promise.all([
    getDisplayName(caller.userId),
    getOrgById(effectiveOrgId),
    showCredits ? getOrgCreditUsage(effectiveOrgId) : Promise.resolve(null),
  ]);
  return {
    name: name ?? "User",
    platformRole: caller.platformRole,
    orgId: effectiveOrgId,
    orgName: org?.name ?? null,
    presetKey: everything ? "owner" : "member",
    presetName: everything ? "Owner" : "Member",
    permissions: packAccessRules(access, effectiveOrgId),
    clientScope: scope ?? "all",
    creditsUsed,
    monthlyCreditLimit: showCredits ? (org?.monthly_credit_limit ?? null) : null,
    role: approves ? "senior" : "designer",
    orgRole: everything ? "owner" : "designer",
  };
}
```

Replace the whole of `src/lib/me/test-fixtures.ts` with:

```ts
// src/lib/me/test-fixtures.ts
import type { Access } from "@/lib/permissions/model";
import { clientIdsWith } from "@/lib/permissions/check";
import { packAccessRules } from "@/lib/permissions/browser";
import type { MePayload } from "./types";

export function testMePayload(access: Access, over: Partial<MePayload> = {}): MePayload {
  const scope = clientIdsWith(access, "org-1", "view");
  return {
    name: "Arun",
    platformRole: "member",
    orgId: "org-1",
    orgName: "Yuvabe Studios",
    presetKey: "member",
    presetName: "Designer",
    permissions: packAccessRules(access, "org-1"),
    clientScope: scope ?? "all",
    creditsUsed: 42,
    monthlyCreditLimit: 1000,
    role: "designer",
    orgRole: "designer",
    ...over,
  };
}
```

`src/lib/permissions/not-yet-checked.ts`: add the line `"credits.view": "checked as view_credits in src/lib/me/payload.ts until plan 3 Task 6 renames the keys",` to `NOT_YET_CHECKED` (the payload no longer names the old key).

- [ ] **Step 9: Rewrite the tests that encode the old access**

Replace the whole of `src/lib/permissions/server.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.unmock("@/lib/permissions/server");

const { callerMock, impersonationMock } = vi.hoisted(() => ({
  callerMock: vi.fn(),
  impersonationMock: vi.fn(),
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: callerMock }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: impersonationMock }));

import { accessOf, resolveActingCaller } from "./server";
import { testAccess } from "./test-fixtures";

describe("accessOf", () => {
  it("returns the caller's access", () => {
    const access = testAccess({ permissions: ["view"], clientIds: ["c1"] });
    expect(accessOf({ access })).toBe(access);
  });

  it("throws when access was not loaded (fail closed)", () => {
    expect(() => accessOf({})).toThrow("Access was not loaded for this request.");
  });
});

describe("resolveActingCaller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the caller's own agency and access when not impersonating", async () => {
    const access = testAccess({ permissions: ["view"], clientIds: ["c1"] });
    callerMock.mockResolvedValue({ userId: "u1", orgId: "org-1", access });
    impersonationMock.mockResolvedValue({ isImpersonating: false });
    const acting = await resolveActingCaller();
    expect(acting.effectiveOrgId).toBe("org-1");
    expect(acting.caller.access).toBe(access);
  });

  it("acts as the target agency's owner while impersonating, as a super admin", async () => {
    callerMock.mockResolvedValue({ userId: "op", orgId: "yuvabe", access: testAccess({ permissions: [], clientIds: [], orgId: "yuvabe" }) });
    impersonationMock.mockResolvedValue({ isImpersonating: true, operatorId: "op", targetOrgId: "org-9", elevated: false });
    const acting = await resolveActingCaller();
    expect(acting.effectiveOrgId).toBe("org-9");
    expect(acting.caller.access.isSuperAdmin).toBe(true);
    expect(acting.caller.access.orgs.get("org-9")?.isOwner).toBe(true);
    expect(acting.caller.orgId).toBe("yuvabe");
  });
});
```

Replace the whole of `src/lib/permissions/page.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { actingMock, clientMock, targetMock, notFoundMock } = vi.hoisted(() => ({
  actingMock: vi.fn(),
  clientMock: vi.fn(),
  targetMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/permissions/server", async (orig) => ({ ...(await orig<typeof import("./server")>()), resolveActingCaller: actingMock }));
vi.mock("@/lib/db/clients", () => ({ getClientBySlug: clientMock }));
vi.mock("./targets", () => ({ resolveTarget: targetMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock, redirect: vi.fn() }));

import { loadCanvasPage, loadClientPage } from "./page";
import { testAccess } from "./test-fixtures";
import type { Permission } from "./model";

const acting = (permissions: Permission[], clientIds: string[] = ["c-1"]) => ({
  caller: { userId: "u1", orgId: "org-1", access: testAccess({ permissions, clientIds }) },
  effectiveOrgId: "org-1",
  impersonation: { isImpersonating: false },
});

// Spec §4.4: every page denial is the 404 page, which never confirms the client exists.
describe("loadClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.mockResolvedValue({ id: "c-1", slug: "acme", org_id: "org-1" });
  });

  it("returns the client for a person who can view it", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadClientPage("acme", "view")).resolves.toMatchObject({ client: { id: "c-1" }, effectiveOrgId: "org-1" });
  });

  it("shows the 404 page for another agency's client", async () => {
    actingMock.mockResolvedValue({ ...acting(["view"]), effectiveOrgId: "org-2" });
    await expect(loadClientPage("acme", "view")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page for a client the person is not on", async () => {
    actingMock.mockResolvedValue(acting(["view"], ["c-9"]));
    await expect(loadClientPage("acme", "view")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page without View on the client", async () => {
    actingMock.mockResolvedValue(acting(["edit"]));
    await expect(loadClientPage("acme", "view")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page without the permission the page needs", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadClientPage("acme", "edit")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page for a slug that does not exist", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    clientMock.mockResolvedValue(null);
    await expect(loadClientPage("nope", "view")).rejects.toThrow("NOT_FOUND");
  });
});

// Canvas pages answer a canvas the person can't reach with null, so /eval shows the same
// "Canvas not found" it always showed for another agency's canvas.
describe("loadCanvasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
  });

  it("returns the canvas's client for a person who can view it", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadCanvasPage("cv-1", "view")).resolves.toMatchObject({ clientId: "c-1", effectiveOrgId: "org-1" });
    expect(targetMock).toHaveBeenCalledWith({ canvasId: "cv-1" });
  });

  it("answers null for a canvas that does not exist", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    targetMock.mockResolvedValue(null);
    await expect(loadCanvasPage("cv-1", "view")).resolves.toBeNull();
  });

  it("answers null for another agency's canvas", async () => {
    actingMock.mockResolvedValue({ ...acting(["view"]), effectiveOrgId: "org-2" });
    await expect(loadCanvasPage("cv-1", "view")).resolves.toBeNull();
  });

  it("answers null for a canvas on a client the person can't view", async () => {
    actingMock.mockResolvedValue(acting(["view"], ["c-9"]));
    await expect(loadCanvasPage("cv-1", "view")).resolves.toBeNull();
  });

  it("shows the 404 page without the permission the page needs", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadCanvasPage("cv-1", "edit")).rejects.toThrow("NOT_FOUND");
  });
});
```

Replace the whole of `src/lib/permissions/action-guard.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// This file's own vi.mock of @/lib/permissions/server (importOriginal + override) replaces the
// one in vitest.setup.ts, so accessOf here is the real, fail-closed one.

const { actingMock, targetMock } = vi.hoisted(() => ({ actingMock: vi.fn(), targetMock: vi.fn() }));
vi.mock("@/lib/permissions/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions/server")>()),
  resolveActingCaller: actingMock,
}));
vi.mock("@/lib/permissions/targets", () => ({ resolveTarget: targetMock }));

import { checkActionAccess } from "./action-guard";
import { testAccess, testOwnerAccess } from "./test-fixtures";
import type { Access, Permission } from "./model";

function acting(access: Access) {
  return { caller: { userId: "u1", orgId: "org-1", access }, effectiveOrgId: "org-1", impersonation: { isImpersonating: false } };
}
const member = (permissions: Permission[], clientIds: string[] = ["c-1"]) => acting(testAccess({ permissions, clientIds }));

describe("checkActionAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes for a client the person is on, with the permission", async () => {
    actingMock.mockResolvedValue(member(["view", "edit"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    const ctx = await checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } });
    expect(ctx.target).toEqual({ clientId: "c-1", orgId: "org-1" });
  });

  it("says not found for another agency's row", async () => {
    actingMock.mockResolvedValue(member(["view", "edit"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-2" });
    await expect(checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a missing row", async () => {
    actingMock.mockResolvedValue(member(["view", "edit"]));
    targetMock.mockResolvedValue(null);
    await expect(checkActionAccess({ need: "edit", on: { nodeId: "n-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a client the person is not on, or can't view", async () => {
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    actingMock.mockResolvedValue(member(["view", "edit"], ["c-9"]));
    await expect(checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
    actingMock.mockResolvedValue(member(["edit"]));
    await expect(checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("refuses a missing permission with the agreed copy", async () => {
    actingMock.mockResolvedValue(member(["view"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    await expect(checkActionAccess({ need: "delete", on: { canvasId: "cv-1" } })).rejects.toThrow(
      "You don't have access to this. Ask your agency owner.",
    );
  });

  it("checks an owner-only action without a target lookup", async () => {
    actingMock.mockResolvedValue(acting(testOwnerAccess()));
    const ctx = await checkActionAccess({ need: "manage_clients", on: "agency" });
    expect(targetMock).not.toHaveBeenCalled();
    expect(ctx.target).toBeNull();
  });

  it("refuses an owner-only action to a member", async () => {
    actingMock.mockResolvedValue(member(["view", "edit", "generate", "approve", "share", "delete"]));
    await expect(checkActionAccess({ need: "manage_clients", on: "agency" })).rejects.toThrow(
      "You don't have access to this. Ask your agency owner.",
    );
  });

  it("passes a custom guard through with the acting caller", async () => {
    actingMock.mockResolvedValue(member([]));
    const ctx = await checkActionAccess({ custom: "checks approve itself" });
    expect(ctx.caller.userId).toBe("u1");
    expect(targetMock).not.toHaveBeenCalled();
  });

  // One round trip, not two: the target row does not depend on who is asking.
  it("reads the caller and the target at the same time", async () => {
    let release!: (v: unknown) => void;
    actingMock.mockImplementation(() => new Promise((r) => { release = r; }));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    const pending = checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } });
    await Promise.resolve();
    expect(targetMock).toHaveBeenCalledWith({ canvasId: "cv-1" });
    release(member(["view", "edit"]));
    await expect(pending).resolves.toMatchObject({ target: { clientId: "c-1" } });
  });

  it("hands back the impersonation state it resolved", async () => {
    const impersonation = { isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true };
    actingMock.mockResolvedValue({ ...acting(testOwnerAccess()), impersonation });
    const ctx = await checkActionAccess({ need: "manage_clients", on: "agency" });
    expect(ctx.impersonation).toBe(impersonation);
  });
});
```

Replace the whole of `src/lib/permissions/browser.test.ts` with (this file and `browser.ts` are deleted in Task 7):

```ts
import { describe, it, expect } from "vitest";
import { testAccess, testOwnerAccess } from "./test-fixtures";
import { abilityFromPacked, browserClientScope, canInBrowser, canSeeClientInScope, packAccessRules } from "./browser";

// Task 5 → Task 7 bridge: the six-permission access turned back into the rules the browser reads.
describe("rules sent to the browser", () => {
  it("give the owner every key on every client", () => {
    const ability = abilityFromPacked(JSON.parse(JSON.stringify(packAccessRules(testOwnerAccess(), "org-1"))));
    expect(canInBrowser(ability, "team.edit")).toBe(true);
    expect(canInBrowser(ability, "scripts.delete", "c9")).toBe(true);
  });

  it("give a member the levels they hold, on the clients they can view", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }), "org-1"));
    expect(canInBrowser(ability, "scripts.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "canvases.edit", "c1")).toBe(true);
    expect(canInBrowser(ability, "scripts.edit", "c9")).toBe(false);
    expect(canInBrowser(ability, "scripts.delete", "c1")).toBe(false);
    expect(canInBrowser(ability, "clients.edit")).toBe(false);
  });

  it("refuses a client-scoped key for an empty client id (outside a canvas)", () => {
    const ability = abilityFromPacked(packAccessRules(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }), "org-1"));
    expect(canInBrowser(ability, "scripts.edit", "")).toBe(false);
  });

  it("an empty rule list allows nothing", () => {
    expect(canInBrowser(abilityFromPacked([]), "scripts.view", "c1")).toBe(false);
  });
});

describe("client scope decision", () => {
  it("all sees every client, a list sees only its clients, unknown sees none", () => {
    expect(canSeeClientInScope(browserClientScope("all"), "c9")).toBe(true);
    const some = browserClientScope(["c1", "c2"]);
    expect(canSeeClientInScope(some, "c1")).toBe(true);
    expect(canSeeClientInScope(some, "c9")).toBe(false);
    expect(canSeeClientInScope(browserClientScope(undefined), "c1")).toBe(false);
  });
});
```

`src/lib/permissions/node-area.test.ts`: change the import to `import { approveKeyForNodeType } from "./node-area";`, delete `import { testAccess } from "./test-fixtures";` and delete the last `it("lists the review-queue node types a person can approve somewhere", …)` (the function is gone; the inbox now uses `REVIEWABLE_NODE_TYPES` when the person holds Approve).

`src/lib/api/route-helpers.test.ts`: replace everything from the line `describe("withClient guard (D496)", () => {` to the end of the file with:

```ts
describe("withClient guard (D504)", () => {
  beforeEach(() => {
    callerHolder.access = null;
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("runs the handler when the caller holds the permission on this client", async () => {
    callerHolder.access = testAccess({ permissions: ["view", "edit"], clientIds: ["client-1"] });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withClient(req("POST"), params, { need: "edit" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith("client-1", expect.objectContaining({ id: "client-1" }), expect.objectContaining({ userId: "user-1" }), "org-1");
  });

  it("answers 404 for a client the caller is not on, exactly like a foreign agency", async () => {
    callerHolder.access = testAccess({ permissions: ["view", "edit"], clientIds: ["other-client"] });
    const res = await withClient(req("POST"), params, { need: "edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Client not found." });
  });

  it("answers 404 without View on the client", async () => {
    callerHolder.access = testAccess({ permissions: ["edit"], clientIds: ["client-1"] });
    const res = await withClient(req("GET"), params, { need: "edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
  });

  it("answers 403 with the agreed copy when the permission is missing", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["client-1"] });
    const res = await withClient(req("POST"), params, { need: "edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to this. Ask your agency owner." });
  });

  it("still reads an old area key as its action (until Task 6 renames them)", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["client-1"] });
    const res = await withClient(req("POST"), params, { need: "scripts.edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });

  it("acts as owner while impersonating the client's agency", async () => {
    callerHolder.access = testAccess({ permissions: [], clientIds: [] });
    resolveImpersonationStateMock.mockResolvedValueOnce({ isImpersonating: true, operatorId: "op", targetOrgId: "org-1", elevated: false });
    const res = await withClient(req("GET"), params, { need: "view" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });
});

describe("withNode guard", () => {
  beforeEach(() => {
    callerHolder.access = null;
    nodeOrgIdHolder.orgId = "org-1";
    nodeQueryGate.wait = null;
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("answers 404 for a node on a client the caller is not on", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["someone-else"] });
    const res = await withNode(req("GET"), Promise.resolve({ id: "node-1" }), { need: "view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
  });

  it("refuses a missing Generate with 403", async () => {
    callerHolder.access = testAccess({ permissions: ["view", "edit"], clientIds: ["client-1"] });
    const res = await withNode(req("POST"), Promise.resolve({ id: "node-1" }), { need: "generate" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });
});

describe("withCanvas guard", () => {
  const canvasParams = () => Promise.resolve({ id: "canvas-1" });
  beforeEach(() => {
    callerHolder.access = null;
    nodeOrgIdHolder.orgId = "org-1";
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("hands the handler the canvas, the caller and the agency acted in", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["client-1"] });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withCanvas(req("GET"), canvasParams(), { need: "view" }, handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith("canvas-1", { id: "canvas-1", client_id: "client-1", name: "Reel" }, expect.objectContaining({ userId: "user-1" }), "org-1");
  });

  it("answers 404 for a canvas on a client the caller is not on", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["other-client"] });
    const handler = vi.fn(async () => NextResponse.json({}));
    const res = await withCanvas(req("GET"), canvasParams(), { need: "view" }, handler);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Canvas not found." });
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 404 for another agency's canvas", async () => {
    nodeOrgIdHolder.orgId = "org-2";
    const res = await withCanvas(req("GET"), canvasParams(), { need: "view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
  });

  it("answers 403 with the agreed copy when Edit is missing", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["client-1"] });
    const res = await withCanvas(req("POST"), canvasParams(), { need: "edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to this. Ask your agency owner." });
  });

  it("passes the impersonated agency as the one acted in", async () => {
    nodeOrgIdHolder.orgId = "target-org";
    resolveImpersonationStateMock.mockResolvedValueOnce({ isImpersonating: true, operatorId: "op", targetOrgId: "target-org", elevated: false });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    await withCanvas(req("GET"), canvasParams(), { need: "view" }, handler);
    expect(handler).toHaveBeenCalledWith("canvas-1", expect.anything(), expect.anything(), "target-org");
  });
});

describe("withMoodboard guard", () => {
  beforeEach(() => {
    callerHolder.access = null;
    nodeOrgIdHolder.orgId = "org-1";
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("reads the board's client and hands the handler the caller and the agency acted in", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["client-1"] });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const res = await withMoodboard(req("GET"), "board-1", { need: "view" }, handler);
    expect(res.status).toBe(200);
    expect(selects.moodboards).toContain("client_id");
    expect(handler).toHaveBeenCalledWith("board-1", expect.objectContaining({ userId: "user-1" }), "org-1");
  });

  it("answers 404 for a board on a client the caller is not on", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["other-client"] });
    const res = await withMoodboard(req("GET"), "board-1", { need: "view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Moodboard not found." });
  });

  it("answers 403 with the agreed copy when Edit is missing", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["client-1"] });
    const res = await withMoodboard(req("POST"), "board-1", { need: "edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You don't have access to this. Ask your agency owner." });
  });
});

describe("withAccess", () => {
  beforeEach(() => {
    callerHolder.access = null;
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
  });

  it("allows an owner-only action for the owner", async () => {
    callerHolder.access = testOwnerAccess();
    const res = await withAccess(req("POST"), { need: "manage_clients" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it("refuses an owner-only action to a member with 403", async () => {
    callerHolder.access = testAccess({ permissions: ["view", "edit"], clientIds: ["c-1"] });
    const res = await withAccess(req("POST"), { need: "manage_clients" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });

  it("allows a client action held on at least one client the caller can view", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["c-1"] });
    const res = await withAccess(req("GET"), { need: "view" }, async () => NextResponse.json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it("refuses a client action held nowhere with 403", async () => {
    callerHolder.access = testAccess({ permissions: ["view"], clientIds: ["c-1"] });
    const res = await withAccess(req("POST"), { need: "edit" }, async () => NextResponse.json({}));
    expect(res.status).toBe(403);
  });

  it("answers 404 for someone on no client they can view", async () => {
    callerHolder.access = testAccess({ permissions: [], clientIds: [] });
    const res = await withAccess(req("GET"), { need: "view" }, async () => NextResponse.json({}));
    expect(res.status).toBe(404);
  });
});
```

and change its fixtures import line to `import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";`.

`src/lib/dal-org-resolution.test.ts`: replace the test `it("builds the caller from a designer membership row", …)` with:

```ts
  it("builds the caller's access from a member row", async () => {
    rpcMock.mockResolvedValue({
      data: [testMembershipRow({ org_id: "org-7", is_owner: false, permissions: ["view"], clients: [{ client_id: "c1", permissions: ["view"] }] })],
      error: null,
    });
    const { resolveCallerContext } = await import("@/lib/dal");
    const caller = await resolveCallerContext();
    expect(caller.orgId).toBe("org-7");
    const org = caller.access.orgs.get("org-7");
    expect(org?.isOwner).toBe(false);
    expect(org?.clients.get("c1")?.has("view")).toBe(true);
    // The mocked session is a super admin's (app_metadata.platform_role).
    expect(caller.access.isSuperAdmin).toBe(true);
  });
```

`src/lib/actions/approval.test.ts`:
- `import type { Access } from "@/lib/permissions/access";` → `import type { Access } from "@/lib/permissions/model";`
- In "refuses before any read when the person can approve nothing": `setAccess(testAccess({ permissions: ["view"], clientIds: ["c1"] }));`
- Replace `it("approves a prompt node with image approve, and a video prompt with video approve", …)` with:

```ts
  it("approves any node type with Approve on its client (D507: no areas)", async () => {
    setAccess(testAccess({ permissions: ["view", "approve"], clientIds: ["c1"] }));
    for (const nodeType of ["image-gen", "prompt", "video-gen", "video-prompt", "multishot-prompt", "dubbing"]) {
      stubDb("org-1", { nodeType });
      await expect(setVersionApprovalAction("v1", { status: "approved" })).resolves.toEqual({ ok: true });
    }
  });
```

- Replace `it("refuses approving video for a person who may approve only images", …)` with:

```ts
  it("refuses on a client whose own set lacks Approve (spec §8)", async () => {
    setAccess(testAccess({ permissions: ["view", "approve"], clientIds: [], clients: { c9: ["view", "approve"], c1: ["view"] } }));
    stubDb("org-1");
    await expect(setVersionApprovalAction("v1", { status: "approved" })).resolves.toEqual({
      ok: false,
      error: "You are not permitted to approve or reject work.",
    });
  });
```

- "refuses an image outside the person's clients as not found": `setAccess(testAccess({ permissions: ["view", "approve"], clientIds: ["other-client"] }));`
- "approves an image for a person with image approve" → rename to `"approves for a person with Approve on the client"` and use `setAccess(testAccess({ permissions: ["view", "approve"], clientIds: ["c1"] }));`
- "still enforces the approve gate": `setAccess(testAccess({ permissions: ["view"], clientIds: ["c1"] }), "u2");`

`src/lib/actions/clients.test.ts`:
- Remove `addMemberMock` and `deleteClientMock` from the `vi.hoisted` block and change the `@/lib/db/clients` mock to `vi.mock("@/lib/db/clients", () => ({ createClient: createClientMock }));`.
- Change the fixtures import to `import { testAccess, testAllowAllAccess } from "@/lib/permissions/test-fixtures";`, add `import { PERMISSIONS } from "@/lib/permissions/model";`, and change `function wireGuard(access = testOwnerAccess())` to `function wireGuard(access = testAllowAllAccess())` (these tests act in several agencies).
- Replace `it("rejects when the caller lacks clients.edit", …)` with:

```ts
  it("rejects a member: creating clients is the owner's (manage_clients)", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    resolveOrgIdMock.mockResolvedValue("target-org");
    wireGuard(testAccess({ permissions: [...PERMISSIONS], clientIds: ["c1"], orgId: "target-org" }));
    await expect(createClientAction({ name: "Acme" })).rejects.toThrow("You don't have access to this. Ask your agency owner.");
    expect(createClientMock).not.toHaveBeenCalled();
  });
```

- Delete the four tests about a picked list (`"adds the new client to a picked-list person's own list"`, `"does not touch the list for all-clients access"`, `"rolls the new client back when adding it to the creator's list fails"`, `"surfaces the original error when the rollback delete also fails"`): only the owner creates clients now, and the owner is on every client without a row.

`src/lib/actions/canvases.test.ts`: change `import { testOwnerAccess } …` to `import { testAllowAllAccess } from "@/lib/permissions/test-fixtures";` and `access: testOwnerAccess()` to `access: testAllowAllAccess()` (its caller acts in several agencies).

`src/lib/db/scope-filters.test.ts`: delete `import { testAccess } from "@/lib/permissions/test-fixtures";` and replace the whole `describe("getOrgReviewCounts", …)` block with:

```ts
describe("getOrgReviewCounts", () => {
  const rows = [
    { client_id: "c1", canvas_id: "cv1", pending: 2 },
    { client_id: "c2", canvas_id: "cv2", pending: 5 },
  ];

  it("counts only the clients given (where the person holds Approve)", async () => {
    state.result = { data: rows, error: null };
    const counts = await getOrgReviewCounts("org-1", ["c1"]);
    expect(counts.byClient).toEqual({ c1: 2 });
    expect(counts.byCanvas).toEqual({ cv1: 2 });
  });

  it("counts every client for the owner (null)", async () => {
    state.result = { data: rows, error: null };
    const counts = await getOrgReviewCounts("org-1", null);
    expect(counts.byClient).toEqual({ c1: 2, c2: 5 });
  });

  it("reads the counts with one grouped call", async () => {
    await getOrgReviewCounts("org-1", null);
    expect(calls).toEqual([["rpc", ["org_review_counts", { p_org_id: "org-1" }]]]);
  });

  it("throws when the read fails", async () => {
    state.result = { data: null, error: new Error("boom") };
    await expect(getOrgReviewCounts("org-1", null)).rejects.toThrow("boom");
  });

  it("reads nothing for someone who can approve on no client", async () => {
    const counts = await getOrgReviewCounts("org-1", []);
    expect(calls).toEqual([]);
    expect(counts.total).toBe(0);
  });
});
```

`src/app/api/me/route.test.ts`: `import type { Access } from "@/lib/permissions/access";` → `import type { Access } from "@/lib/permissions/model";`; in "sends no credit figures…" use `m.access = testAccess({ permissions: ["view"], clientIds: ["c1"] });`; in "sends a picked list as ids…" use `m.access = testAccess({ permissions: ["view", "edit"], clientIds: ["c2", "c1"] });` and `expect(me.presetName).toBe("Member");`.

`src/app/api/copilot/scope.test.ts`: `access: testAccess({ permissions: ["view", "generate"], clientIds: ["other-client"] }),`.

`src/components/permissions/__tests__/access-provider.test.tsx`: `const payload = testMePayload(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }));`.

`src/hooks/__tests__/use-identity.test.tsx`: `client.setQueryData(meKeys.current(), testMePayload(testAccess({ permissions: [], clientIds: [] }), { creditsUsed: null }));`.

Test mocks that still set `orgRole` (gone from `CallerContext`; a typed mock such as `vi.mocked(resolveCallerContextOrNull).mockResolvedValueOnce({ …, orgRole: "owner" })` no longer compiles):

```bash
grep -rlE 'orgRole: "(owner|senior|designer)"' src --include=*.test.ts --include=*.test.tsx \
  | xargs sed -i -E 's/, orgRole: "(owner|senior|designer)"//; /^\s*orgRole: "(owner|senior|designer)",\s*$/d'
```

Then find anything still on the old access:

Run: `git grep -nE "permissions/access\"|keys: \[|scopeIds|canAnywhere|canSeeClient\(|denialFor|ownerAccess\(\)|orgRoleToIdentityRole|presetKeyToOrgRole|reviewableNodeTypes|MEDIA_APPROVE_KEYS" -- src vitest.setup.ts`
Expected: no output.

Run: `git grep -nE 'orgRole: "' -- '*.test.ts' '*.test.tsx'`
Expected: no output.

- [ ] **Step 10: Run the tests**

Run each:

```bash
cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm
npx vitest run src/lib
npx vitest run src/app
npx vitest run src/components
npx vitest run src/hooks
```

Expected: PASS, apart from the two known "refuses a deprecated model" failures.

Run: `npx tsc --noEmit`
Expected: only the known line.

Run: `npx eslint src/lib/permissions src/lib/dal.ts src/lib/dal-logic.ts src/lib/api/route-helpers.ts src/lib/db/review.ts src/lib/db/clients.ts src/lib/review/queue.ts src/lib/actions/approval.ts src/lib/actions/clients.ts src/lib/me "src/app/(home)/page.tsx" "src/app/clients/[id]/(canvases)/page.tsx" "src/app/clients/[id]/canvases/[cid]/(canvas)/page.tsx" src/app/api/moodboards/route.ts src/app/api/review vitest.setup.ts`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add -A src vitest.setup.ts
git commit -m "feat(permissions): the server decides with six permissions from get_membership_access (D500, D504)"
git log -1 --format=%B
```

---

### Task 6: Every route, action and page names a plain action

**Files:**
- Modify: every file with a `need: "<area>.<level>"` or a page `need` (≈150 route files, `src/lib/actions/{approval,canvas-lock,canvases,clients,eval,kb,nodes}.ts`, 11 page files, and the tests that pass a `need`), `src/lib/api/route-helpers.ts`, `src/lib/permissions/action-guard.ts`, `src/lib/permissions/page.ts`, `src/lib/permissions/not-yet-checked.ts`
- Delete: `src/lib/permissions/legacy-need.ts`, `src/lib/permissions/legacy-need.test.ts`
- Test: `src/lib/permissions/route-coverage.test.ts`, `src/lib/actions/with-action-coverage.test.ts` (both rewritten for actions)

**Interfaces:**
- Consumes: `isAction`, `ACTIONS`, `type Action`, `type Permission` (Task 1).
- Produces: `Guard = { need: Action }`; `ActionGuard = { need: Action; on: ActionTarget } | { custom: string }`; `loadClientPage(slug: string, need: Permission)`, `loadCanvasPage(canvasId: string, need: Permission)`; `NOT_YET_CHECKED: Partial<Record<Action, string>>` holding only `manage_team` (plan 4 uses it).

Spec §4.3's table, applied mechanically: `*.view` → `view`; `*.edit` → `edit`; `*.generate` → `generate`; `*.approve` → `approve`; `*.share` → `share`; `*.delete` → `delete`; `clients.edit` and `clients.delete` → `manage_clients`. Two exceptions, both "team replies" and cut upload under Client review: the reply route and the cut-upload sign route name `share`. `market.delete` (a signal, a tracked handle) stays `delete`: a whole item in the client's market library.

- [ ] **Step 1: Rewrite the coverage tests (they fail on every old key)**

In `src/lib/permissions/route-coverage.test.ts`: change `import { isPermissionKey } from "./catalogue";` to `import { isAction } from "./model";`, the comment above `ALLOWLIST` to `// D496/D504: every API handler names its action through a chokepoint or withAccess, or is on this` (keep the second comment line), and replace `GUARDED_RE` and the two `expect` lines inside the loop with:

```ts
const GUARDED_RE = /\b(withClient|withCanvas|withNode|withMoodboard|withAccess)\s*\([^]*?need:\s*"([a-z_.]+)"/;
```

```ts
        expect(m, "calls a chokepoint or withAccess with { need }").not.toBeNull();
        expect(isAction(m![2]), `"${m![2]}" is one of the nine actions`).toBe(true);
```

and the `describe` title to `"every API handler declares an action (D496, D504)"`.

In `src/lib/actions/with-action-coverage.test.ts`: replace the two permission imports with

```ts
import { ACTIONS, isAction } from "@/lib/permissions/model";
import { NOT_YET_CHECKED } from "@/lib/permissions/not-yet-checked";
```

replace `GUARD_RE` with

```ts
const GUARD_RE = /withAction\(\s*"[^"]+"\s*,\s*\{\s*(need:\s*"([a-z_.]+)"|custom:\s*")/;
```

change `if (match && match[2]) expect(isPermissionKey(match[2])).toBe(true);` to `if (match && match[2]) expect(isAction(match[2]), \`"${match[2]}" is one of the nine actions\`).toBe(true);`, and replace the last test (`it("every catalogue key is checked …", …)`) with:

```ts
it("every action is checked by a route, an action or a page", () => {
  const sources = [
    ...collect("src/app/api", "route.ts"),
    ...collect("src/lib/actions", ".ts"),
    ...collect("src/app/clients", "page.tsx"),
    // view_credits decides whether /api/me and the first render carry credit figures at all.
    "src/lib/me/payload.ts",
  ].map((f) => readFileSync(f, "utf8"));
  const pattern = new RegExp(`"(${ACTIONS.join("|")})"`, "g");
  const used = new Set(sources.flatMap((s) => [...s.matchAll(pattern)].map((m) => m[1])));
  const missing = ACTIONS.filter((a) => !used.has(a) && !(a in NOT_YET_CHECKED));
  expect(missing).toEqual([]);
});
```

Replace the whole of `src/lib/permissions/not-yet-checked.ts` with:

```ts
import type { Action } from "./model";

// Actions no server check uses yet, with the plan that adds the check. Remove an entry when its
// check ships; with-action-coverage.test.ts's "every action is checked" test then holds it to it.
export const NOT_YET_CHECKED: Partial<Record<Action, string>> = {
  manage_team: "Team page and client Members, plan 4",
};
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions/route-coverage.test.ts src/lib/actions/with-action-coverage.test.ts`
Expected: FAIL, one failure per handler or action still naming an area key (`"scripts.view" is one of the nine actions`).

- [ ] **Step 3: Rename every `need`**

```bash
cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm
files=$(git grep -lE 'need: "[a-z_]+\.(view|edit|generate|approve|share|delete)"|(loadClientPage|loadCanvasPage)\([A-Za-z]+, "[a-z_]+\.[a-z]+"\)' -- src)
sed -i -E \
  -e 's/need: "clients\.(edit|delete)"/need: "manage_clients"/g' \
  -e 's/need: "[a-z_]+\.(view|edit|generate|approve|share|delete)"/need: "\1"/g' \
  -e 's/(loadClientPage|loadCanvasPage)\(([A-Za-z]+), "[a-z_]+\.(view|edit)"\)/\1(\2, "\3")/g' \
  $files
```

The two exceptions (team replies and the cut upload are Share, spec §2.1):
- `src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies/route.ts`: `{ need: "edit" }` → `{ need: "share" }`.
- `src/app/api/nodes/[id]/client-review/sign/route.ts`: `{ need: "edit" }` → `{ need: "share" }`.

Run: `git grep -nE '"[a-z_]+\.(view|edit|generate|approve|share|delete)"' -- src/app src/lib/actions src/lib/api src/lib/permissions/page.ts`
Expected: no output.

- [ ] **Step 4: Remove the bridge**

`git rm src/lib/permissions/legacy-need.ts src/lib/permissions/legacy-need.test.ts`

`src/lib/api/route-helpers.ts`: replace `import { actionForNeed, type Need } from "@/lib/permissions/legacy-need";` with `import type { Action } from "@/lib/permissions/model";`; `export type Guard = { need: Need };` → `export type Guard = { need: Action };`; and `decide` becomes:

```ts
function decide(acting: ActingCaller, need: Action, clientId: string | null): Decision {
  return check(accessOf(acting.caller), need, { orgId: acting.effectiveOrgId, clientId });
}
```

`src/lib/permissions/action-guard.ts`: replace `import { actionForNeed, type Need } from "./legacy-need";` with `import type { Action } from "./model";`, `{ need: Need; on: ActionTarget }` → `{ need: Action; on: ActionTarget }`, and `const action = actionForNeed(guard.need);` → `const action = guard.need;`.

`src/lib/permissions/page.ts`: replace `import { actionForNeed, type Need } from "./legacy-need";` with `import type { Permission } from "./model";`, both `need: Need` → `need: Permission`, and both `actionForNeed(need)` → `need`.

`src/lib/api/route-helpers.test.ts`: delete the test `it("still reads an old area key as its action (until Task 6 renames them)", …)`.

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/lib
npx vitest run src/app
```

Expected: PASS apart from the two known failures. The two coverage tests pass.

Run: `npx tsc --noEmit` (only the known line) and `npx eslint src/lib/api/route-helpers.ts src/lib/permissions src/lib/actions`.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "refactor(permissions): routes, actions and pages name plain actions (spec 4.3)"
git log -1 --format=%B
```

---

### Task 7: The browser runs the same `check()`

`/api/me` sends the six-permission shape. `AccessProvider` builds one `Access` per payload and puts it in context; `useCan` calls `check`. CASL leaves the browser. The profile menu shows Owner or Member (plan 2 Task 11), and the ledger's minors are fixed: `/api/me` uses `withQuietErrors`, the me query never retries a 4xx, and an empty client id fails closed.

**Files:**
- Create: `src/lib/me/access.ts`, `src/lib/me/access.test.ts`, `src/components/permissions/access-context.tsx`, `src/components/permissions/test-access-provider.tsx`
- Modify: `src/lib/me/types.ts`, `src/lib/me/payload.ts`, `src/lib/me/test-fixtures.ts`, `src/app/api/me/route.ts`, `src/hooks/queries/me.ts`, `src/components/permissions/access-provider.tsx`, `src/components/permissions/use-can.ts`, `src/components/permissions/gated-button.tsx`, `src/components/permissions/use-can-approve-node.ts`, `src/components/nodes/generate-footer.tsx`, `src/hooks/use-identity.ts`, `src/lib/identity.ts`, `src/components/identity/profile-popover.tsx`, and every `useCan("<area>.<level>"` / `need="<area>.generate"` call site (see Step 5)
- Delete: `src/lib/permissions/ability.ts`, `src/lib/permissions/browser.ts`, `src/lib/permissions/browser.test.ts` (the CASL rules the browser no longer reads), `src/components/permissions/client-scope.ts`, `src/components/permissions/test-ability-provider.tsx`, `src/lib/identity.test.ts` (it tested the localStorage helpers `identity.ts` marked unused and safe to delete)
- Tests rewritten: `src/lib/me/payload.test.ts`, `src/app/api/me/route.test.ts`, `src/hooks/queries/__tests__/me.test.ts`, `src/hooks/__tests__/use-identity.test.tsx`, `src/components/permissions/__tests__/access-provider.test.tsx`, `gated-button.test.tsx`, `use-can-approve-node.test.tsx`, `src/components/nodes/__tests__/generate-footer.test.tsx`, `dubbing-controls.test.tsx`, `src/components/script-review/__tests__/review-actions.test.tsx`, `team-review-board.test.tsx`, `src/components/identity/__tests__/profile-popover.test.tsx` (new)

**Interfaces:**
- Consumes: `check`, `buildOrgAccess`, `NO_ACCESS`, `orderedPermissions`, `type Access`, `type Action`, `type Permission`; `ApiError` from `src/services/read-json.ts`.
- Produces: `MePayload = { name: string; platformRole: PlatformRole; orgId: string; orgName: string | null; isOwner: boolean; accessGiven: boolean; permissions: Permission[]; clients: { clientId: string; permissions: Permission[] }[]; creditsUsed: number | null; monthlyCreditLimit: number | null }`; `accessFromMe(me: MePayload): Access`; `type BrowserAccess = { access: Access; orgId: string }`; `AccessContext`; `useCan(action: Action, clientId?: string): boolean`; `TestAccessProvider({ permissions?: readonly Permission[]; clientIds?: readonly string[]; children })` (no `permissions` = the owner); `testMePayload(over?: Partial<MePayload>): MePayload`; `useIdentity()` returning `{ identity, hydrated, platformRole, orgId, orgName, isOwner: boolean | null, creditsUsed, monthlyCreditLimit }`; `Identity = { name: string }`; `GatedButton` and `GenerateFooter` with `need: Action`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/me/access.test.ts
import { describe, it, expect } from "vitest";
import { check } from "@/lib/permissions/check";
import { accessFromMe } from "./access";
import { testMePayload } from "./test-fixtures";

// D504: the browser builds the same Access the server checked, from what /api/me sent.
describe("accessFromMe", () => {
  it("answers each client the way its row says", () => {
    const access = accessFromMe(testMePayload({
      permissions: ["view", "edit"],
      clients: [{ clientId: "c1", permissions: ["view", "edit"] }, { clientId: "c2", permissions: ["view"] }],
    }));
    expect(check(access, "edit", { orgId: "org-1", clientId: "c1" })).toBe("allow");
    expect(check(access, "edit", { orgId: "org-1", clientId: "c2" })).toBe("forbidden");
    expect(check(access, "view", { orgId: "org-1", clientId: "c3" })).toBe("not_found");
  });

  it("gives the owner everything and a waiting person nothing", () => {
    expect(check(accessFromMe(testMePayload({ isOwner: true, clients: [] })), "manage_team", { orgId: "org-1", clientId: null })).toBe("allow");
    expect(check(accessFromMe(testMePayload({ accessGiven: false })), "view", { orgId: "org-1", clientId: "c1" })).toBe("not_found");
  });

  it("lets a super admin through, as the server does", () => {
    expect(check(accessFromMe(testMePayload({ platformRole: "super_admin", clients: [] })), "delete", { orgId: "org-1", clientId: "c9" })).toBe("allow");
  });
});
```

Replace the whole of `src/components/permissions/__tests__/access-provider.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/clients/acme" }));
const fetchMe = vi.fn();
vi.mock("@/services/me.service", () => ({ fetchMe: () => fetchMe() }));

import { AccessProvider } from "../access-provider";
import { useCan } from "../use-can";
import { useIdentity } from "@/hooks/use-identity";
import { meKeys } from "@/hooks/queries/me";
import { testMePayload } from "@/lib/me/test-fixtures";

function Probe() {
  const { identity } = useIdentity();
  const answers = [
    useCan("edit", "c1"),
    useCan("edit", "c9"),
    useCan("generate", "c1"),
    useCan("view", "c1"),
    useCan("view", ""),
    useCan("manage_team"),
  ];
  return <p>{[identity?.name, ...answers].join("|")}</p>;
}

// The app's own client defaults (src/components/layout/query-provider.tsx).
const appClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });

describe("AccessProvider", () => {
  beforeEach(() => fetchMe.mockReset());

  it("answers on the first render from the server payload, with no request", () => {
    const client = appClient();
    const payload = testMePayload({ permissions: ["view", "edit"], clients: [{ clientId: "c1", permissions: ["view", "edit"] }] });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AccessProvider initial={payload}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    // An empty client id is what useClientId() returns outside a canvas: it fails closed.
    expect(html).toContain("Arun|true|false|false|true|false|false");
    expect(fetchMe).not.toHaveBeenCalled();
    expect(client.getQueryCache().find({ queryKey: meKeys.current() })?.isStaleByTime(30_000)).toBe(false);
  });

  it("allows nothing before anything is known", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={appClient()}>
        <AccessProvider initial={null}><Probe /></AccessProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("|false|false|false|false|false|false");
  });
});
```

Add to `src/hooks/queries/__tests__/me.test.ts` (and change both `testMePayload(testOwnerAccess())` calls to `testMePayload()` / `testMePayload({ name: "Fresh" })`, deleting the `testOwnerAccess` import):

```ts
import { ApiError } from "@/services/read-json";

describe("meQueryOptions retry", () => {
  const retry = meQueryOptions().retry as (failureCount: number, error: Error) => boolean;

  it("never retries a refused or missing answer (4xx)", () => {
    expect(retry(0, new ApiError("Password change required", 403))).toBe(false);
    expect(retry(0, new ApiError("Unauthorized", 401))).toBe(false);
  });

  it("retries a failure that may pass once", () => {
    expect(retry(0, new ApiError("Could not load your account.", 500))).toBe(true);
    expect(retry(0, new Error("network"))).toBe(true);
    expect(retry(1, new Error("network"))).toBe(false);
  });
});
```

```tsx
// src/components/identity/__tests__/profile-popover.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The popover's content is portaled and unmounted while closed, so static markup can't show it;
// this pins the facts in its source (plan 2 Task 11's test, for the six-permission model).
describe("ProfilePopover", () => {
  const source = readFileSync("src/components/identity/profile-popover.tsx", "utf8");

  it("shows Owner or Member in the workspace row, never a preset or old role", () => {
    expect(source).toContain('isOwner ? "Owner" : "Member"');
    expect(source).not.toMatch(/ROLE_LABELS|orgRole|presetName|Senior|Designer/);
  });

  it("opens the credits channel only when credit figures are shown (the owner)", () => {
    expect(source).toMatch(/if \(!hydrated \|\| !orgId \|\| !showCredits\) return;/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/me src/components/permissions src/components/identity src/hooks/queries`
Expected: FAIL (`./access` does not exist; `testMePayload` takes an access; the popover still has `ROLE_LABELS`; `retry` is not a function).

- [ ] **Step 3: The payload, its builder and `/api/me`**

Replace the whole of `src/lib/me/types.ts` with:

```ts
// src/lib/me/types.ts
import type { PlatformRole } from "@/lib/dal-logic";
import type { Permission } from "@/lib/permissions/model";

/** What /api/me returns and the root layout hands the browser (spec §5). */
export type MePayload = {
  name: string;
  platformRole: PlatformRole;
  /** The agency being acted in (the impersonated one while impersonating). */
  orgId: string;
  orgName: string | null;
  isOwner: boolean;
  /** False while the person has signed up and waits for the owner. */
  accessGiven: boolean;
  /** The agency-level set, in canonical order. */
  permissions: Permission[];
  /** Each client the person is on, with the effective set there. Empty for the owner. */
  clients: { clientId: string; permissions: Permission[] }[];
  /** Both null without view_credits (only the owner and a super admin see credits). */
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
};
```

Replace the whole of `src/lib/me/payload.ts` with:

```ts
// src/lib/me/payload.ts
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getOrgById, getOrgCreditUsage } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import { check } from "@/lib/permissions/check";
import { orderedPermissions } from "@/lib/permissions/model";
import { accessOf, resolveActingCallerOrNull, type ActingCaller } from "@/lib/permissions/server";
import type { MePayload } from "./types";

// One builder for /api/me and the root layout, so the first HTML and every refetch carry the
// same thing. The reads run in parallel; the credit read runs only for someone who may see it.
export async function buildMePayload({ caller, effectiveOrgId }: ActingCaller): Promise<MePayload> {
  const access = accessOf(caller);
  const org = access.orgs.get(effectiveOrgId);
  const showCredits = check(access, "view_credits", { orgId: effectiveOrgId, clientId: null }) === "allow";
  const [name, orgRow, creditsUsed] = await Promise.all([
    getDisplayName(caller.userId),
    getOrgById(effectiveOrgId),
    showCredits ? getOrgCreditUsage(effectiveOrgId) : Promise.resolve(null),
  ]);
  return {
    name: name ?? "User",
    platformRole: caller.platformRole,
    orgId: effectiveOrgId,
    orgName: orgRow?.name ?? null,
    isOwner: org?.isOwner ?? false,
    accessGiven: org?.accessGiven ?? false,
    permissions: org ? orderedPermissions(org.permissions) : [],
    clients: org
      ? [...org.clients]
          .map(([clientId, set]) => ({ clientId, permissions: orderedPermissions(set) }))
          .sort((a, b) => a.clientId.localeCompare(b.clientId))
      : [],
    creditsUsed,
    monthlyCreditLimit: showCredits ? (orgRow?.monthly_credit_limit ?? null) : null,
  };
}

// For the root layout. A failure here must not take every page down: the layout passes null and
// the browser fetches /api/me on mount. The server still refuses what it must, and a failed access
// read on a page is that page's error, never "no access" (spec §4.1).
export async function loadInitialMe(): Promise<MePayload | null> {
  try {
    const acting = await resolveActingCallerOrNull();
    return acting ? await buildMePayload(acting) : null;
  } catch (e) {
    unstable_rethrow(e);
    console.error("[layout] could not load the access payload; the browser will fetch it", e);
    return null;
  }
}
```

```ts
// src/lib/me/access.ts
import { buildOrgAccess, type Access } from "@/lib/permissions/model";
import type { MePayload } from "./types";

// D504: the browser builds the same Access the server checked, from what /api/me sent, and runs
// the same check() on it. userId is not sent: no check reads it.
export function accessFromMe(me: MePayload): Access {
  return {
    userId: "",
    isSuperAdmin: me.platformRole === "super_admin",
    orgs: new Map([
      [
        me.orgId,
        buildOrgAccess({
          orgId: me.orgId,
          orgName: me.orgName ?? "",
          isOwner: me.isOwner,
          accessGiven: me.accessGiven,
          permissions: me.permissions,
          clients: me.clients,
        }),
      ],
    ]),
  };
}
```

Replace the whole of `src/lib/me/test-fixtures.ts` with:

```ts
// src/lib/me/test-fixtures.ts
import type { MePayload } from "./types";

/** A member of org-1 with View on c1, unless `over` says otherwise. */
export function testMePayload(over: Partial<MePayload> = {}): MePayload {
  return {
    name: "Arun",
    platformRole: "member",
    orgId: "org-1",
    orgName: "Yuvabe Studios",
    isOwner: false,
    accessGiven: true,
    permissions: ["view"],
    clients: [{ clientId: "c1", permissions: ["view"] }],
    creditsUsed: null,
    monthlyCreditLimit: null,
    ...over,
  };
}
```

`src/app/api/me/route.ts`: change the import to `import { apiOk, withQuietErrors } from "@/lib/api/route-helpers";` and the body to:

```ts
export async function GET() {
  const acting = await resolveActingCaller();
  // A failure is shown as plain copy, never a database message (AGENTS.md: plain user-facing copy).
  return withQuietErrors("Could not load your account.", async () => apiOk(await buildMePayload(acting)));
}
```

`src/hooks/queries/me.ts`: add `import { ApiError } from "@/services/read-json";` and inside `meQueryOptions`'s `queryOptions({ … })` add, after `refetchOnWindowFocus: true,`:

```ts
    // A 4xx (a password change owed, a signed-out session) won't pass on a second try; anything
    // else gets the app's one retry.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
```

- [ ] **Step 4: One `Access` in context; `useCan` runs `check`**

```tsx
// src/components/permissions/access-context.tsx
"use client";

import { createContext } from "react";
import { NO_ACCESS, type Access } from "@/lib/permissions/model";

/** The person's access and the agency they act in: built once per /api/me payload. */
export type BrowserAccess = { access: Access; orgId: string };

export const AccessContext = createContext<BrowserAccess>({ access: NO_ACCESS, orgId: "" });
```

Replace the whole of `src/components/permissions/access-provider.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateMe, meKeys, useMe } from "@/hooks/queries/me";
import { onAccessDenied } from "@/lib/permissions/access-signal";
import { accessFromMe } from "@/lib/me/access";
import { NO_ACCESS } from "@/lib/permissions/model";
import type { MePayload } from "@/lib/me/types";
import { AccessContext, type BrowserAccess } from "./access-context";

// D504. The root layout hands over the payload it built for this request; it seeds the me query
// (so the first render already shows the right buttons, with no request) and becomes the ONE
// Access for the whole app. Components read it from context (performance rules 1 and 2).
export function AccessProvider({ initial, children }: { initial: MePayload | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data } = useMe(initial ?? undefined);

  // Structural sharing keeps `data` the same object until /api/me really changes, so an unchanged
  // refetch builds nothing and re-renders no reader.
  const value = useMemo<BrowserAccess>(
    () => (data ? { access: accessFromMe(data), orgId: data.orgId } : { access: NO_ACCESS, orgId: "" }),
    [data],
  );

  // A newer server payload (router.refresh(), a soft navigation after signing in) wins.
  const seeded = useRef(initial);
  useEffect(() => {
    if (!initial || initial === seeded.current) return;
    seeded.current = initial;
    queryClient.setQueryData(meKeys.current(), initial);
  }, [initial, queryClient]);

  useEffect(() => onAccessDenied(() => void invalidateMe(queryClient)), [queryClient]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
```

Replace the whole of `src/components/permissions/use-can.ts` with:

```ts
"use client";

import { useContext } from "react";
import { check } from "@/lib/permissions/check";
import type { Action } from "@/lib/permissions/model";
import { AccessContext } from "./access-context";

// Every browser check: what to SHOW, never what to permit (the server runs the same check()).
// One Access in context; a check is a Map lookup, so a canvas drag never re-renders a gated
// component.

/** With a client: that client. Without: on at least one client (nav, tabs), or an owner-only
 *  action. An empty client id is what useClientId() returns outside a canvas: it fails closed. */
export function useCan(action: Action, clientId?: string): boolean {
  const { access, orgId } = useContext(AccessContext);
  if (clientId === "") return false;
  return check(access, action, { orgId, clientId: clientId ?? null }) === "allow";
}
```

```tsx
// src/components/permissions/test-access-provider.tsx
"use client";

import type { ReactNode } from "react";
import type { Permission } from "@/lib/permissions/model";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { AccessContext } from "./access-context";

/** For component tests: no `permissions` = the owner of org-1 (everything); otherwise a member
 *  of org-1 with `permissions` on `clientIds` (default ["c1"]). */
export function TestAccessProvider({
  permissions,
  clientIds = ["c1"],
  children,
}: {
  permissions?: readonly Permission[];
  clientIds?: readonly string[];
  children: ReactNode;
}) {
  const access = permissions === undefined ? testOwnerAccess("org-1") : testAccess({ permissions, clientIds });
  return <AccessContext.Provider value={{ access, orgId: "org-1" }}>{children}</AccessContext.Provider>;
}
```

`src/components/permissions/gated-button.tsx`: replace `import type { PermissionKey } from "@/lib/permissions/catalogue";` with `import type { Action } from "@/lib/permissions/model";` and `need: PermissionKey;` with `need: Action;`; change the comment `// D499 §6.4, "one wrapper per pattern"` to `// Spec §5, "one wrapper per pattern"`.

`src/components/nodes/generate-footer.tsx`: replace `import type { PermissionKey } from "@/lib/permissions/catalogue";` with `import type { Action } from "@/lib/permissions/model";`, and the prop doc and type with `/** The permission this button needs: Generate (spec §5). */` and `need: Action;`.

Replace the whole of `src/components/permissions/use-can-approve-node.ts` with (Task 8 moves its four callers onto the canvas's permissions and deletes it):

```ts
"use client";

import { useClientId } from "@/components/canvas/client-id-context";
import { useCan } from "./use-can";

// D507: Approve / Request changes show with Approve on the canvas's client, for every node type.
export function useCanApproveNode(nodeType: string): boolean {
  void nodeType; // one Approve for every node type now; the argument goes in Task 8
  return useCan("approve", useClientId());
}
```

Delete what the browser no longer reads:

```bash
git rm src/lib/permissions/ability.ts src/lib/permissions/browser.ts src/lib/permissions/browser.test.ts \
  src/components/permissions/client-scope.ts src/components/permissions/test-ability-provider.tsx
```

- [ ] **Step 5: Call sites name plain actions**

```bash
cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm
files=$(git grep -lE 'useCan\("[a-z_]+\.[a-z]+"|need="[a-z_]+\.generate"' -- src/components src/hooks ':!*.test.tsx')
sed -i -E \
  -e 's/useCan\("clients\.(edit|delete)"/useCan("manage_clients"/g' \
  -e 's/useCan\("[a-z_]+\.(view|edit|generate|approve|share|delete)"/useCan("\1"/g' \
  -e 's/need="[a-z_]+\.generate"/need="generate"/g' \
  $files
```

That covers `canvas.tsx`, `client-feedback-drawer.tsx`, `copilot-composer.tsx`, `canvases-table.tsx`, `client-row-actions.tsx`, `clients-home-tabs.tsx`, `editor-export-button.tsx`, `editor-shell.tsx`, `review-inbox.tsx`, `use-review-counts.ts`, `client-review-node.tsx`, `review-actions.tsx`, `generate-script-pane.tsx`, `visualise-view.tsx` and the ten `GatedButton` / `GenerateFooter` call sites. In each file the sed touched, update a comment on the lines around the change that still names an old key (for example `// D499: without canvases.edit the canvas is view only` → `// Spec §5: without Edit the canvas is view only`).

Run: `git grep -nE 'useCan\("[a-z_]+\.|need="[a-z_]+\.|useAppAbility|@casl|ClientScopeContext|TestAbilityProvider' -- src ':!*.test.ts' ':!*.test.tsx'`
Expected: no output.

- [ ] **Step 6: Identity and the profile menu**

Replace the whole of `src/lib/identity.ts` with:

```ts
// The signed-in person's display name, from the session via /api/me (useIdentity()). What they
// may do is their Access (D504), never here. Use this to decide what to RENDER, never what to
// permit: the server checks every route and action.
export type Identity = { name: string };
```

`git rm src/lib/identity.test.ts`

Replace the whole of `src/hooks/use-identity.ts` with:

```ts
"use client";

import { useMemo } from "react";
import { useMe } from "@/hooks/queries/me";
import type { Identity } from "@/lib/identity";
import type { PlatformRole } from "@/lib/dal-logic";

// The signed-in person, read from the one /api/me query. Kept as a hook so its consumers don't
// change. `hydrated` is false until something is known (a seeded payload, a fetch result or a
// failed fetch); until then the nulls mean "not checked yet". What the person may do is useCan().
export function useIdentity(): {
  identity: Identity | null;
  hydrated: boolean;
  platformRole: PlatformRole | null;
  orgId: string | null;
  orgName: string | null;
  isOwner: boolean | null;
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
} {
  const { data, status } = useMe();
  return useMemo(
    () => ({
      identity: data ? { name: data.name } : null,
      hydrated: status !== "pending",
      platformRole: data?.platformRole ?? null,
      orgId: data?.orgId ?? null,
      orgName: data?.orgName ?? null,
      isOwner: data?.isOwner ?? null,
      creditsUsed: data?.creditsUsed ?? null,
      monthlyCreditLimit: data?.monthlyCreditLimit ?? null,
    }),
    [data, status],
  );
}
```

`src/components/identity/profile-popover.tsx`:
- Delete `import type { OrgRole } from "@/lib/dal-logic";` and the `ROLE_LABELS` constant.
- Change the comment above the component: `name, real role, credits, workspace and sign out` → `name, credits, the workspace with Owner or Member, and sign out`.
- Replace the destructure with:

```tsx
  const { hydrated, identity, orgId, orgName, isOwner, creditsUsed, monthlyCreditLimit } =
    useIdentity();
  // Null without view_credits: the server sends no figures to anyone but the owner, and nothing
  // listens for them.
  const showCredits = creditsUsed !== null;
```

- In the realtime effect: `if (!hydrated || !orgId) return;` → `if (!hydrated || !orgId || !showCredits) return;` and `}, [hydrated, orgId]);` → `}, [hydrated, orgId, showCredits]);`.
- Delete the role line under the name (`{orgRole && ( <span …>{ROLE_LABELS[orgRole]}</span> )}`).
- Replace `<span className="text-base font-medium text-foreground">{orgName ?? "—"}</span>` in the Workspace block with:

```tsx
          <div className="flex flex-col">
            <span className="text-base font-medium text-foreground">{orgName ?? "Your agency"}</span>
            {isOwner !== null && (
              <span className="text-sm text-muted-foreground">{isOwner ? "Owner" : "Member"}</span>
            )}
          </div>
```

Run: `git grep -n "orgRole" -- src ':!src/app/admin' ':!src/lib/actions/admin.ts' ':!src/lib/db/organizations.ts' ':!src/lib/orgs' ':!src/lib/actions/approval.test.ts'`
Expected: no output (`approval.test.ts` keeps its own `caller(orgRole)` helper parameter; the admin screens write `org_role` until plan 4).

- [ ] **Step 7: Rewrite the remaining tests on the new payload and provider**

Replace the whole of `src/lib/me/payload.test.ts` with:

```ts
// src/lib/me/payload.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ caller: null as unknown, failOrg: false }));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(),
  resolveCallerContextOrNull: vi.fn(async () => m.caller),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/organizations", () => ({
  getOrgById: vi.fn(async () => {
    if (m.failOrg) throw new Error("db down");
    return { id: "org-1", name: "Yuvabe Studios", slug: "y", monthly_credit_limit: null, created_at: "t" };
  }),
  getOrgCreditUsage: vi.fn(async () => 0),
}));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => null) }));

import { testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { loadInitialMe } from "./payload";

const signedIn = () => ({ userId: "u1", email: null, platformRole: "member", orgId: "org-1", mustChangePassword: false, access: testOwnerAccess() });

describe("loadInitialMe", () => {
  it("is null with nobody signed in", async () => {
    m.caller = null;
    expect(await loadInitialMe()).toBeNull();
  });

  it("builds the payload for a signed-in owner, naming them User without a profile", async () => {
    m.caller = signedIn();
    m.failOrg = false;
    expect(await loadInitialMe()).toMatchObject({ name: "User", isOwner: true, accessGiven: true, clients: [], creditsUsed: 0 });
  });

  it("is null, not an error, when a read fails", async () => {
    m.caller = signedIn();
    m.failOrg = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadInitialMe()).toBeNull();
    err.mockRestore();
  });
});
```

In `src/app/api/me/route.test.ts`: delete the `@/lib/db/presets` mock and the `abilityFromPacked, canInBrowser` import; add `import { check } from "@/lib/permissions/check";` and `import { accessFromMe } from "@/lib/me/access";`; change `getOrgById` in the `@/lib/db/organizations` mock to `getOrgById: m.getOrgById,` with `getOrgById: vi.fn(async () => ({ id: "org-1", name: "Yuvabe Studios", slug: "y", monthly_credit_limit: 1000, created_at: "t" })),` added to `vi.hoisted`; and replace the `describe("GET /api/me", …)` block with:

```ts
describe("GET /api/me", () => {
  beforeEach(() => {
    m.getOrgCreditUsage.mockClear();
    m.access = undefined;
  });

  it("sends the owner's agency, owner flag and credit figures", async () => {
    m.access = testOwnerAccess();
    const me = await body();
    expect(me).toMatchObject({
      name: "Arun",
      orgId: "org-1",
      orgName: "Yuvabe Studios",
      isOwner: true,
      accessGiven: true,
      clients: [],
      creditsUsed: 42,
      monthlyCreditLimit: 1000,
    });
    expect(check(accessFromMe(me), "manage_team", { orgId: "org-1", clientId: null })).toBe("allow");
  });

  it("sends no credit figures, and reads none, to a member", async () => {
    m.access = testAccess({ permissions: ["view"], clientIds: ["c1"] });
    const me = await body();
    expect(me.creditsUsed).toBeNull();
    expect(me.monthlyCreditLimit).toBeNull();
    expect(m.getOrgCreditUsage).not.toHaveBeenCalled();
  });

  it("sends each client with its permissions, sorted, and the browser decides the same", async () => {
    m.access = testAccess({ permissions: ["view", "edit"], clientIds: ["c2", "c1"] });
    const me = await body();
    expect(me.isOwner).toBe(false);
    expect(me.permissions).toEqual(["view", "edit"]);
    expect(me.clients).toEqual([
      { clientId: "c1", permissions: ["view", "edit"] },
      { clientId: "c2", permissions: ["view", "edit"] },
    ]);
    const browser = accessFromMe(me);
    expect(check(browser, "edit", { orgId: "org-1", clientId: "c1" })).toBe("allow");
    expect(check(browser, "edit", { orgId: "org-1", clientId: "c3" })).toBe("not_found");
  });

  it("answers a failed read with plain copy", async () => {
    m.access = testOwnerAccess();
    m.getOrgById.mockRejectedValueOnce(new Error("relation organizations does not exist"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not load your account." });
    err.mockRestore();
  });
});
```

`src/hooks/__tests__/use-identity.test.tsx`: delete the `testAccess` import; change the Probe line to `const { identity, hydrated, orgName, isOwner, creditsUsed } = useIdentity();` and `return <p>{[identity?.name, hydrated, orgName, isOwner, creditsUsed].join("|")}</p>;`; seed with `testMePayload({ creditsUsed: null })`; expect `"Arun|true|Yuvabe Studios|false|"`.

Replace the whole of `src/components/permissions/__tests__/gated-button.test.tsx` with:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Permission } from "@/lib/permissions/model";
import { GatedButton, GENERATE_OFF_REASON } from "../gated-button";
import { TestAccessProvider } from "../test-access-provider";

const render = (permissions: readonly Permission[], props: { disabled?: boolean; disabledReason?: string | null } = {}, clientId = "c1") =>
  renderToStaticMarkup(
    <TestAccessProvider permissions={permissions} clientIds={["c1"]}>
      <GatedButton need="generate" clientId={clientId} {...props}>Generate image</GatedButton>
    </TestAccessProvider>,
  );

describe("GatedButton", () => {
  it("is a plain enabled button when the person may generate", () => {
    const html = render(["view", "generate"]);
    expect(html).toMatch(/<button(?![^>]*\sdisabled="")[^>]*>Generate image<\/button>/);
    expect(html).not.toContain(GENERATE_OFF_REASON);
  });

  it("is disabled and says why without Generate", () => {
    const html = render(["view"]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate image<\/button>/);
    expect(html).toContain(GENERATE_OFF_REASON);
  });

  it("the permission reason wins over the button's own reason", () => {
    const html = render(["view"], { disabled: true, disabledReason: "Connect a prompt first." });
    expect(html).toContain(GENERATE_OFF_REASON);
    expect(html).not.toContain("Connect a prompt first.");
  });

  it("shows its own reason when allowed but disabled", () => {
    expect(render(["view", "generate"], { disabled: true, disabledReason: "Connect a prompt first." })).toContain("Connect a prompt first.");
  });

  it("is refused on a client the person is not on", () => {
    expect(render(["view", "generate"], {}, "c2")).toContain(GENERATE_OFF_REASON);
  });
});
```

Replace the whole of `src/components/permissions/__tests__/use-can-approve-node.test.tsx` with:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Permission } from "@/lib/permissions/model";
import { ClientIdProvider } from "@/components/canvas/client-id-context";
import { TestAccessProvider } from "../test-access-provider";
import { useCanApproveNode } from "../use-can-approve-node";

function Probe() {
  return <p>{String(useCanApproveNode("image-gen"))}</p>;
}
const can = (permissions: readonly Permission[], clientId = "c1") =>
  renderToStaticMarkup(
    <TestAccessProvider permissions={permissions} clientIds={["c1"]}>
      <ClientIdProvider value={clientId}><Probe /></ClientIdProvider>
    </TestAccessProvider>,
  ).includes("true");

describe("useCanApproveNode", () => {
  it("needs Approve on the canvas's client", () => {
    expect(can(["view", "approve"])).toBe(true);
    expect(can(["view"])).toBe(false);
  });

  it("is false on a client the person is not on, and outside a canvas", () => {
    expect(can(["view", "approve"], "c2")).toBe(false);
    expect(can(["view", "approve"], "")).toBe(false);
  });
});
```

`src/components/nodes/__tests__/generate-footer.test.tsx`: replace the two permission imports with `import { TestAccessProvider } from "@/components/permissions/test-access-provider";` and `import { GENERATE_OFF_REASON } from "@/components/permissions/gated-button";` plus `import type { Permission } from "@/lib/permissions/model";`; the render helper becomes:

```tsx
const render = (over: Partial<Parameters<typeof GenerateFooter>[0]> = {}, permissions?: readonly Permission[]) =>
  renderToStaticMarkup(
    <TestAccessProvider permissions={permissions}>
      <ClientIdProvider value="c1">
        <GenerateFooter need="generate" label="Re-generate" busy={false} onClick={vi.fn()} disabled={false} credits={605} {...over} />
      </ClientIdProvider>
    </TestAccessProvider>,
  );
```

with `import { ClientIdProvider } from "@/components/canvas/client-id-context";`, and the "turned off" test uses `render({}, ["view"])`.

`src/components/nodes/__tests__/dubbing-controls.test.tsx`, `src/components/script-review/__tests__/team-review-board.test.tsx`: `import { TestAbilityProvider } from "@/components/permissions/test-ability-provider";` → `import { TestAccessProvider } from "@/components/permissions/test-access-provider";`, and every `TestAbilityProvider` → `TestAccessProvider` (no props: the owner, as "every key" was). In `dubbing-controls.test.tsx` change the comment to `// Dub and Lip sync are gated on Generate (spec §5); every render is the owner's.`

`src/components/script-review/__tests__/review-actions.test.tsx`: replace the three permission imports with `import type { Permission } from "@/lib/permissions/model";`, `import { PERMISSIONS } from "@/lib/permissions/model";` and `import { TestAccessProvider } from "@/components/permissions/test-access-provider";`; the render helper's third parameter becomes `permissions: readonly Permission[] = PERMISSIONS` and the wrapper `<TestAccessProvider permissions={permissions}>…</TestAccessProvider>`; the Share test becomes:

```tsx
  it("hides Share and Copy link without Share", () => {
    const html = render(script("in_review"), review({}), PERMISSIONS.filter((p) => p !== "share"));
    expect(html).not.toContain("Share");
    expect(html).not.toContain("Copy link");
  });
```

- [ ] **Step 8: Run the tests**

```bash
cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm
npx vitest run src/lib
npx vitest run src/components
npx vitest run src/hooks
npx vitest run src/services
npx vitest run src/app
```

Expected: PASS apart from the two known failures.

Run: `npx tsc --noEmit` (only the known line) and `npx eslint src/components src/hooks src/lib/me src/lib/identity.ts src/app/api/me`.
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(permissions): the browser runs the same check(); /api/me sends the six permissions"
git log -1 --format=%B
```

---

### Task 8: The canvas works out its permissions once

**Files:**
- Create: `src/components/permissions/client-permissions.tsx`, `src/components/permissions/__tests__/client-permissions.test.tsx`
- Modify: `src/lib/permissions/model.ts` (constants), `src/lib/permissions/check.ts` (`clientPermissionsFor`), `src/components/canvas/canvas.tsx:181,487-489,645-647`, `src/components/editor/editor-shell.tsx:50-73`, `src/components/permissions/gated-button.tsx`, `src/components/nodes/generate-footer.tsx`, `src/components/canvas/copilot-composer.tsx`, `src/components/nodes/dubbing-dub-panel.tsx`, `src/components/nodes/dubbing-lip-sync-panel.tsx`, the eight `GenerateFooter` call sites, `src/components/nodes/client-review-node.tsx:40`, `src/components/canvas/client-feedback-drawer/client-feedback-drawer.tsx:85`, `src/components/nodes/{image-gen-focus-view,prompt-focus-shell,prompt-focus-view,video-gen-focus-view}.tsx`
- Delete: `src/components/permissions/use-can-approve-node.ts` and its test (its callers read the canvas's permissions)
- Tests: `gated-button.test.tsx`, `generate-footer.test.tsx`, `dubbing-controls.test.tsx` (wrap in the canvas provider)

**Interfaces:**
- Consumes: `AccessContext` (Task 7), `check`.
- Produces: `type ClientPermissions = Readonly<Record<Permission, boolean>>`, `NO_CLIENT_PERMISSIONS`, `ALL_CLIENT_PERMISSIONS` (in `model.ts`); `clientPermissionsFor(access: Access, orgId: string, clientId: string): ClientPermissions` (in `check.ts`); `useClientPermissions(clientId: string): ClientPermissions`, `ClientPermissionsProvider({ value, children })`, `useCanvasPermissions(): ClientPermissions` (defaults to `NO_CLIENT_PERMISSIONS` outside a provider); `GatedButton` without `need`/`clientId` (it is the Generate button); `GenerateFooter` without `need`.

The canvas review drawer (ledger final pass): `/api/canvases/[cid]/review` now needs `view`, which anyone who opened the canvas has, so its trigger needs no gate.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/permissions/__tests__/client-permissions.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { clientPermissionsFor } from "@/lib/permissions/check";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { ClientPermissionsProvider, useCanvasPermissions, useClientPermissions } from "../client-permissions";
import { TestAccessProvider } from "../test-access-provider";

function Probe() {
  const p = useCanvasPermissions();
  return <p>{[p.view, p.edit, p.generate, p.approve, p.share, p.delete].join("|")}</p>;
}
function Canvas({ clientId }: { clientId: string }) {
  return <ClientPermissionsProvider value={useClientPermissions(clientId)}><Probe /></ClientPermissionsProvider>;
}

describe("clientPermissionsFor", () => {
  it("is the six answers for one client", () => {
    expect(clientPermissionsFor(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }), "org-1", "c1"))
      .toEqual({ view: true, edit: true, generate: false, approve: false, share: false, delete: false });
    expect(Object.values(clientPermissionsFor(testOwnerAccess(), "org-1", "c1")).every(Boolean)).toBe(true);
  });

  it("is all false for an empty client id (outside a canvas)", () => {
    expect(Object.values(clientPermissionsFor(testOwnerAccess(), "org-1", "")).some(Boolean)).toBe(false);
  });
});

describe("the canvas's permissions", () => {
  it("are computed once for the canvas's client and read by its nodes", () => {
    const html = renderToStaticMarkup(
      <TestAccessProvider permissions={["view", "generate"]} clientIds={["c1"]}><Canvas clientId="c1" /></TestAccessProvider>,
    );
    expect(html).toContain("true|false|true|false|false|false");
  });

  it("are all false outside a canvas", () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("false|false|false|false|false|false");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/permissions/__tests__/client-permissions.test.tsx`
Expected: FAIL, `Failed to resolve import "../client-permissions"`.

- [ ] **Step 3: The six booleans, once**

Add to `src/lib/permissions/model.ts`:

```ts
/** The six answers for one client: what the canvas works out once and its nodes read. */
export type ClientPermissions = Readonly<Record<Permission, boolean>>;

export const NO_CLIENT_PERMISSIONS: ClientPermissions = {
  view: false, edit: false, generate: false, approve: false, share: false, delete: false,
};

export const ALL_CLIENT_PERMISSIONS: ClientPermissions = {
  view: true, edit: true, generate: true, approve: true, share: true, delete: true,
};
```

Add to `src/lib/permissions/check.ts` (and `PERMISSIONS`, `NO_CLIENT_PERMISSIONS`, `type ClientPermissions` to its `./model` import):

```ts
/** The six answers for one client. An empty client id (outside a canvas) answers none. */
export function clientPermissionsFor(access: Access, orgId: string, clientId: string): ClientPermissions {
  if (clientId === "") return NO_CLIENT_PERMISSIONS;
  const out = { ...NO_CLIENT_PERMISSIONS };
  for (const p of PERMISSIONS) out[p] = check(access, p, { orgId, clientId }) === "allow";
  return out;
}
```

```tsx
// src/components/permissions/client-permissions.tsx
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { clientPermissionsFor } from "@/lib/permissions/check";
import { NO_CLIENT_PERMISSIONS, type ClientPermissions } from "@/lib/permissions/model";
import { AccessContext } from "./access-context";

// Spec §5: the canvas (and the editor) works out its client's six answers once, beside
// ClientIdProvider; nodes read them from here and never run their own checks (performance rules
// 1 and 2). They change only when /api/me does, so a drag never re-renders a gated control.

const ClientPermissionsContext = createContext<ClientPermissions>(NO_CLIENT_PERMISSIONS);

/** For the component that owns the client id (the canvas, the editor shell). */
export function useClientPermissions(clientId: string): ClientPermissions {
  const { access, orgId } = useContext(AccessContext);
  return useMemo(() => clientPermissionsFor(access, orgId, clientId), [access, orgId, clientId]);
}

export function ClientPermissionsProvider({ value, children }: { value: ClientPermissions; children: ReactNode }) {
  return <ClientPermissionsContext.Provider value={value}>{children}</ClientPermissionsContext.Provider>;
}

/** Inside a canvas or the editor: the client's six answers. Outside one: all false. */
export function useCanvasPermissions(): ClientPermissions {
  return useContext(ClientPermissionsContext);
}
```

- [ ] **Step 4: The canvas and the editor provide them**

`src/components/canvas/canvas.tsx`:
- Replace `import { useCan } from "@/components/permissions/use-can";` with `import { ClientPermissionsProvider, useClientPermissions } from "@/components/permissions/client-permissions";`.
- Replace the two lines

```tsx
  const canEditCanvas = useCan("edit", clientId);
  const { canEdit, viewOnly, heldByName, canTakeOver, sessionId, takeOver, reportLockLost } =
    useCanvasLock(canvasId, { acquire: canEditCanvas });
```

with

```tsx
  const permissions = useClientPermissions(clientId);
  const { canEdit, viewOnly, heldByName, canTakeOver, sessionId, takeOver, reportLockLost } =
    useCanvasLock(canvasId, { acquire: permissions.edit });
```

  and the comment above them with `// Spec §5: without Edit the canvas is view only: no lock, no dragging or connecting, no add menu, fields render plain (everything below reads canEdit). The six answers are worked out here once; nodes read them from ClientPermissionsProvider.`
- After `<ClientIdProvider value={clientId}>` add the line `<ClientPermissionsProvider value={permissions}>`, and before `</ClientIdProvider>` add `</ClientPermissionsProvider>`.

`src/components/editor/editor-shell.tsx`:
- Replace `import { useCan } from "@/components/permissions/use-can";` with `import { ClientPermissionsProvider, useCanvasPermissions, useClientPermissions } from "@/components/permissions/client-permissions";`.
- `EditorShell` becomes:

```tsx
export function EditorShell(props: Props) {
  const permissions = useClientPermissions(props.clientId);
  return (
    <ClientIdProvider value={props.clientId}>
      <ClientPermissionsProvider value={permissions}>
        <EditorStoreProvider doc={props.initialState.doc} sources={props.initialState.sources}>
          <EditorPlaybackProvider>
            <AutoCaptionsProvider canvasId={props.canvasId} nodeId={props.initialState.editorNodeId}>
              <EditorViewProvider>
                <EditorShellBody {...props} />
              </EditorViewProvider>
            </AutoCaptionsProvider>
          </EditorPlaybackProvider>
        </EditorStoreProvider>
      </ClientPermissionsProvider>
    </ClientIdProvider>
  );
}
```

- In `EditorShellBody` replace the comment and the three lines starting `const canEditCanvas = useCan(` through `const lock = useCanvasLock(…)` with:

```tsx
  // Spec §5: holding the lock is editing. Without Edit the cut opens view only and never takes the
  // lock from whoever is editing.
  const { edit } = useCanvasPermissions();
  const lock = useCanvasLock(canvasId, { acquire: edit });
```

- [ ] **Step 5: Nodes read them**

Replace the whole of `src/components/permissions/gated-button.tsx` with:

```tsx
"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvasPermissions } from "./client-permissions";

export const GENERATE_OFF_REASON = "Generating is turned off for you. Ask your agency owner.";

type Props = ComponentProps<typeof Button> & {
  /** Why the button is disabled for some other reason. The permission reason wins over it. */
  disabledReason?: string | null;
  /** The span the tooltip hangs on: a disabled button gets no pointer events. */
  triggerClassName?: string;
  tooltipSide?: "top" | "bottom";
};

// Spec §5, "one wrapper per pattern": every Generate on the canvas and in the editor. Without
// Generate the button shows disabled with the reason, so people know the feature exists and whom
// to ask; it reads the canvas's permissions, so a node makes no check of its own. The reason is
// also in the markup (sr-only), since a disabled button can't be focused to reach its tooltip.
export function GatedButton({
  disabled = false,
  disabledReason = null,
  triggerClassName = "inline-block",
  tooltipSide = "top",
  ...props
}: Props) {
  const allowed = useCanvasPermissions().generate;
  const reason = !allowed ? GENERATE_OFF_REASON : disabled ? disabledReason : null;
  const button = <Button {...props} disabled={!allowed || disabled} />;
  if (!reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={triggerClassName} />}>
        {button}
        <span className="sr-only">{reason}</span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className="max-w-56 text-center">{reason}</TooltipContent>
    </Tooltip>
  );
}
```

`src/components/nodes/generate-footer.tsx`: delete the `useClientId` and `Action` imports, the `need` prop (destructure, doc and type) and `const clientId = useClientId();`, and in the `<GatedButton …>` delete `need={need}` and `clientId={clientId}`.

Delete the `need="generate"` attribute line from every remaining call site:

```bash
sed -i -E '/^\s*need="generate"$/d' \
  src/components/canvas/copilot-composer.tsx \
  src/components/nodes/dubbing-dub-panel.tsx \
  src/components/nodes/dubbing-lip-sync-panel.tsx \
  src/components/nodes/composite-focus-view.tsx \
  src/components/nodes/image-gen-focus-view.tsx \
  src/components/nodes/multishot-prompt-focus-view.tsx \
  src/components/nodes/prompt-focus-view.tsx \
  src/components/nodes/video-gen-change-voice.tsx \
  src/components/nodes/video-gen-edit-video.tsx \
  src/components/nodes/video-gen-focus-view.tsx \
  src/components/nodes/video-prompt-focus-view.tsx
```

In `copilot-composer.tsx`, `dubbing-dub-panel.tsx` and `dubbing-lip-sync-panel.tsx` the client id was read only for the button: delete the `clientId={clientId}` line inside `<GatedButton`, the `const clientId = useClientId();` line and the `useClientId` import.

`src/components/nodes/client-review-node.tsx:40` and `src/components/canvas/client-feedback-drawer/client-feedback-drawer.tsx:85`: replace `const canShare = useCan("share", useClientId());` with `const { share: canShare } = useCanvasPermissions();`, swap the `useCan` import for `import { useCanvasPermissions } from "@/components/permissions/client-permissions";`, and drop the `useClientId` import where nothing else in the file uses it.

The four focus views: replace `import { useCanApproveNode } from "@/components/permissions/use-can-approve-node";` with `import { useCanvasPermissions } from "@/components/permissions/client-permissions";` and the hook call with `const { approve: canApprove } = useCanvasPermissions();` (in `image-gen-focus-view.tsx:332`, `prompt-focus-view.tsx:196`, `video-gen-focus-view.tsx:740`, and `prompt-focus-shell.tsx:183` where the trailing comment `// "video-prompt" or "multishot-prompt"` goes too).

`git rm src/components/permissions/use-can-approve-node.ts src/components/permissions/__tests__/use-can-approve-node.test.tsx`

- [ ] **Step 6: The component tests wrap in the canvas provider**

`src/components/permissions/__tests__/gated-button.test.tsx`: replace the `TestAccessProvider` import with `import { ClientPermissionsProvider } from "../client-permissions";` and `import { ALL_CLIENT_PERMISSIONS, NO_CLIENT_PERMISSIONS, type ClientPermissions } from "@/lib/permissions/model";`; the render helper becomes:

```tsx
const render = (value: ClientPermissions, props: { disabled?: boolean; disabledReason?: string | null } = {}) =>
  renderToStaticMarkup(
    <ClientPermissionsProvider value={value}>
      <GatedButton {...props}>Generate image</GatedButton>
    </ClientPermissionsProvider>,
  );
```

with the calls `render(ALL_CLIENT_PERMISSIONS)` for "may generate" and "allowed but disabled", `render({ ...ALL_CLIENT_PERMISSIONS, generate: false })` for the two refused cases, and the last test replaced by:

```tsx
  it("is refused outside a canvas (no permissions provided)", () => {
    expect(renderToStaticMarkup(<GatedButton>Generate image</GatedButton>)).toContain(GENERATE_OFF_REASON);
    expect(render(NO_CLIENT_PERMISSIONS)).toContain(GENERATE_OFF_REASON);
  });
```

`src/components/nodes/__tests__/generate-footer.test.tsx`: the wrapper becomes `<ClientPermissionsProvider value={value}><GenerateFooter label="Re-generate" … /></ClientPermissionsProvider>` with `value: ClientPermissions = ALL_CLIENT_PERMISSIONS` as the helper's second parameter (drop `TestAccessProvider`, `ClientIdProvider` and `need`); the "turned off" test calls `render({}, { ...ALL_CLIENT_PERMISSIONS, generate: false })`.

`src/components/nodes/__tests__/dubbing-controls.test.tsx`: `renderGated` becomes

```tsx
const renderGated = (el: ReactElement) => renderToStaticMarkup(
  <ClientPermissionsProvider value={ALL_CLIENT_PERMISSIONS}><ClientIdProvider value="c1">{el}</ClientIdProvider></ClientPermissionsProvider>,
);
```

with the matching imports instead of `TestAccessProvider`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/components src/lib/permissions`
Expected: PASS.

Run: `git grep -nE "useCanApproveNode|need=\"generate\"|useCan\(\"(edit|generate|approve|share)\", useClientId" -- src`
Expected: no output.

Run: `npx tsc --noEmit` (only the known line) and `npx eslint src/components/permissions src/components/canvas src/components/editor src/components/nodes`.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "perf(permissions): the canvas works out its six permissions once; nodes read them"
git log -1 --format=%B
```

---

### Task 9: CASL, the area catalogue and presets are gone

**Files:**
- Delete: `src/lib/permissions/catalogue.ts`, `catalogue.test.ts`, `effective.ts`, `effective.test.ts`, `presets.ts`, `node-area.ts`, `node-area.test.ts`, `src/lib/db/presets.ts` (each is the old model; their tests go with the modules they test)
- Modify: `package.json`, `package-lock.json`
- Test: `src/lib/permissions/no-casl.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no `@casl/*` dependency; no import of the deleted modules anywhere.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/permissions/no-casl.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// D504: one checker on server and browser; CASL, the area catalogue and presets are removed.
const GONE = ["catalogue", "effective", "presets", "node-area", "ability", "browser", "downloads", "access"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("the old permission model is gone", () => {
  it("has no CASL dependency", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => n.startsWith("@casl/"))).toEqual([]);
  });

  it("has none of the old modules", () => {
    for (const m of GONE) expect(existsSync(`src/lib/permissions/${m}.ts`), m).toBe(false);
    expect(existsSync("src/lib/db/presets.ts")).toBe(false);
  });

  it("imports none of them anywhere", () => {
    const anywhere = new RegExp(`@casl/|permissions/(${GONE.join("|")})"`);
    const relative = new RegExp(`from "\\./(${GONE.join("|")})"`);
    const offenders = sourceFiles("src").filter((f) => {
      if (f.endsWith("no-casl.test.ts")) return false;
      const src = readFileSync(f, "utf8");
      const inPermissions = f.split(/[\\/]/).join("/").includes("src/lib/permissions/");
      return anywhere.test(src) || (inPermissions && relative.test(src));
    });
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions/no-casl.test.ts`
Expected: FAIL (`@casl/ability` and `@casl/react` are dependencies; `catalogue.ts` exists).

- [ ] **Step 3: Delete the modules and the dependencies**

```bash
git rm src/lib/permissions/catalogue.ts src/lib/permissions/catalogue.test.ts \
  src/lib/permissions/effective.ts src/lib/permissions/effective.test.ts \
  src/lib/permissions/presets.ts src/lib/permissions/node-area.ts src/lib/permissions/node-area.test.ts \
  src/lib/db/presets.ts
```

In `package.json`, delete the two lines `"@casl/ability": "7.0.3",` and `"@casl/react": "7.0.1",`. Then, without touching `node_modules` (it is the other checkout's):

Run: `npm install --package-lock-only --ignore-scripts`
Expected: `package-lock.json` changes only by losing the `@casl/*` entries. Check with `git diff --stat package-lock.json` and `git diff package-lock.json | grep '^[-+]' | grep -v casl | grep -vE '^(\+\+\+|---)'`: no other lines.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/lib
npx vitest run src/components
npx vitest run src/hooks
npx vitest run src/app
```

Expected: PASS apart from the two known failures.

Run: `npx tsc --noEmit` (only the known line).

- [ ] **Step 5: Commit**

```bash
git add -A src package.json package-lock.json
git commit -m "chore(permissions): remove CASL, the area catalogue and presets (D504)"
git log -1 --format=%B
```

---

### Task 10: People waiting for access see the onboarding screen

**Files:**
- Create: `src/lib/permissions/onboarding.ts`, `src/lib/permissions/onboarding.test.ts`, `src/app/onboarding/page.tsx`, `src/app/onboarding/page.test.tsx`, `src/components/onboarding/onboarding-notice.tsx`
- Modify: `src/app/(home)/page.tsx`

**Interfaces:**
- Consumes: `isWaiting` (Task 1), `accessOf`, `resolveActingCaller`, `type ActingCaller`.
- Produces: `ONBOARDING_PATH = "/onboarding"`; `sendWaitingToOnboarding(acting: ActingCaller): void` (redirects); `OnboardingNotice({ orgName })`.

A waiting person's client pages are already the 404 page (no client row with View), so only the home page needs to send them on. The onboarding page sends everyone else home.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/permissions/onboarding.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { sendWaitingToOnboarding } from "./onboarding";
import { testAccess, testOwnerAccess } from "./test-fixtures";
import type { Access } from "./model";

const acting = (access: Access) => ({ caller: { userId: "u1", orgId: "org-1", access }, effectiveOrgId: "org-1", impersonation: { isImpersonating: false as const } });

describe("sendWaitingToOnboarding (spec §2.4)", () => {
  it("sends someone signed up and waiting to /onboarding", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: [], clientIds: ["c1"], accessGiven: false })) as never)).toThrow("REDIRECT /onboarding");
  });

  it("sends someone on no client they can view to /onboarding", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: ["view"], clientIds: [] })) as never)).toThrow("REDIRECT /onboarding");
  });

  it("lets a member with a client, and the owner with none, through", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: ["view"], clientIds: ["c1"] })) as never)).not.toThrow();
    expect(() => sendWaitingToOnboarding(acting(testOwnerAccess()) as never)).not.toThrow();
  });
});
```

```tsx
// src/app/onboarding/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const { actingMock, redirectMock } = vi.hoisted(() => ({
  actingMock: vi.fn(),
  redirectMock: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/permissions/server", async (orig) => ({ ...(await orig<typeof import("@/lib/permissions/server")>()), resolveActingCaller: actingMock }));

import OnboardingPage from "./page";
import { testAccess } from "@/lib/permissions/test-fixtures";

describe("/onboarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tells a waiting person their agency is setting up their access", async () => {
    actingMock.mockResolvedValue({
      caller: { userId: "u1", orgId: "org-1", access: testAccess({ permissions: [], clientIds: ["c1"], accessGiven: false }) },
      effectiveOrgId: "org-1",
      impersonation: { isImpersonating: false },
    });
    const html = renderToStaticMarkup(await OnboardingPage());
    expect(html).toContain("You&#x27;re being onboarded. Hang in there.");
    expect(html).toContain("Yuvabe Studios is setting up your access. Your clients will appear here once it&#x27;s ready.");
  });

  it("sends anyone with access home", async () => {
    actingMock.mockResolvedValue({
      caller: { userId: "u1", orgId: "org-1", access: testAccess({ permissions: ["view"], clientIds: ["c1"] }) },
      effectiveOrgId: "org-1",
      impersonation: { isImpersonating: false },
    });
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT /");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/permissions/onboarding.test.ts src/app/onboarding`
Expected: FAIL (modules missing).

- [ ] **Step 3: The redirect, the page and the notice**

```ts
// src/lib/permissions/onboarding.ts
import "server-only";
import { redirect } from "next/navigation";
import { isWaiting } from "./check";
import { accessOf, type ActingCaller } from "./server";

export const ONBOARDING_PATH = "/onboarding";

/** Spec §2.4: someone signed up and waiting, or on no client they can view, sees only the
 *  onboarding screen. Their client pages are already the 404 page (no row with View). */
export function sendWaitingToOnboarding({ caller, effectiveOrgId }: ActingCaller): void {
  if (isWaiting(accessOf(caller), effectiveOrgId)) redirect(ONBOARDING_PATH);
}
```

```tsx
// src/components/onboarding/onboarding-notice.tsx
import { Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";

export function OnboardingNotice({ orgName }: { orgName: string }) {
  return (
    <Card className="animate-rise mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center shadow-card">
      <Hourglass className="size-6 text-muted-foreground" strokeWidth={1.5} />
      <h1 className="font-display text-2xl font-semibold tracking-tight">You&apos;re being onboarded. Hang in there.</h1>
      <p className="text-sm text-muted-foreground">
        {orgName} is setting up your access. Your clients will appear here once it&apos;s ready.
      </p>
    </Card>
  );
}
```

```tsx
// src/app/onboarding/page.tsx
import { redirect } from "next/navigation";
import { isWaiting } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { OnboardingNotice } from "@/components/onboarding/onboarding-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome — CreativeOS" };

// Spec §6.4. Only for someone waiting (spec §2.4); anyone else goes home. No live update: the
// person is emailed when their access is ready and opens the app again (D506).
export default async function OnboardingPage() {
  const { caller, effectiveOrgId } = await resolveActingCaller();
  const access = accessOf(caller);
  if (!isWaiting(access, effectiveOrgId)) redirect("/");
  const orgName = access.orgs.get(effectiveOrgId)?.orgName || "Your agency";
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <OnboardingNotice orgName={orgName} />
    </main>
  );
}
```

`src/app/(home)/page.tsx`: add `import { sendWaitingToOnboarding } from "@/lib/permissions/onboarding";`, and replace the line `const { caller, effectiveOrgId } = await resolveActingCaller();` with:

```tsx
  const acting = await resolveActingCaller();
  sendWaitingToOnboarding(acting);
  const { caller, effectiveOrgId } = acting;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/permissions src/app/onboarding`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/lib/permissions/onboarding.ts src/app/onboarding src/components/onboarding "src/app/(home)/page.tsx"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions/onboarding.ts src/lib/permissions/onboarding.test.ts src/app/onboarding src/components/onboarding "src/app/(home)/page.tsx"
git commit -m "feat(permissions): people waiting for access see the onboarding screen (spec 2.4, 6.4)"
git log -1 --format=%B
```

---

### Task 11: Five permissions

The stored permissions become the five of the Global Constraints: `generate, approve, share, delete, invite`. Being on a client (its row, with access given) is what lets a person see it, and an empty set means they can look only. `view` and `edit` stay as actions (routes keep `need: "view"` / `need: "edit"`): `view` needs only the row, `edit` needs `generate`. `invite` is a new permission and action, checked on the named client like the others; nothing in the app uses it yet (plan 4 builds the invite routes), so this task only makes the model, checker, `/api/me`, migration and coverage lists accept it.

**Files:**
- Modify: `src/lib/permissions/model.ts`, `src/lib/permissions/check.ts`
- Modify (comments only, if they say "client they can view" or "no row with View"): `src/lib/permissions/onboarding.ts`, `src/app/onboarding/page.tsx`
- Modify (whatever the type change needs): `src/components/permissions/client-permissions.tsx`, `src/components/permissions/access-context.tsx`, `src/lib/me/access.ts`, `src/app/api/me/route.ts`
- Modify: `supabase/migrations/0062_permission_based_access.sql` (never applied; rewritten in place with the Write/Edit tools), `src/lib/permissions/migration-0062.test.ts`
- Modify: `docs/auth-production-migration.md` (the 0062 permissions and backfill)
- Modify (if the coverage test needs an entry for an action no route uses yet): `src/lib/permissions/not-yet-checked.ts`, adding `invite` the way `manage_team` is ("Client Members invite, plan 4")
- Test: `src/lib/permissions/check.test.ts`, `model.test.ts`, `onboarding.test.ts`, `test-fixtures.ts`, `src/lib/me/access.test.ts`, `src/components/permissions/__tests__/*`, `src/app/onboarding/page.test.tsx`, `src/app/api/me/route.test.ts`, and any other fixture `grep -rn "\"view\"\|'view'\|\"edit\"" src` finds in a permission set, row fixture or `/api/me` payload

- [ ] **Step 1: Write the failing checker tests**

In `check.test.ts` (table test), add:
- on a client with an empty set: `view` allow, `edit` forbidden, `generate` forbidden, `manage_team` forbidden; another client: `not_found` for every action;
- with `generate`: `edit` allow;
- `invite` on client A but not B: A allow, B forbidden;
- access not given, with a row: `not_found` for `view`;
- no client named: a member with one empty row gets `view` allow and `generate` forbidden; a member with no rows gets `not_found`;
- `isWaiting`: access given with one empty row → false; access given with no rows → true;
- `clientPermissionsFor` returns the seven keys (`view`, `edit` and the five permissions);
- `buildOrgAccess` drops `"view"` and `"edit"` values coming from the database (they are no longer permissions).

Run: `npx vitest run src/lib/permissions/check.test.ts`
Expected: FAIL.

- [ ] **Step 2: Change the model** (`model.ts`)
- `PERMISSIONS = ["generate", "approve", "share", "delete", "invite"] as const`.
- `CLIENT_ACTIONS = ["view", "edit"] as const` (actions that are not permissions). `Action = Permission | ClientAction | OwnerAction`; `ACTIONS` lists all of them; `isAction` accepts them.
- An exported `permissionFor(action: Permission | ClientAction): Permission | null`: `view` → `null` (the row is enough), `edit` → `"generate"`, a permission → itself. `check.ts` and anything else share it.
- `anyClient` is built from every client row once access is given (no `view` requirement); "has at least one client" stays O(1) (`clients.size > 0`, no new field).
- `ClientPermissions` becomes `Readonly<Record<Permission | ClientAction, boolean>>`; update `NO_CLIENT_PERMISSIONS` and `ALL_CLIENT_PERMISSIONS`.
- Header comment: five permissions, view and edit are actions (D500, D504, D507). The `OWNER_ACTIONS` comment: inviting is the `invite` permission; removing people, giving access, editing permissions, resend and cancel stay `manage_team`.

- [ ] **Step 3: Change the checker** (`check.ts`)
- `check` follows the check order in the Global Constraints exactly, using `permissionFor` in step 7 (with no client named, the needed permission in `anyClient`).
- `clientIdsWith(access, orgId, action)` accepts `Permission | ClientAction`: `view` keeps every client the person is on (access given); other actions keep the rows holding the needed permission. Callers pass sensible actions (the client list uses `view`).
- `isWaiting`: not owner or super admin, and access not given or no client rows.
- `clientPermissionsFor` loops over `view`, `edit` and the five permissions.
- Comments that say "can view" or "View" are updated.

- [ ] **Step 4: Browser and `/api/me`**

Make `client-permissions.tsx`, `access-context.tsx`, `src/lib/me/access.ts` and `/api/me` follow the type change. `/api/me` sends the five permissions (it serialises the sets).

- [ ] **Step 5: Migration 0062** (Write/Edit tools only)
- Check constraints on both tables: `permissions <@ array['generate','approve','share','delete','invite']::text[]`, and the same array for `array_position` ordering in the cascade.
- Backfill (spec §3.2): non-owner memberships and their client rows get `array['generate','approve','share','delete']` (no invite).
- `transfer_agency_owner`: the previous owner gets all five, `array['generate','approve','share','delete','invite']`.
- Comments that say six, View or Edit.
- `migration-0062.test.ts` (it reads the file text): expectations to match.

- [ ] **Step 6: Migration doc**

`docs/auth-production-migration.md`: wherever it describes 0062's permissions or backfill, it says five permissions and that existing members get Generate, Approve, Share and Delete.

- [ ] **Step 7: Fixtures and copy**

Every test and fixture using `"view"` or `"edit"` as a stored permission: a row that held View only becomes an empty set; a row that needed Edit gets `generate`. `need: "view"` / `need: "edit"` in routes and their tests are actions and stay. Search the rest of `src` for UI copy or comments that list the six permissions or mention a View or Edit permission ("needs Edit", "View only") and fix them; "Generating is turned off" stays.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/lib/permissions src/lib/me src/components/permissions src/app/onboarding src/app/api/me`
Expected: PASS.

Run: `npx vitest run src/app`, `npx vitest run src/lib`, `npx vitest run src/components` (per directory; known flakes in the Global Constraints).

Run: `npx tsc --noEmit` (only the known TS2304) and `npx eslint <changed files>`.

- [ ] **Step 9: Commit**

Stage only the files this task changed.

```bash
git commit -m "refactor(permissions): five permissions; seeing comes from being on a client, editing from Generate (D507)"
git log -1 --format=%B
```

---

### Task 12: Verify everything and record the plan's decisions

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, a new ADR after D509)

- [ ] **Step 1: Record the decisions**

Append after the last ADR in the roadmap. Check the roadmap for the next free number rather than assuming it: D510 was free on 13 Nov; if a D510 exists by now, use the next free number and change the heading and commit message to match. Confirm against `staging`'s roadmap before merging, since `staging` has used numbers this branch picked before:

```markdown
### D510 — How the permission checker is built *(recorded 2026-11-13; refines D500, D504, D507; originated → `2026-11-13-permissions-core.md`)*

**Decision.**
- `check(access, action, { orgId, clientId })` takes `clientId: null` for "on at least one client the person is on": routes and nav items not rooted at one client use it. Each agency's access carries `anyClient`, built once per request, so it is one Set lookup.
- Every page denial is the 404 page, another agency's client included; `/eval` keeps answering its own "Canvas not found".
- A new `membership_clients` row always starts as a copy of the person's agency set, set by the same `before insert` trigger that refuses owner rows.
- The 0062 backfill runs only while no membership has access given, so a re-run never hands people who are waiting Generate, Approve, Share and Delete.
- `view` and `edit` are actions worked out by one helper, `permissionFor` (`view` needs only the client row, `edit` needs Generate), shared by `check` and anything else that needs it.
- `org_role` is kept in step by every writer (`owner` / `designer`, swapped by `transfer_agency_owner`) until it is dropped, so 0012's last-owner trigger never disagrees with `is_owner`.
- Review counts are of the clients where the person holds Approve; the inbox lists the clients they are on, with pending work only for someone holding Approve.
- Downloads have no gate of their own (plan 2 Task 10 reverted).

**Why.** Spec §4.2–§4.4 and §10 (performance), and keeping each step of the switch a commit that compiles and can be reviewed on its own.

**Rejected.** Scanning the client rows for "anywhere" on each check (performance rule 2). Redirecting a foreign client's page home (it differed from every other denial).
```

- [ ] **Step 2: Full verification**

```bash
cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm
npx vitest run src/lib
npx vitest run src/components
npx vitest run src/hooks
npx vitest run src/services
npx vitest run src/app
```

Expected: PASS, apart from the two known `refuses a deprecated model` failures. A timeout in an API route test is re-run alone and must pass.

Run: `npx tsc --noEmit`
Expected: only `src/app/api/nodes/[id]/image-generate/route.test.ts(56,12)`.

Run: `npx eslint src`
Expected: clean.

Run: `npm run build`
Expected: the build completes.

Run: `git grep -nE "casl|PermissionKey|presetKey|presetName|clientScope|all_clients|orgRole" -- src ':!src/app/admin' ':!src/lib/actions/admin.ts' ':!src/lib/db/organizations.ts' ':!src/lib/orgs' ':!src/lib/permissions/no-casl.test.ts' ':!src/lib/actions/approval.test.ts'`
Expected: no output (the admin screens still write `org_role` until plan 4).

- [ ] **Step 3: Count the calls on a 300-node canvas** (AGENTS.md performance rules)

Open the largest local canvas with the Network panel filtered to `/api/` and the Realtime sockets tab.
Expected: no `/api/me` request on load; the same requests and channels as before this plan; dragging a node re-renders no focus-view button (React DevTools "Highlight updates").

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(permissions): record how the permission checker is built (D510)"
git log -1 --format=%B
```

---

## Self-review

- **Spec coverage:** §3 schema, backfill, triggers, functions → Task 2. §4.1 load once and error page on failure → Task 5 (`dal.ts` throws; `loadInitialMe` stays null-on-failure for the layout only). §4.2 checker → Task 1. §4.3 chokepoints and mapping → Tasks 5, 6. §4.4 lists and pages → Tasks 5, 10. §5 browser → Tasks 7, 8. §6.4 onboarding → Task 10. §6.5 profile menu → Task 7. §1 "Removed" → Tasks 3, 4, 7, 8, 9. §2.1 five permissions, §3.1 and §3.2 checks and backfill, §3.4 transfer, §4.2 `view`/`edit` as actions → Task 11. §9 migration doc → Tasks 2, 11. §10 performance → Tasks 1, 5, 8, 12. §11 tests → every task. §6.1–§6.3, §6.6, §6.7 → plan 4.
- **Plan 2 carry-overs:** Task 10 reviewed and reverted (Task 3); Task 11 folded into Tasks 5 and 7; Task 12 dropped (no presets); Task 13's verification is Task 12. Ledger minors: `/api/me` `withQuietErrors`, me `retry` skips 4xx, empty client id fails closed (Task 7); review drawer gating resolved by `view` (Task 8). The playbook-in-flight minor and untested hiding remain as they were.
- **Names used across tasks:** `check`, `clientIdsWith`, `isWaiting`, `clientPermissionsFor` (check.ts); `accessFromRows`, `buildOrgAccess`, `impersonatedAccess`, `NO_ACCESS`, `orderedPermissions`, `ClientPermissions`, `NO_CLIENT_PERMISSIONS`, `ALL_CLIENT_PERMISSIONS`, `CLIENT_ACTIONS`, `permissionFor` (model.ts); `testAllowAllAccess`, `testOwnerAccess`, `testAccess`, `testMembershipRow` (test-fixtures.ts); `accessFromMe`, `testMePayload(over)`; `AccessContext`, `useCan`, `TestAccessProvider`, `useClientPermissions`, `ClientPermissionsProvider`, `useCanvasPermissions`; `sendWaitingToOnboarding`. Plan 4 consumes `NOT_YET_CHECKED`, `check`, `isAction`, `PERMISSIONS`, `orderedPermissions`, `toPermissionSet`, `MePayload`, `buildMePayload` and the SQL functions of Task 2.

## Open points

1. **`clientId: null` semantics and `anyClient`.** The spec's `check` signature names `{ orgId, clientId }` without saying what a route not rooted at one client passes. This plan reads null as "on at least one client the person is on" and adds a precomputed `anyClient` set to `OrgAccess` (not in the spec's type) so it stays a lookup. A waiting person or someone on no client gets `not_found` (404) there, as step 6 reads.
2. **Extra SQL functions and parameters.** `create_agency_with_owner_invite` takes `p_slug` and `p_token` besides the spec's three parameters (the slug and the link's token are made in the app). The migration also adds `accept_invitation`, `list_agency_people` and `find_user_by_email`, which plan 4 needs and the spec does not list. They go in 0062 so the schema lands once.
3. **`docs/auth-production-migration.md`.** The brief puts the doc update in plan 4; the spec says it changes "in the same change as the migration". This plan rewrites the 0062 section in Task 2 (schema, backfill, multi-owner query, verify), and plan 4 adds the Resend and invite rollout steps.
4. **`loadCanvasPage` on not found.** The spec says both page loaders call `notFound()`; this plan keeps `/eval`'s own "Canvas not found" for not-found cases (it is a not-found rendering) and uses `notFound()` for a missing permission.
5. **Approving by node type.** The node-type-to-area map goes (spec §1), so Approve now applies to a version of any node type, including types that show no approve control. No screen offers it there.
6. **0012's last-owner trigger** stays until `org_role` is dropped; the new code keeps `org_role` in step instead of changing that trigger.
7. **ADR number D510** must be checked against `staging` before merging.

# Agency permissions: four permissions on the person, one owner, clients by People list

Date: 12 November 2026. Replaces the model in `2026-11-11-permission-based-access-design.md`
(presets, 59 area ticks, picked clients per person). The enforcement plumbing built from that
spec stays; what it checks changes.

Sources:
- Anupama's summary of the 12 November 3 pm meeting (Slack, 3:18 pm).
- Cyril's reply page "Per-Person Access" (12 November).
- Arun's answers on 12 November: several agencies per person in this round, downloads open,
  Give access sets permissions only, existing people keep their access on day one.

ADRs: D500 to D504 in the roadmap §7. The earlier permission ADRs on this branch were
numbered D489 to D493, which `staging` has since used for other decisions; they are renumbered
D495 to D499 and marked where D500 to D504 replace them.

## 1. What changes

| | 11 November spec (built in plans 1 and 2) | This spec |
|---|---|---|
| Permissions | 59 `area.level` keys | `generate`, `approve`, `share`, `delete` |
| View, edit, download | Ticks | Come with being on the client |
| Where set | Preset plus per-person changes | On the person, at agency level |
| Per client | One set for all the person's clients | A stored copy on each client assignment, kept in step by a cascade |
| Owner | A preset with every tick | One per agency, everything on every client, not editable |
| Clients | `all_clients` or a picked list, set on the person | A People list on each client; no "all clients" for members |
| Invite | Owner sets preset, ticks and clients before sending | Email only; the person enters name and password, waits, then the owner gives access |
| Agencies per person | One | Several, with a switcher |
| Credit limit per person | Optional | None; the agency pool is the only limit |
| Team, clients, credits | Ticks | Owner only |

Kept from plans 1 and 2:
- The chokepoints and their required `need` argument: `withClient`, `withCanvas`, `withNode`,
  `withMoodboard`, `withAccess`, `withAction`, `loadClientPage`, `loadCanvasPage`.
- The coverage tests over every route and server action.
- The agency isolation fixes: routes and actions that had no agency check, the node and edge
  triggers that keep each on its canvas, scoped recent canvases and `/eval`, the Drive token,
  an empty client id failing closed.
- `/api/me` on TanStack Query, `AccessProvider`, `useCan`, `GatedButton`, the 403 access signal.
Removed: CASL (`@casl/ability`, `@casl/react`) and the packed rules sent to the browser, the area catalogue, presets and their editor, per-person changes, the merge of preset
and changes, the two download levels, the node-type-to-area map, `all_clients`.

## 2. Model

### 2.1 Permissions

| Permission | Covers |
|---|---|
| Generate | Every AI run that spends credits: scripts and script copilot, storyboard panels, images, composites, video, audio and lip-sync, voices, brand extraction, market signals, canvas copilot, renders. |
| Approve | Mark a script final and reopen it; approve or request changes on an image, video or audio version. |
| Share | Client review: cut upload, review links, replies to client comments. Exports from the video editor. |
| Delete | Remove a whole item from a library: a script, canvas, video edit, moodboard, avatar, voice, brand document or brand asset. |

Anyone on a client can view and edit everything in it, download any file, and delete parts of
an item: a node, shot, panel, comment or moodboard item.

Permissions are stored as `text[]` with a check constraint that allows only the four values.
Finer keys (for example `scripts.approve`) can be added to the constraint later without a schema
change.

### 2.2 Owner

Each agency has exactly one owner.
- The owner has every permission on every client of the agency, including clients added later.
  The owner has no `membership_clients` rows and is not stored on People lists; the People list
  shows them first as "Owner · everything".
- Only the owner can: see and use the Team page, invite and remove people, change a person's
  permissions, create and archive clients, manage People lists, and see credit usage.
- The owner cannot be removed or demoted. Ownership moves only through the super admin
  (§6.6), which makes another member owner and the previous owner a member with all four
  permissions on every client.

Several owners may be needed later. Nothing below assumes there is only one: ownership is a
flag on each membership, every check asks "is this membership an owner", lists show owners
as a group, and the protection rule is "an agency keeps at least one owner". The one-owner
limit is a single unique index (§3.1); allowing more owners later means dropping that index
and adding a Make owner action for the owner, with no change to the checker or the data.

### 2.3 What a member has

- `org_memberships.permissions`: the agency-level set. This is what the owner edits.
- `membership_clients` rows: one per client the person is on, each with `permissions`, the
  effective set for that client.
- When a person is added to a client, the row copies their agency-level set.
- When the agency-level set changes, the change is applied to every one of their rows (§3.3).
- V1 screens edit the agency level only. A different set on one client is possible by editing
  that row in the database (§8).

### 2.4 Waiting to be onboarded

A member whose `access_given_at` is null, or who is on no client, sees only the onboarding
screen: "You're being onboarded. Hang in there. {Agency} is setting up your access. Your
clients will appear here once you've been added." The same screen covers both waits.

## 3. Schema

Migration `0062_permission_based_access.sql` has never been applied anywhere, so it is rewritten
rather than followed by a corrective migration. Sections 7 (node and edge triggers) and the
`org_review_counts_for_types` function stay as they are.

### 3.1 Tables and columns

`org_memberships` (existing):
- `is_owner boolean not null default false`
- `permissions text[] not null default '{}'`, check: every element in
  `('generate','approve','share','delete')`
- `access_given_at timestamptz` (null = waiting)
- `invited_by uuid references auth.users(id) on delete set null`
- unique partial index `org_memberships_one_owner on (org_id) where is_owner`
- index on `invited_by`
- `org_memberships_one_org_per_user` is dropped (§7).

`membership_clients` (new):
- `user_id`, `org_id`, `client_id`, `permissions text[] not null default '{}'` (same check),
  `added_by uuid references auth.users(id) on delete set null`, `added_at timestamptz not null default now()`
- primary key `(user_id, org_id, client_id)`
- foreign keys `(user_id, org_id) → org_memberships on delete cascade` and
  `(client_id, org_id) → clients (id, org_id) on delete cascade`. These stop a person being put
  on another agency's client, or a client being given to someone outside its agency, in the
  database.
- index on `client_id` (People list)

`org_invitations` (new):
- `id`, `org_id`, `email`, `token_hash` (sha256 of a random token), `invited_by`, `created_at`,
  `expires_at` (7 days), `accepted_at`, `revoked_at`
- unique index on `token_hash`
- unique partial index on `(org_id, lower(email))` where not accepted and not revoked (one open
  invite per person per agency)
- index on `org_id`

Not created: `role_presets`, `role_preset_permissions`, `membership_permission_changes`.

All new tables have RLS enabled with no policies (server access only, as for the other
server-owned tables).

### 3.2 Backfill

In the same migration, per agency:
- The earliest-joined `org_role = 'owner'` membership gets `is_owner = true`.
- Every other membership gets `permissions = all four`, `access_given_at = now()`, and a
  `membership_clients` row with all four for every existing client of that agency. This keeps
  today's access: every member sees every client.

`org_role` stays, unread by new code, and is dropped by a later migration once production runs
this code (§9).

### 3.3 Triggers

- **Cascade.** After update of `permissions` on `org_memberships`, when old and new differ:
  one `update membership_clients` for that `(user_id, org_id)` that removes what was removed and
  adds what was added. A row-level override (§8) survives every change except one to the same
  permission.
- **Owner protection.** After update or delete on `org_memberships` (deferred to the end of the
  transaction): refuse if the agency is left with no owner. Counting the owners that remain,
  rather than protecting one named owner, works unchanged when several are allowed, and lets
  the transfer function demote and promote in either order. Messages stay plain: "The agency owner
  can't be removed."
- **Owner rows.** Before insert on `membership_clients`: refuse a row for any owner of the agency.
- Trigger functions that read across memberships are `security definer` with
  `search_path = public`, as in plan 1.

### 3.4 Functions

- `get_membership_access(p_user_id uuid)` returns one row per membership:
  `org_id, org_name, is_owner, access_given_at, permissions, clients jsonb` where `clients` is
  `[{ client_id, permissions }]`. Service role only.
- `transfer_agency_owner(p_org_id uuid, p_new_owner uuid)`: in one transaction, demotes the
  current owner to a member with all four permissions and a row for every client, and promotes
  the new one (deleting their client rows). Service role only.
- `auth_org_ids()` stays (every agency the person belongs to), used by RLS as
  `org_id in (select auth_org_ids())`.

## 4. Checker and server enforcement

### 4.1 What a request loads

The caller is resolved once per request (`resolveActingCaller`), with one call to
`get_membership_access`:

```ts
type Permission = "generate" | "approve" | "share" | "delete";
type OrgAccess = {
  orgId: string;
  orgName: string;
  isOwner: boolean;
  accessGiven: boolean;
  permissions: ReadonlySet<Permission>;
  clients: ReadonlyMap<string, ReadonlySet<Permission>>;
};
type Access = {
  userId: string;
  isSuperAdmin: boolean;
  orgs: ReadonlyMap<string, OrgAccess>;
  selectedOrgId: string | null;
};
```

`selectedOrgId` comes from the `cos_org` cookie when it names one of the person's agencies,
otherwise their earliest membership. While a super admin impersonates, the target agency is
selected and they act as its owner, as today. `effectiveOrgId` keeps meaning "the agency this
request acts in" and is now `selectedOrgId` for members.

A failed `get_membership_access` is an error page, never "no access": it must not send the
person to the onboarding screen or show an empty client list.

### 4.2 The checker

`check(access, action, { orgId, clientId })` in `src/lib/permissions/check.ts` is the only
function that decides. Actions:

```ts
type Action = "view" | "edit" | Permission | "manage_team" | "manage_clients" | "view_credits";
```

Order:
1. Super admin: allow.
2. No membership in `orgId`: `not_found`.
3. Owner of `orgId`: allow.
4. `manage_team`, `manage_clients`, `view_credits`: `forbidden`.
5. Access not given, or no row for `clientId`: `not_found`.
6. `view`, `edit`: allow.
7. Generate, approve, share, delete: allow if the client row has it, else `forbidden`.

Every step is a Map or Set lookup. The browser runs the same function on the same data
(`src/lib/permissions/check.ts` has no server-only imports), so server and browser cannot
disagree. Routes and components call `check` or `useCan` and nothing else, so rules that
depend on the resource itself (for example "only what they created") can later be added behind
these two functions, with a library such as CASL if it helps, without touching routes or screens.

`view` and `edit` are still named by routes, so each route's intent stays visible and a later
read-only person changes step 6 only.

### 4.3 Chokepoints

Each chokepoint loads the resource with its agency and client in one query (as now), requires
`orgId = effectiveOrgId` (a resource in another agency is `not_found`, §7), then calls `check`.
`not_found` returns 404; `forbidden` returns 403 with "You don't have access to this. Ask your
agency owner."

`need` mapping from the old keys:

| Old keys | `need` |
|---|---|
| `*.view`, `internal_review.view`, `downloads.view`, `downloads.share`, `client_review.view` | `view` |
| `*.edit`, `client_profile.edit`, `client_review.edit` except team replies | `edit` |
| `*.generate`, `canvas_copilot.generate`, `video_editor.generate` | `generate` |
| `scripts.approve`, `image_generation.approve`, `video_generation.approve`, `audio.approve` | `approve` |
| `client_review.share`, `video_editor.share` | `share` |
| `*.delete` on a whole library item | `delete` |
| Node, shot, panel and moodboard item deletes | `edit` |
| `team.*` | `manage_team` |
| `clients.edit`, `clients.delete` | `manage_clients` |
| `credits.view` | `view_credits` |

The coverage test keeps failing any route or action without a `need`, and now checks that each
`need` is one of the actions above.

### 4.4 Lists and pages

- Client list for a member: `clients where org_id = selected and id = any(client ids from access)`;
  for the owner, every client of the agency. One query either way.
- Review inbox and recent canvases filter by the same client ids.
- `loadClientPage` / `loadCanvasPage` call `notFound()` on `not_found`.
- The app layout sends a waiting member (§2.4) to `/onboarding`.

## 5. Browser

- `/api/me` returns: the person's agencies `[{ id, name, isOwner }]`, `selectedOrgId`, the
  selected agency's access (owner or not, whether access is given, permissions, and each client
  id with its permissions). It stays seeded from the root
  layout, refetches on focus and on any 403, and skips retries on 4xx.
- `useCan(action, clientId)` and `GatedButton` stay. Generate shows a disabled button with the
  reason; Approve, Share and Delete are hidden when missing. Download buttons no longer gate.
- The canvas works out `{ edit, generate, approve, share, delete }` for its client once, in a
  context next to `ClientIdProvider`; nodes read from it. Nodes never run their own checks.
- `useCanvasEditable()` returns `can("edit")`, true for anyone on the client. The read-only
  canvas code stays for a later read-only person.
- `useIdentity`'s `role` (senior or designer) is removed; screens that used it ask
  `useCan("approve", clientId)`.
- Switching agency clears the query cache before navigating home, so nothing from the previous
  agency is shown.

## 6. Screens

All screens use the existing shadcn primitives and follow Cyril's page for layout and copy.

### 6.1 Team page (`/team`, owner only)

Three sections:
- **Waiting for you.** People who entered their details. Card: name, email, "Details entered
  {date}", the four permissions as switches (none on by default), "Generate spends the agency's
  credits. These apply on every client {name} is added to.", and **Give access**, which saves
  the permissions and sets `access_given_at`. The person then appears under Members, still
  seeing the onboarding screen until added to a client.
- **Invited.** Open invites: email, sent date, expiry, Copy link, Resend (new token, old one
  stops working), Revoke.
- **Members.** Owner first as "Owner · everything". Each member: name, email, permission chips,
  number of clients. Edit opens the four switches; saving updates the agency level and the
  cascade applies it to every client. Remove asks for confirmation and deletes the membership.

Invite: an **Invite** button opens a dialog with one email field. It creates the invitation,
emails the link through Resend and shows it to copy.

### 6.2 People list (`/clients/[id]/people`, owner only)

- "On this client": owners first as "Owner · everything", then each person with their permission
  chips and Remove.
- **Add people** (dashed primary chip) opens a list of agency members who have been given access
  and are not on this client, with checkboxes, then "Add {n} people". One insert; each row copies
  the person's agency-level set.

### 6.3 Invite link (`/invite/[token]`)

- Invalid, used, revoked or expired: a plain message and a link to sign in.
- No account for the invited email: name and password, then the account, profile and membership
  (waiting) are created and the person is signed in and sees the onboarding screen.
- Account exists: sign in if needed, then "Join {Agency}". Signed in as a different email: "This
  invite is for {email}. Sign in with that email to accept it."
- Accepting is single use and marks the invitation accepted in the same step that creates the
  membership.

### 6.4 Onboarding screen (`/onboarding`)

The copy in §2.4. If the person belongs to other agencies, the switcher is shown too.

### 6.5 Agency switcher

In the app header, shown only when the person has more than one agency. Lists agency names with
the selected one ticked. Choosing one calls a server action that checks membership, sets
`cos_org`, clears the query cache and goes home.

### 6.6 Super admin (`/admin/orgs/[id]`)

- Creating an agency stays; its owner is invited by email (the temporary-password path is
  retired, as in D497).
- Members tab: the same member list as the Team page, plus **Make owner** (calls
  `transfer_agency_owner`) and the same Invite dialog, so the super admin can invite into any
  agency.
- `member-role-select` is removed.

## 7. Several agencies per person

- One login can hold memberships in several agencies, each with its own permissions and clients.
- Everything a request does is scoped to the selected agency, as `effectiveOrgId` is today.
- A link to something in another of the person's agencies is `not_found` in the selected one.
  `loadClientPage` / `loadCanvasPage` then look the resource's agency up among the person's
  memberships and, if found, show "This is in {Agency}." with **Switch to {Agency}**, which
  switches and reopens the link. API routes just return 404.
- Credits are charged to the agency the work belongs to (the selected one), as today.
- Removing someone deletes that membership only. The account is deleted when no membership is
  left.

## 8. Changing a person's access on one client (backend only for now)

Until a per-client editor exists, a different set on one client is an edit of that row:

```sql
update membership_clients set permissions = array['generate','share']
 where user_id = '<person>' and org_id = '<agency>' and client_id = '<client>';
```

The server applies it from the next request; the person's buttons follow after their next
`/api/me` refetch. The cascade keeps the override unless the owner changes that same permission
at agency level.

## 9. Rollout

1. Migration 0062 (rewritten) is applied to staging, then production, before the code. Nothing
   reads the new columns until the code ships.
2. The code ships.
3. A later migration drops `org_role` and its old trigger once production runs the new code.

`docs/auth-production-migration.md` is updated in the same change as the migration, including a
query to list agencies with more than one owner before the backfill picks the earliest.

Resend: `RESEND_API_KEY` and a verified sending domain in each environment. Without the key the
invite is still created and the link shown to copy; the email step reports that it was not sent.

## 10. Performance

Checked against the rules in AGENTS.md:
- One `get_membership_access` per request; checks are Map and Set lookups.
- No call or channel per node, card or row. The canvas computes its permissions once.
- The cascade fires only when the set changes, as one update over that person's rows.
- Lists are single queries; the Team page counts client rows with one grouped query.
- Indexes: `membership_clients` primary key (per-request load, cascade), `client_id` (People
  list), the one-owner index, `org_invitations` token, org and email.
- Ids sent by the browser (people to add, client) are checked by the composite foreign keys and
  by `manage_clients`.

Known cost: a revoked permission is enforced on the next request, but the person's buttons only
update on their next `/api/me` refetch (focus or a 403).

## 11. Testing

- `check`: the full order of §4.2 as a table test, including several agencies and the super
  admin.
- Access built from the RPC rows: owner, member, waiting member, per-client override, several agencies.
- Coverage: every route and action has a `need` from the action list.
- Chokepoints: 404 for another agency and for a client the person is not on, 403 for a missing
  permission.
- Server actions: invite (create, resend, revoke, accept for a new and an existing account, wrong
  email), give access, edit permissions, add and remove people, switch agency, transfer owner.
- SQL (cascade, owner protection, backfill) is checked by hand on staging after the migration;
  the steps are listed in the migration doc.

## 12. Not in this work

- A per-client permission editor (§8 until then).
- Area-level permissions. Routes name only the plain actions; going granular later means adding the area to each route again. The granular build of plans 1 and 2 is kept at the local tag `perm-granular-v1` (5b19e86a) for reference.
- Roles or saved permission sets.
- Credit limits per person, and anything that happens when the pool runs low.
- Self sign-up, free trials and payments.
- A read-only person (the code keeps the place for it).
- Brand-client logins and the secure review link changes from the 12 November call.

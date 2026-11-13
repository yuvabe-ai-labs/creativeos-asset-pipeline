# Agency permissions: four permissions on the person, one owner, clients by Members list

Date: 12 November 2026. Replaces the model in `2026-11-11-permission-based-access-design.md`
(presets, 59 area ticks, picked clients per person). The enforcement plumbing built from that
spec stays; what it checks changes.

Sources:
- Anupama's summary of the 12 November 3 pm meeting (Slack, 3:18 pm).
- Cyril's reply page "Per-Person Access" (12 November).
- Arun's answers on 12 November: several agencies per person in this round, downloads open,
  existing people keep their access on day one.
- The 13 November flow review (Cyril presenting): invites are sent from inside a client; the
  owner sets permissions in one master list; setting them puts the person on the client they
  were invited to; an email tells them their access is ready.

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
| Clients | `all_clients` or a picked list, set on the person | A Members list on each client: invite someone new or add an existing member; no "all clients" for members |
| Invite | Owner sets preset, ticks and clients before sending | From inside a client, email only; the person joins and waits; the owner sets permissions in the master list, which puts them on that client |
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
  The owner has no `membership_clients` rows and is not stored on Members lists; the Members list
  shows them first as "Owner · everything".
- Only the owner can: see and use the Team page, invite and remove people, change a person's
  permissions, create and archive clients, manage Members lists, and see credit usage.
- A new agency has no owner until the owner the super admin invited accepts (§6.3).
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

A member whose `access_given_at` is null (they joined, the owner hasn't set permissions yet), or
who is on no client, sees only the onboarding screen: "You're being onboarded. Hang in there. {Agency} is setting up your access. Your
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
- index on `client_id` (Members list)

`org_invitations` (new):
- `id`, `org_id`, `client_id`, `email`, `as_owner boolean not null default false`, `token_hash`
  (sha256 of a random token), `invited_by`, `created_at`, `expires_at` (7 days), `accepted_at`,
  `revoked_at`
- foreign key `(client_id, org_id) → clients (id, org_id) on delete cascade`; check: `client_id`
  is set exactly when `as_owner` is false (a member is always invited into a client; an owner
  invite has none)
- unique index on `token_hash`
- unique partial index on `(org_id, lower(email))` where not accepted and not revoked (one open
  invite per person per agency)
- unique partial index on `(org_id)` where `as_owner` and not accepted and not revoked (one open
  owner invite per agency)
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
  transaction): when the changed row was an owner, refuse if the agency is left with no owner.
  An agency created by the super admin has no owner until its invited owner accepts; the rule
  starts to apply from then. Counting the owners that remain,
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

### 6.1 Team page: the master list (`/team`, owner only)

One place for every person in the agency and their permissions. Invites are not sent from here
(§6.2). Three sections:
- **Waiting for you.** People who accepted an invite and have no permissions yet. Card: name,
  email, "Joined {date} · invited to {client} by {name}", the four permissions as switches (none
  on by default), "Viewing, editing and downloading come with being on a client. Generate spends
  the agency's credits.", and **Give access**, which saves the permissions and sets
  `access_given_at`. Their client rows (the client they were invited to, and any they were added
  to while waiting) receive the permissions through the cascade, so they can start work at once,
  and they are emailed that their access is ready. **Remove** deletes the membership. The
  header's Team link shows the number waiting.
- **Invited.** Open invites: email, the client they were invited to, sent date, expiry, Copy
  link, Resend (new token, old one stops working), Cancel.
- **Members.** Owner first as "Owner · everything". Each member: name, email, permission chips,
  their clients. Edit opens the four switches; saving updates the agency level and the cascade
  applies it to every client. Remove asks for confirmation and deletes the membership.

### 6.2 Members on a client (`/clients/[id]/members`, owner only)

Who works on this client, and the only place invites are sent from.
- **List.** Owners first as "Owner · everything", then each person with a status: **Member**,
  **Waiting for access** (joined, permissions not set yet) or **Invited** (not joined yet).
  Permissions are not repeated here; they live on the Team page.
- **Add people** (dashed primary chip) opens one dialog with two parts:
  - **Already in {Agency}:** agency members not on this client, including people waiting for
    access, with checkboxes, then "Add {n} people". One insert; each row copies the person's
    agency-level set, so a member can start at once and a waiting person starts when given
    access.
  - **Invite someone new:** an email field. It creates the invitation for this client, emails the
    link through Resend and shows it to copy.
- **Row actions.** Remove from this client; for an invite, Resend and Cancel.
- Refused with a plain message: an invalid email, someone already in the agency ("Add them from
  the list above"), or an email with an open invite ("Already invited to {client}. Once they've
  joined, add them from the list above.").

### 6.3 Invite link (`/invite/[token]`)

- Invalid, used, revoked or expired: a plain message and a link to sign in.
- No account for the invited email: name and password, then the account, profile and membership
  are created and the person is signed in.
  - A member invite creates the membership waiting (`access_given_at` null) and the
    `membership_clients` row for the invited client with no permissions. They see the
    onboarding screen until the owner gives access.
  - An owner invite ("Set up {Agency}") makes them the owner with access given at once; they land
    on an empty client list with **New client**. Their team is invited from inside each client.
- Account exists (the person is already in another agency): sign in if needed, then
  "Join {Agency}". No second account; the new agency becomes the selected one. The rest is the
  same as for a new person.
- Signed in as a different email: "This invite is for {email}. Sign in with that email to accept
  it."
- Accepting is single use and marks the invitation accepted in the same step that creates the
  membership and the client row.
- When a member accepts, the agency's owner and the person who invited them are emailed: "{Name}
  joined {Agency}. Give them access on the Team page."

### 6.4 Onboarding screen (`/onboarding`)

The copy in §2.4. If the person belongs to other agencies, the switcher is shown too.

### 6.5 Agency switcher

In the profile menu (`ProfilePopover`), where the workspace is already shown (see
`2026-08-09-profile-popover-header-design.md`), not in the header. The workspace row becomes a
list of the person's agencies, each with "Owner" or "Member", the selected one ticked; with one
agency it reads as today. Choosing another calls a server action that checks membership, sets
`cos_org`, clears the query cache and goes home. The role label changes from Owner, Senior or
Designer to Owner or Member, and credits show only to the owner.

### 6.6 Super admin (`/admin/orgs/[id]`)

The super admin manages any agency's people from Admin, without entering the agency. The agency
page has three tabs:
- **Overview**: as today (people, clients, credits, and "View as {Agency}", which stays as it is:
  read-only, or elevated with its audit log).
- **Team**: the Team page component of §6.1 itself, with the owner's powers (invite, give access,
  edit, remove), plus **Make owner** on each member (calls `transfer_agency_owner`). The Invite
  dialog adds an **As: Member | Owner** choice; This owner invite is the only invite sent
  from the Team tab, and is offered only while the agency has no owner and no open owner invite.
- **Clients**: the agency's clients; each opens the Members component of §6.2, so the super
  admin invites into a client the same way the owner does.

Onboarding an agency: create it (name), then invite its owner from the Team tab (the one invite
that has no client). Whether this stays a screen or becomes a backend step was left open on 13
November; the screen is built unless that changes. The admin list
marks agencies with no owner yet. The temporary-password path (`addOrgMember`, D497) and
`member-role-select` are removed.

Every change the super admin makes from Admin is written to the same audit log as elevated
view-as (`logImpersonationEvent`, event type `admin_action`, with the agency, the action and the
person affected).

### 6.7 Emails (Resend)

| Email | To | When |
|---|---|---|
| "{Inviter} invited you to join {Agency} on CreativeOS" | Invited member | Invite or Resend |
| "Set up {Agency} on CreativeOS" | Invited owner | Owner invite or Resend |
| "{Name} joined {Agency}. Give them access on the Team page." | Owner and inviter | A member accepts |
| "Your access to {Agency} is ready" | The person | The owner gives access |

Invites are limited to 50 per agency per day, so a leaked session can't mass-mail. Without
`RESEND_API_KEY` the invite is still created and the link shown to copy.

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
  email, invite always tied to a client except the owner's, second invite refused, daily limit),
  give access (fills the invited client's row and sends the ready email), remove someone waiting,
  edit permissions, add and remove people, switch agency, transfer owner, and the same actions
  from Admin writing the audit log.
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

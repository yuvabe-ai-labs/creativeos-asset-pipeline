# Agency permissions: six permissions on the person, one owner, clients by Members list

Date: 12 November 2026, revised 13 November. Replaces the model in
`2026-11-11-permission-based-access-design.md` (presets, 59 area ticks, picked clients per
person). The enforcement plumbing built from that spec stays; what it checks changes.

Sources:
- Anupama's summary of the 12 November 3 pm meeting (Slack, 3:18 pm).
- Cyril's reply page "Per-Person Access", 12 November and its 13 November revision.
- The 13 November flow review (Cyril presenting): invites are sent from inside a client; the
  owner sets permissions in one master list; setting them puts the person on the client they
  were invited to; an email tells them their access is ready.
- Arun's decisions, 12 and 13 November: downloads come with View; existing people keep their
  access on day one; View and Edit are permissions (following Cyril's revision); no Invite
  permission in this version; permissions are edited only on the Team page; one agency per
  person in this version.

ADRs: D500 to D509 in the roadmap §7. The earlier permission ADRs on this branch were numbered
D489 to D493, which `staging` has since used for other decisions; they are renumbered D495 to
D499 and marked where later ones replace them.

## 1. What changes

| | 11 November spec (built in plans 1 and 2) | This spec |
|---|---|---|
| Permissions | 59 `area.level` keys | `view`, `edit`, `generate`, `approve`, `share`, `delete` |
| Where set | Preset plus per-person changes | On the person, at agency level, on the Team page only |
| Per client | One set for all the person's clients | A stored copy on each client assignment, kept in step by a cascade |
| Owner | A preset with every tick | One per agency, set up by Yuvabe, everything on every client, not editable |
| Clients | `all_clients` or a picked list, set on the person | A Members list on each client: invite someone new, add someone already in the agency, or remove |
| Invite | Owner sets preset, ticks and clients before sending | From a client's Members list, email only; the person signs up and waits; the owner sets permissions on the Team page, which puts them on that client |
| Agencies per person | One | One (several kept possible in the schema) |
| Credit limit per person | Optional | None; the agency pool is the only limit |
| Team, clients, invites, credits | Ticks | Owner only |

Kept from plans 1 and 2:
- The chokepoints and their required `need` argument: `withClient`, `withCanvas`, `withNode`,
  `withMoodboard`, `withAccess`, `withAction`, `loadClientPage`, `loadCanvasPage`.
- The coverage tests over every route and server action.
- The agency isolation fixes: routes and actions that had no agency check, the node and edge
  triggers that keep each on its canvas, scoped recent canvases and `/eval`, the Drive token,
  an empty client id failing closed.
- `/api/me` on TanStack Query, `AccessProvider`, `useCan`, `GatedButton`, the 403 access signal.
- The read-only canvas (`useCanvasEditable()`), now driven by Edit.

Removed: CASL (`@casl/ability`, `@casl/react`) and the packed rules sent to the browser, the
area catalogue, presets and their editor, per-person changes, the merge of preset and changes,
the two download levels, the node-type-to-area map, `all_clients`.

## 2. Model

### 2.1 Permissions

| Permission | Covers |
|---|---|
| View | See the client and its work (brand setup, scripts, avatars, canvases, the video editor), read comments, download files. Without View the client is not shown at all. |
| Edit | Create and change work by hand: brand setup including market research, script text, canvases and nodes, avatars, the video editor timeline, comments. Includes removing parts of an item (a node, shot, panel, comment or moodboard item). |
| Generate | Every AI run that spends credits: scripts and script copilot, storyboard panels, images, composites, video, audio and lip-sync, voices, brand extraction, market signals, canvas copilot, renders. |
| Approve | Mark a script final and reopen it; approve or request changes on an image, video or audio version. |
| Share | Client review: cut upload, review links, replies to client comments. Exports from the video editor. Copying a script's share link. |
| Delete | Remove a whole item from a library: a script, canvas, video edit, moodboard, avatar, voice, brand document or brand asset. |

Edit is separate from Generate so an owner can let someone edit without spending credits. Each
permission covers everything in a client. A person's permissions are the same on every client
they are on.

Stored as `text[]` with a check constraint that allows only the six values. Finer keys (for
example `scripts.approve`) or an Invite permission can be added to the constraint later without
a schema change.

### 2.2 Owner

Each agency has exactly one owner, set up by Yuvabe (§6.6).
- The owner has every permission on every client of the agency, including clients added later.
  The owner has no `membership_clients` rows; Members lists show them as "Owner".
- Only the owner can: use the Team page, invite people, add people to clients and remove them,
  change a person's permissions, create and archive clients, and see credit usage.
- A new agency has no owner until the invited owner signs up.
- The owner cannot be removed or demoted. Ownership moves only through the super admin
  (§6.6), which makes another member owner and the previous owner a member with all six
  permissions on every client.

Several owners may be needed later. Nothing assumes there is only one: ownership is a flag on
each membership, every check asks "is this membership an owner", lists show owners as a group,
and the protection rule is "an agency keeps at least one owner". The one-owner limit is a single
unique index (§3.1).

### 2.3 What a member has

- `org_memberships.permissions`: the agency-level set. This is what the owner edits, on the Team
  page only.
- `membership_clients` rows: one per client the person is on, each with `permissions`, the
  effective set for that client.
- When a person is added to a client, the row copies their agency-level set.
- When the agency-level set changes, the change is applied to every one of their rows (§3.3).
- A different set on one client is possible by editing that row in the database (§8).

### 2.4 Statuses

| Status | Meaning |
|---|---|
| Invited | An open invite; the person has not signed up yet. |
| Signed up | They signed up; the owner has not given permissions yet (`access_given_at` null). Shown as "Signed up · Needs permissions". |
| Member | Permissions given. |
| Owner | The agency's owner. |

A Signed up person, or a member on no client they can View, sees only the onboarding screen:
"You're being onboarded. Hang in there. {Agency} is setting up your access. Your clients will
appear here once it's ready."

## 3. Schema

Migration `0062_permission_based_access.sql` has never been applied anywhere, so it is rewritten
rather than followed by a corrective migration. Sections 7 (node and edge triggers) and the
`org_review_counts_for_types` function stay as they are.

### 3.1 Tables and columns

`org_memberships` (existing):
- `is_owner boolean not null default false`
- `permissions text[] not null default '{}'`, check: every element in
  `('view','edit','generate','approve','share','delete')`
- `access_given_at timestamptz` (null = signed up, waiting)
- `invited_by uuid references auth.users(id) on delete set null`
- unique partial index `org_memberships_one_owner on (org_id) where is_owner`
- index on `invited_by`
- `org_memberships_one_org_per_user` stays (one agency per person, §7).

`membership_clients` (new):
- `user_id`, `org_id`, `client_id`, `permissions text[] not null default '{}'` (same check),
  `added_by uuid references auth.users(id) on delete set null`, `added_at timestamptz not null default now()`
- primary key `(user_id, org_id, client_id)`
- foreign keys `(user_id, org_id) → org_memberships on delete cascade` and
  `(client_id, org_id) → clients (id, org_id) on delete cascade`. These stop a person being put
  on another agency's client in the database.
- index on `client_id` (Members list)

`org_invitations` (new):
- `id`, `org_id`, `client_id`, `email`, `as_owner boolean not null default false`, `token`
  (32 random bytes, base64url), `invited_by`, `created_at`, `expires_at` (7 days), `accepted_at`,
  `revoked_at`. The token is stored as issued so Copy link can show the same link any time; the
  table is server-only, and a link works once and expires after 7 days. Resend issues a new token
  (the old link stops working); Cancel revokes.
- foreign key `(client_id, org_id) → clients (id, org_id) on delete cascade`; check: `client_id`
  is set exactly when `as_owner` is false (a member is always invited into a client; an owner
  invite has none)
- unique index on `token`
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
- Every other membership gets all six permissions, `access_given_at = now()`, and a
  `membership_clients` row with all six for every existing client of that agency. This keeps
  today's access: every member sees and works on every client.

`org_role` stays, unread by new code, and is dropped by a later migration once production runs
this code (§9).

### 3.3 Triggers

- **Cascade.** After update of `permissions` on `org_memberships`, when old and new differ:
  one `update membership_clients` for that `(user_id, org_id)` that removes what was removed and
  adds what was added. A row-level override (§8) survives every change except one to the same
  permission.
- **Owner protection.** After update or delete on `org_memberships` (deferred to the end of the
  transaction): when the changed row was an owner, refuse if the agency is left with no owner.
  An agency has no owner until its invited owner signs up; the rule applies from then. Messages
  stay plain: "The agency owner can't be removed."
- **Owner rows.** Before insert on `membership_clients`: refuse a row for any owner of the agency.
- Trigger functions that read across memberships are `security definer` with
  `search_path = public`, as in plan 1.

### 3.4 Functions

- `get_membership_access(p_user_id uuid)` returns the membership row:
  `org_id, org_name, is_owner, access_given_at, permissions, clients jsonb` where `clients` is
  `[{ client_id, permissions }]`. It returns a set, so several agencies later need no change.
  Service role only.
- `transfer_agency_owner(p_org_id uuid, p_new_owner uuid)`: in one transaction, demotes the
  current owner to a member with all six permissions and a row for every client, and promotes
  the new one (deleting their client rows). Service role only.
- `create_agency_with_owner_invite(p_name text, p_owner_email text, p_by uuid)`: creates the
  agency and its owner invitation together (§6.6). Service role only.
- `auth_org_ids()` stays, used by RLS as `org_id in (select auth_org_ids())`.

## 4. Checker and server enforcement

### 4.1 What a request loads

The caller is resolved once per request (`resolveActingCaller`), with one call to
`get_membership_access`:

```ts
type Permission = "view" | "edit" | "generate" | "approve" | "share" | "delete";
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
  orgs: ReadonlyMap<string, OrgAccess>; // one entry in this version
};
```

`effectiveOrgId` is the person's agency, or the target agency while a super admin views as
an agency (as today).

A failed `get_membership_access` is an error page, never "no access": it must not send the
person to the onboarding screen or show an empty client list.

### 4.2 The checker

`check(access, action, { orgId, clientId })` in `src/lib/permissions/check.ts` is the only
function that decides. Actions:

```ts
type Action = Permission | "manage_team" | "manage_clients" | "view_credits";
```

Order:
1. Super admin: allow.
2. No membership in `orgId`: `not_found`.
3. Owner of `orgId`: allow.
4. A named client (`clientId` set) with access not given, no row for it, or a row without
   `view`: `not_found`. This comes before step 5 so that refusing an owner-only action never
   confirms that a client the person is not on exists.
5. `manage_team`, `manage_clients`, `view_credits`: `forbidden`. (Inviting, adding and removing
   people on a client is `manage_team`.)
6. No client named, and access not given or no client the person can view: `not_found`.
7. The action is in the client row (or, with no client named, on a client the person can view):
   allow; otherwise `forbidden`.

Every step is a Map or Set lookup. The browser runs the same function on the same data
(`check.ts` has no server-only imports), so server and browser cannot disagree. Routes and
components call `check` or `useCan` and nothing else, so rules that depend on the resource
itself can later be added behind these two functions without touching routes or screens.

### 4.3 Chokepoints

Each chokepoint loads the resource with its agency and client in one query (as now), requires
`orgId = effectiveOrgId`, then calls `check`. `not_found` returns 404; `forbidden` returns 403
with "You don't have access to this. Ask your agency owner."

`need` mapping from the old keys:

| Old keys | `need` |
|---|---|
| `*.view`, `internal_review.view`, `downloads.view`, `downloads.share`, `client_review.view` | `view` |
| `*.edit`, `client_profile.edit`, `client_review.edit` except team replies | `edit` |
| Node, shot, panel and moodboard item deletes | `edit` |
| `*.generate`, `canvas_copilot.generate`, `video_editor.generate` | `generate` |
| `scripts.approve`, `image_generation.approve`, `video_generation.approve`, `audio.approve` | `approve` |
| `client_review.share`, `video_editor.share` | `share` |
| `*.delete` on a whole library item | `delete` |
| `team.*` | `manage_team` |
| `clients.edit`, `clients.delete` | `manage_clients` |
| `credits.view` | `view_credits` |

The coverage test keeps failing any route or action without a `need`, and checks that each
`need` is one of the actions above.

### 4.4 Lists and pages

- Client list for a member: the clients whose row has `view`, in one query
  (`id = any(those client ids)`); for the owner, every client of the agency.
- Review inbox and recent canvases filter by the same client ids.
- `loadClientPage` / `loadCanvasPage` call `notFound()` on `not_found`.
- The app layout sends a waiting person (§2.4) to `/onboarding`.

## 5. Browser

- `/api/me` returns the person's agency (id, name, owner or not), whether access is given,
  their permissions, and each client id with its permissions. Seeded from the root layout,
  refetched on focus and on any 403, no retries on 4xx.
- `useCan(action, clientId)` and `GatedButton` stay. Missing Generate shows a disabled button
  with the reason; missing Edit, Approve, Share or Delete hides the control.
- Without Edit the canvas is read-only (`useCanvasEditable()` returns `can("edit")`), as the
  plan 2 view-only canvas already does: no drag, connect, drop, add or delete, post editor
  read-only, copilot answers but changes nothing.
- The canvas works out `{ view, edit, generate, approve, share, delete }` for its client once,
  in a context next to `ClientIdProvider`; nodes read from it. Nodes never run their own checks.
- `useIdentity`'s `role` (senior or designer) is removed; screens that used it ask
  `useCan("approve", clientId)`.

## 6. Screens

All screens use the existing shadcn primitives and follow Cyril's page for layout and copy.

### 6.1 Team page (`/team`, owner only)

The only place permissions are set or changed. Invites are not sent from here (§6.2). The
header's Team link shows how many people are Signed up. Three sections:
- **Waiting for you.** Signed up people. Card: name, email, "Signed up {date} · invited to
  {client} by {name}", their clients, a permission editor (chips with ×, then "Choose a
  permission" and Add; none to start), and **Give access**, which saves the permissions and sets
  `access_given_at`. Their client rows (the client they were invited to, and any they were added
  to while waiting) receive the permissions through the cascade, so they can start at once, and
  they are emailed that their access is ready. **Remove** deletes the membership.
- **Invited.** Open invites: email, the client they were invited to, sent date, expiry, Copy
  link, Resend (new token, old one stops working), Cancel.
- **Members.** Owner first. Each member: name, email, permission chips, their clients. Edit opens
  the same permission editor; saving updates the agency level and the cascade applies it to every
  client. Remove asks for confirmation and deletes the membership.

The editor's note: "These apply on every client {name} is on, and on any client they're added
to later."

### 6.2 Members on a client (`/clients/[id]/members`, owner only)

Who works on this client: invite, add and remove. Permissions are not edited here. Reached from
a **Members** button beside **Brand Workspace** on the client page.
- **List.** "{n} people on this client", then Name, Status, Actions. Status is one of §2.4.
  A Signed up person shows "Signed up · Needs permissions" with **Set permissions**, which opens
  the Team page at that person. The owner is listed with no actions.
- **Remove** takes a person off this client only; they stay in the agency, keep their other
  clients and keep their permissions. For an invite: Resend and Cancel.
- **Invite** opens a popup:
  - Step 1, **In your agency**: everyone in the agency not on this client (Members and Signed up
    people), with a search and checkboxes, then "Add {n} people". One insert; each row copies
    the person's agency-level set, so a member sees the client at once and a Signed up person
    when given access.
  - **Invite someone new** opens step 2: an email field, Back and Send invite. It creates the
    invitation for this client, emails the link and shows it to copy. "They get an email to sign
    up. Once they have, you set their permissions on the Team page."
- Refused with a plain message: an invalid email; someone already in the agency ("Already in
  {Agency}. Add them from the list."); an email with an open invite ("Already invited to
  {client}. Once they've signed up, add them from the list."); an email that already has a login
  in another agency ("This email already belongs to another agency.").

### 6.3 Invite email and sign-up (`/invite/[token]`)

- Member invite email: "You're invited to {Agency}" · "{Inviter} has invited you to join {Agency}
  on CreativeOS, to work on {client}." with **Join {Agency}**. Owner invite: "Set up {Agency} on
  CreativeOS".
- The link opens sign-up with the email fixed: name and password, then **Create account**. The
  account, profile and membership are created and the person is signed in.
  - A member invite creates the membership Signed up (`access_given_at` null) and the
    `membership_clients` row for the invited client with no permissions. They see the
    onboarding screen until the owner gives access.
  - An owner invite makes them the owner with access given at once; they land on an empty
    client list with **New client**.
- Invalid, used, revoked or expired: a plain message and a link to sign in.
- Signed in as a different email: "This invite is for {email}. Sign in with that email to accept
  it."
- Accepting is single use and marks the invitation accepted in the same step that creates the
  membership and the client row.
- When a member signs up, the owner and the person who invited them are emailed: "{Name} signed
  up to {Agency}. Give them permissions on the Team page."

### 6.4 Onboarding screen (`/onboarding`)

The copy in §2.4.

### 6.5 Profile menu

The workspace row shows the agency name and "Owner" or "Member" (was Owner, Senior or
Designer). Credits show only to the owner. There is no agency switcher in this version.

### 6.6 Super admin (`/admin`)

- **Add an agency**: one popup with the agency's name and the owner's email. It creates the
  agency and sends the owner invite (`create_agency_with_owner_invite`). "The owner gets an
  email to sign up, and can do everything in this agency." The agencies list marks agencies whose
  owner hasn't signed up yet, with Resend.
- **Agency page** (`/admin/orgs/[id]`), three tabs:
  - **Overview**: as today ("View as {Agency}" stays as it is: read-only, or elevated with its
    audit log).
  - **People**: everyone in the agency with their status (Invited, Signed up, Member, Owner), using
    the Team page component of §6.1 with the owner's powers (give access, edit, remove), plus
    **Make owner** (calls `transfer_agency_owner`).
  - **Clients**: each opens the Members component of §6.2, so the super admin invites into a
    client the same way the owner does.
- The temporary-password path (`addOrgMember`, D497) and `member-role-select` are removed.
- Every change the super admin makes from Admin is written to the same audit log as elevated
  view-as (`logImpersonationEvent`, event type `admin_action`, with the agency, the action and
  the person affected).

### 6.7 Emails (Resend)

| Email | To | When |
|---|---|---|
| "You're invited to {Agency}" | Invited member | Invite or Resend |
| "Set up {Agency} on CreativeOS" | Invited owner | Agency created, or Resend |
| "{Name} signed up to {Agency}. Give them permissions on the Team page." | Owner and inviter | A member signs up |
| "Your access to {Agency} is ready" | The person | The owner gives access |

Invites are limited to 50 per agency per day, so a leaked session can't mass-mail. Without
`RESEND_API_KEY` the invite is still created and the link shown to copy.

## 7. One agency per person

In this version a login belongs to one agency. `org_memberships_one_org_per_user` stays, and an
email that already has a login in another agency can't be invited (§6.2). Everything else is
keyed by person and agency, `get_membership_access` returns a set and `auth_org_ids()` returns
every agency, so allowing several agencies later means: drop the index, add a switcher in the
profile menu, and let an existing login join from the invite link.

## 8. Changing a person's access on one client (backend only for now)

Until a per-client editor exists, a different set on one client is an edit of that row:

```sql
update membership_clients set permissions = array['view','edit','generate']
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
- Indexes: `membership_clients` primary key (per-request load, cascade), `client_id` (Members
  list), the one-owner index, `org_invitations` token, org and email.
- Ids sent by the browser (people to add, client) are checked by the composite foreign keys and
  by `manage_team`.

Known cost: a revoked permission is enforced on the next request, but the person's buttons only
update on their next `/api/me` refetch (focus or a 403).

## 11. Testing

- `check`: the full order of §4.2 as a table test, including a person with View only, a person
  with no View on a client they are on, and the super admin.
- Access built from the RPC row: owner, member, signed-up person, per-client override.
- Coverage: every route and action has a `need` from the action list.
- Chokepoints: 404 for another agency and for a client the person can't view, 403 for a missing
  permission.
- Server actions: invite (create, resend, cancel, sign up, wrong email, invite always tied to a
  client except the owner's, second invite refused, email with a login elsewhere refused, daily
  limit), give access (fills the invited client's row and sends the ready email), remove someone
  waiting, edit permissions, add and remove people on a client, add an agency with its owner,
  transfer owner, and the same actions from Admin writing the audit log.
- SQL (cascade, owner protection, backfill) is checked by hand on staging after the migration;
  the steps are listed in the migration doc.

## 12. Not in this work

- An Invite permission for people other than the owner (Cyril's page; later).
- One person in several agencies (§7).
- A per-client permission editor (§8 until then).
- Area-level permissions. Routes name only the plain actions; going granular later means adding
  the area to each route again. The granular build of plans 1 and 2 is kept at the local tag
  `perm-granular-v1` (5b19e86a) for reference.
- Roles or saved permission sets.
- Credit limits per person, and anything that happens when the pool runs low.
- Self sign-up, free trials and payments.
- Brand-client logins and the secure review link changes from the 12 November call.

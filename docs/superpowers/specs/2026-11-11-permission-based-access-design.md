# Permission-based access: presets, ticks, picked clients, owners invite their team

*Recorded 2026-11-11. Decisions D489–D493 in the ADR log
([2026-05-30-creativeos-staging-roadmap.md §7](2026-05-30-creativeos-staging-roadmap.md)).
Builds on the auth model of D43/D44/D80/D164/D181/D188.*

## 1. What this changes

Today a member's access comes from one of three fixed roles (`org_role`: owner, senior,
designer). The only thing the role gates is approving a version (`canSetApproval`). Every
member sees and edits every client in their agency, and only the super admin can add or
remove people (D164).

After this change:

- Each person has a **preset** (Owner, Senior, Designer) plus any ticks their owner
  changed for them. Together these give a set of permissions such as `scripts.edit` or
  `video_generation.generate`.
- Each person sees either **all clients** (including ones created later) or a **picked
  list**.
- An agency owner **invites their own team** from a Team page inside the app.
- The super admin sets up the presets, and every agency uses that one set.
- The server checks a named permission on every route and server action.

In scope: the permission data model, server enforcement, client scope, the Team page,
invites (email via Resend plus a copyable link), moving existing members across, and
keeping the schema ready for one person in several agencies.

Not in scope (later, after discussion with the lead): per-person usage limits, free trial
credits, self sign-up for new agencies, securing brand-client review links, and a Client
role. Activity log is not an area yet because no screen for it exists.

## 2. Model

### 2.1 Permissions

A permission is `area.level`. The levels are `view`, `edit`, `generate`, `approve`,
`share`, `delete`; each area offers only the levels that apply to it.

| Group | Area key | Covers | Levels |
|---|---|---|---|
| Brand setup | `client_profile` | Name, logo, website, linked Drive folder | view, edit |
| | `brand_knowledge` | KB documents and images, extracted facts, ready-check | view, edit, generate, delete |
| | `brand_assets` | Brand kit files, social asset imports | view, edit, generate, delete |
| | `market` | Signals, references, tracked handles, performance numbers | view, edit, generate, delete |
| | `moodboards` | Boards and their items | view, edit, delete |
| Story | `scripts` | Script library, writing, script copilot, mark final, reopen, script review share | view, edit, generate, approve, share, delete |
| | `storyboard` | Visualise panels, location plates, panel pick per shot | view, edit, generate |
| | `avatars` | Cast library, avatar images, turnaround sheet, assigned voice | view, edit, generate, delete |
| | `voices` | Voice library, saved voices, cloning | view, edit, generate, delete |
| Production | `canvases` | Create, rename, nodes, prompts, uploads, Drive import, restore versions | view, edit, delete |
| | `image_generation` | Images, composites, compose, upstream references | view, generate, approve |
| | `video_generation` | Video, multishot, scene split, video prompts, video edit | view, generate, approve |
| | `audio` | Dubbing, voice change, lip-sync | view, generate, approve |
| | `canvas_copilot` | The canvas AI chat that adds and changes nodes | view, generate |
| | `video_editor` | Timeline, transcripts, renders, exports | view, edit, generate, share |
| Review and delivery | `internal_review` | Review inbox, region notes | view, edit |
| | `client_review` | Cut upload, review links, client comments, team replies | view, edit, share, delete |
| | `downloads` | View = download approved finals; Share = download anything, drafts included | view, share |
| Running the agency | `clients` | Create, rename, archive clients | view, edit, delete |
| | `team` | Invite and remove people, change their ticks and clients | view, edit, delete |
| | `credits` | Credit usage and costs | view |

Changes from the proposal table shown to the lead:

- **Approving a version** needs Approve on that node's area (`image_generation.approve` for
  an image node, `scripts.approve` for marking a script final, and so on).
  `internal_review` therefore has View and Edit (region notes), not Approve, so one action
  never has two ticks deciding it.
- **`client_profile` has no Delete.** Deleting a client is `clients.delete`.
- **`credits` is View only.** Buying credits and changing plan do not exist yet.

**Rules applied when computing a person's permissions:**

1. Any tick in an area also grants that area's `view`.
2. Every permission applies only inside the person's client scope (§2.4).
3. A key the code no longer knows is ignored.

**The catalogue lives in code**, at `src/lib/permissions/catalogue.ts`: areas, levels,
labels, groups and order. A tick only means something where the server checks it, so a
new area always arrives with code. When it does, the same change ships a migration that
adds the new keys to the presets that should get them. Everything an admin changes lives
in the database.

### 2.2 Presets

| Preset | Ticks |
|---|---|
| **Owner** | Everything, always. Fixed: it can't be edited and can't have per-person changes. |
| **Senior** | Every level in every area except `team.*`. |
| **Designer** | Same as Senior, minus every `approve` (including `scripts.approve`). |

Senior and Designer match what those roles can do today:

- Every member can create clients and see credit usage today, so both presets keep
  `clients.*` and `credits.view`.
- The super admin can untick these in the preset later. Because people follow their
  preset (§2.3), that change reaches everyone using it.

The only new power on day one is Owner's `team.*`.

### 2.3 What a person has

```
effective = Owner preset        → every key in the catalogue
            otherwise           → preset keys
                                  + keys the owner ticked for this person
                                  − keys the owner unticked for this person
            then apply rule 1   (any tick in an area → that area's view)
```

People **follow their preset**. When the super admin edits a preset, or a migration adds a
new area to it, everyone on that preset gets the change. Their owner's changes stay on top.

### 2.4 Client scope

A membership is either `all_clients = true` (every client of the agency, including future
ones) or a list in `membership_clients`. When a person with a list creates a client, that
client is added to their list in the same write.

A client outside the caller's scope behaves exactly like a client in another agency: 404,
and it is never listed, so its existence is not confirmed.

## 3. Schema

One migration (`0062_permission_based_access.sql`), plus a later one that drops `org_role`.

```sql
create table role_presets (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- 'owner' | 'senior' | 'designer' | …
  name        text not null,
  description text not null default '',
  is_owner    boolean not null default false,
  sort        int not null default 0,
  archived_at timestamptz,                   -- hidden from the invite dialog; only when unused
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create unique index role_presets_one_owner on role_presets (is_owner) where is_owner;

create table role_preset_permissions (
  preset_id      uuid not null references role_presets(id) on delete cascade,
  permission_key text not null,
  primary key (preset_id, permission_key)
);

alter table org_memberships
  add column preset_id   uuid references role_presets(id),
  add column all_clients boolean not null default true,
  add column invited_by  uuid references auth.users(id) on delete set null;
-- backfilled from org_role, then set not null

create table membership_permission_changes (
  user_id        uuid not null,
  org_id         uuid not null,
  permission_key text not null,
  granted        boolean not null,   -- true = ticked on top of preset, false = unticked
  primary key (user_id, org_id, permission_key),
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade
);

alter table clients add constraint clients_id_org_unique unique (id, org_id);

create table membership_clients (
  user_id   uuid not null,
  org_id    uuid not null,
  client_id uuid not null,
  primary key (user_id, org_id, client_id),
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade,
  foreign key (client_id, org_id) references clients (id, org_id) on delete cascade
);
create index membership_clients_client_idx on membership_clients (client_id);

create table org_invitations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  email          text not null,                -- stored lowercased
  display_name   text,
  preset_id      uuid not null references role_presets(id),
  changes        jsonb not null default '{"granted":[],"revoked":[]}',
  all_clients    boolean not null default true,
  client_ids     uuid[] not null default '{}',
  token_hash     text not null unique,         -- sha256 of the token; the token is never stored
  invited_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  accepted_at    timestamptz,
  revoked_at     timestamptz
);
create unique index org_invitations_one_open_per_email
  on org_invitations (org_id, email) where accepted_at is null and revoked_at is null;
```

All new tables get RLS enabled with no policies (default-deny, as 0017). They are read and
written only by the service-role server path.

**Notes:**

- The composite foreign key on `membership_clients` means a person can only be given
  clients of their own agency, enforced by the database.
- **Last owner:** the `org_memberships_last_owner` trigger (0012) is rewritten to count
  memberships whose preset has `is_owner`. It keeps covering DELETE and demotion.
- **Backfill:** each membership gets the preset matching its `org_role` and
  `all_clients = true`. The seeded preset rows match §2.2.
- **Removing `org_role`:** the column stays (no longer read) until the code that reads it
  is gone in production, then a follow-up migration drops it and its check constraint.

**One access read per request:** an RPC `get_membership_access(p_user_id uuid)` returns
- the membership (org, preset key, is_owner, all_clients),
- the preset's keys,
- the person's changes,
- their client ids.

That is one round trip. The effective set is computed in TypeScript by a pure function
(§2.3), so it is unit-tested without a database.

## 4. One person, several agencies (later): kept possible now

For now a person belongs to one agency. The schema and code stay ready for more:

- **Keys:** every grant, client list and change is keyed by `(user_id, org_id)`, never by
  `user_id` alone.
- **The index:** `org_memberships_one_org_per_user` stays. It is the "one for now" rule,
  and dropping it is part of the later change.
- **One place picks the membership.** `resolveCallerContext` is the only code that turns a
  user into a membership. Today it takes the only row; later it takes the agency chosen in
  an agency switcher (a cookie checked against the user's memberships). No other code
  queries `org_memberships` by user to find "their" org; the plan moves any that do.
- **RLS, fixed now.** Five policies (0014, 0035, 0040) use
  `org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)`. With
  two memberships, `limit 1` picks an arbitrary agency. They are rewritten to
  `org_id in (select auth_org_ids())`, a `security definer` SQL function returning the
  caller's org ids. Today this behaves the same.
- **Removing a person** deletes the membership. The account (profile + auth user) is
  deleted only if no other membership remains. Today that is always the case, so D181's
  behaviour is unchanged.
- **Inviting an email already in another agency** is refused for now: "This person already
  belongs to another agency." Later, the same case adds a second membership instead.

## 5. Server enforcement

### 5.1 Caller context

`CallerContext` gains:

```ts
access: {
  presetKey: string;
  isOwner: boolean;
  permissions: ReadonlySet<PermissionKey>;
  clientScope: "all" | ReadonlySet<string>;   // client ids
}
```

It is loaded inside `resolveCallerContext` with the RPC above, replacing today's
membership select, so the number of database calls per request does not grow. From the
same data the server builds a CASL ability (§6). Helpers live in `src/lib/permissions/`:

- `can(caller, key, clientId?)`
- `canSeeClient(caller, clientId)`
- `assertCan(caller, key, clientId?)`, which throws a typed `ForbiddenError`

The helpers wrap the ability, and route code never calls CASL directly. `clientId` is
required for client-scoped areas: the type of `key` decides whether it can be left out
(§6.2).

If the access read fails, the request fails. It is never treated as "no permissions" or
"all permissions" (performance rule 13).

**Impersonation (D81/D101):** while a super admin impersonates an agency, the context
carries the Owner preset's access for that agency. The read-only vs elevated write rules
are unchanged.

### 5.2 Chokepoints

`withClient`, `withCanvas`, `withNode` and `withMoodboard` already resolve the client and
check the org. Each gains:

1. **A client-scope check** after the org check, returning 404 like a foreign org.
2. **A required permission argument**, for example
   `withClient(req, params, { need: "scripts.edit" }, handler)`. Required means TypeScript
   forces every handler to decide. A missing permission returns 403 with
   "You don't have access to this. Ask your agency owner."

`withAction` gains the same `need` argument for server actions.

Each HTTP method declares its own permission, so a GET can need `scripts.view` and the
POST on the same path `scripts.edit`.

**Routes outside the chokepoints:**
- `/api/review/inbox` and `/api/review/counts` need `internal_review.view` and filter to
  the caller's client scope.
- `/api/copilot/*` resolves the canvas through `withCanvas` and needs
  `canvas_copilot.generate`.

**Route groups → areas**, as a guide (the plan maps each of the 150 routes):

| Routes | Area |
|---|---|
| `clients/[id]` root, `name`, `logo`, `website-url`, `drive-folder` | `client_profile` |
| `clients/[id]/kb/*`, `image-analysis` | `brand_knowledge` |
| `clients/[id]/brand-kit/*`, `asset-imports/*` | `brand_assets` |
| `clients/[id]/market/*`, `performance/*` | `market` |
| `moodboards/*`, `clients/[id]/moodboards` | `moodboards` |
| `clients/[id]/scripts/*` (except below) | `scripts` |
| `scripts/[scriptId]/visualise`, `panels/*`, `locations/*/plate` | `storyboard` |
| `clients/[id]/avatars/*` | `avatars` |
| `clients/[id]/voices/*`, `elevenlabs/voices/*` | `voices` |
| `nodes/[id]/file/*`, `duplicate`, `duplicate-batch`, `parse`, `versions`, `restore-version`, `canvas/*` | `canvases` |
| `nodes/[id]/image-generate`, `composite-generate`, `compose/*`, `upstream-images` | `image_generation` |
| `nodes/[id]/video-generate`, `video-prompt`, `multishot-prompt`, `split-scene`, `video-edit` | `video_generation` |
| `nodes/[id]/dub`, `dub-voice-preview`, `voice-change`, `lip-sync` | `audio` |
| `canvases/[cid]/editor/*` | `video_editor` |
| `canvases/[cid]/review`, `approval-statuses`, `review/*` | `internal_review` |
| `nodes/[id]/client-review/*`, `canvases/[cid]/client-feedback`, `scripts/*/review/*` | `client_review` |

**Downloads.** Files are served from storage URLs, not through our routes, so `downloads.*`
is checked where a download URL is issued. Before release, the plan lists every place that
hands the browser a file URL for download and puts each behind `downloads.view` (approved
versions) or `downloads.share` (anything). Showing media inside the app stays under the
area's `view`.

**Approving a version** (`setVersionApprovalAction`) replaces
`canSetApproval(caller.orgRole)` with `can(caller, areaOf(node) + ".approve")`. `areaOf`
maps a node type to its area and lives next to the catalogue. As today (D166), the check
runs before any database read.

### 5.3 Coverage test

`src/lib/permissions/route-coverage.test.ts` works like `with-action-coverage.test.ts`. It
enumerates every `route.ts` under `src/app/api` and every exported handler, and asserts
each one either:
- calls a chokepoint with `need:`, or calls `assertCan`, or
- is on an allowlist with a one-line reason.

The allowlist covers:
- `webhooks/*` (shared secret)
- `r/*` (share token, no account)
- `me`, `image-proxy` and `drive/*` (signed-in only, no agency data written)
- `admin/*` (`requireSuperAdmin`)

A second assertion: every catalogue key is used by at least one check, so no tick does
nothing.

### 5.4 Pages and lists

Server pages check the permission for the page and `notFound()` without it. For example:
- `/clients/[id]/kb` needs `brand_knowledge.view`.
- `/team` needs `team.view`.

The clients list on the home page filters to the caller's scope.

## 6. Library and conditional rendering

### 6.1 Choice: CASL for evaluation; the database stays the source

Checked 2026-11-11:

| Option | What it is | Fit here |
|---|---|---|
| **CASL** (`@casl/ability` 7.1, `@casl/react` 7.1) | TypeScript library. The same rules object answers `can(action, subject)` on the server and in the browser; rules are plain JSON; `<Can>` / `useAbility` for React; Mongo-style conditions per rule. | **Chosen.** Our model maps directly: level = action, area = subject, client scope = a condition. No extra service, no network call per check. |
| Hand-rolled `can()` | A set of keys and a client-id set. | Works today, but we would write and maintain our own React gating, rule transfer and conditions. The likely next step (a different preset per client, e.g. Senior on Jackfruit and Designer on Madras Sarees) would have to be built from scratch; in CASL it is a condition on a rule. |
| Casbin | Policy engine with its own model and policy language, many languages. | More configuration than a TypeScript-only app needs; no React integration. |
| Cerbos, OpenFGA, SpiceDB, Permit.io | Separate authorization services (policy-as-code, or relationship graphs in the style of Google Zanzibar). | Each check becomes a network call or a sync job, against performance rules 1 and 5. They are another system to run and keep in sync with Postgres, and solve relationship-graph sharing we don't have. |
| Oso | Policy library. | The open-source library is deprecated in favour of the hosted Oso Cloud. |
| Supabase custom claims (access-token hook + `authorize()` in RLS) | Permissions written into the JWT. | Claims stay stale until the token refreshes, so "takes effect on the next click" breaks. Around 60 keys plus client ids also bloat every token. Our server path uses the service role with app-layer checks (D44), so RLS is a backstop, not where these checks run. |

Other products work the same way at the model level:
- **Google Cloud IAM** has predefined roles that bundle permissions, granted on a resource.
- **Vercel** has base roles plus extended permissions, and a person gets the union.
- **Linear** deliberately keeps workspace roles few and scopes power to teams.

Our presets + per-person ticks + client scope is that pattern. What stays ours is the
storage (§3) and the admin screens. CASL only evaluates.

**CASL security:**
- **Its 2026 advisories:**
  - CVE-2026-1774 (critical, fixed in 6.7.5)
  - a medium-severity issue in `rulesToFields` (fixed in 7.0.2)

  Both are prototype pollution through rule conditions that an attacker controls.
- **Why it doesn't apply here:** rules are built only on the server, only from catalogue
  keys and client ids read from our database. Nothing from a request ever becomes a rule
  or a condition, and `rulesToFields` is not used.
- **Pinning:** exact versions (no caret), with releases at least two weeks old when
  installed.

### 6.2 How rules are built

```ts
// src/lib/permissions/ability.ts (server and browser share this file)
type Level = "view" | "edit" | "generate" | "approve" | "share" | "delete";
type Area = (typeof CATALOGUE)[number]["key"];
type AppAbility = MongoAbility<[Level, Area | ForcedSubject<Area>]>;

buildRules(access) →
  for each effective key "area.level":
    client-scoped area, scope "all"  → { action: level, subject: area }
    client-scoped area, picked list  → { action: level, subject: area,
                                         conditions: { clientId: { $in: ids } } }
    agency-wide area (team, credits, clients) → { action: level, subject: area }
```

**CASL's one sharp edge.** Asking about a subject *type* (`can("edit", "scripts")`)
ignores conditions and answers "yes if any rule exists". That is the right answer for the
UI ("show the Scripts tab"). On the server it is not enough, so `can`/`assertCan` require
`clientId` for client-scoped areas and check `subject(area, { clientId })`. The chokepoints
always pass it. A unit test asserts every client-scoped key is refused without it.

### 6.3 Getting rules to the browser without a flash

Today `useIdentity` fetches `/api/me` after mount through a hand-rolled module cache, so a
component renders before access is known. This change moves it to TanStack Query (AGENTS.md:
hand-rolled hooks move when substantially changed):

1. `src/services/me.service.ts` holds `fetchMe()`; `src/hooks/queries/me.ts` holds
   `meKeys.current()` and `useMe()`.
2. The root layout (a Server Component) already resolves the caller. It passes the `/api/me`
   payload, including the packed rules (`packRules`), into an `AccessProvider` client
   component. That component seeds the query with it as `initialData` and builds the
   ability. The first HTML therefore already has the right buttons, with no flash and no
   extra request.
3. `useMe()` refetches on window focus. Any 403 from our API invalidates `meKeys.current()`,
   so a mid-session change by the owner shows up without a reload. On a new payload the
   provider calls `ability.update(rules)`, and `<Can>` / `useAbility` re-render.
4. Sign-out clears the query cache, which replaces `resetIdentityCache()`.

### 6.4 Rendering rules

The server is the authority; the browser only decides what to show. This is the Next.js
"optimistic vs secure" split (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
Authorization): page and component checks shape the screen, while route handlers and
server actions do the real check. A layout that returns `null` is never relied on, because
nested routes and actions are separate entry points.

| Case | What the person sees |
|---|---|
| No View on an area | Its tab or nav item is not shown. Its page calls `notFound()` on the server. |
| View only | The content renders read-only:<br>• editable fields render as plain text, without the dotted-underline hover<br>• "Add" chips and drag handles are absent<br>• the canvas runs with React Flow's `nodesDraggable`, `nodesConnectable` and `edgesReconnectable` off, while selecting stays on so nodes can be inspected |
| Missing Generate | The Generate button is shown disabled with "Generating is turned off for you. Ask your agency owner." People know the feature exists and whom to ask. |
| Missing Approve | Approve / Request changes are not shown; the version's status is. |
| Missing Delete, Share, Team or Clients edit | The action is not shown. |
| Client outside scope | Never listed. A direct link gets the 404 page. |

**Coding rules:**

- **Check capabilities, never preset names.** `can("scripts.approve")`, never
  `presetKey === "senior"`. A lint rule (`no-restricted-syntax` on comparisons with
  `presetKey`) keeps that true.
- **Server Components** use `can(caller, …)` directly. They can't use React context, so
  `<Can>` is for client components only.
- **One ability per screen.** It is built once from the query data and read from context.
  A per-node component calls `useAbility()` and does an in-memory check: no fetch, no
  channel, no store scan (performance rules 1 and 2). The ability object only changes when
  the rules change, so canvas drags don't re-render gated components.
- **One wrapper per pattern.** `<Can>` covers show/hide. For disabled-with-reason, a small
  `GatedButton` in `src/components/permissions/` wraps the shadcn `Button` with a tooltip,
  so the copy and behaviour stay the same everywhere.

## 7. Team page and invites

### 7.1 Team page (`/team`, needs `team.view`)

Lists members (name, email, preset, "N changes" if any, clients: All or a count) and
pending invites (sent, expires, copy link, resend, revoke). Members with `team.edit` see
the controls.

The same dialog invites and edits:

1. **Who:** email and name.
2. **Preset:** Owner, Senior or Designer. Choosing one fills the ticks.
3. **Ticks:** the area × level matrix from the catalogue, plus a "Set everything to view
   only" shortcut. Ticks that differ from the preset are marked, and "Reset to preset"
   clears them.
4. **Clients:** "All clients, including new ones" or a picked list.

Saved as: preset + the differences from it (stored as `granted` / `revoked`) + client
scope.

**Rules, enforced in the server action:**

- **No escalation.** You can't give a tick you don't have, or a client you can't see. As a
  result, only an Owner can make someone an Owner.
- **Not on yourself.** Nobody changes their own access or removes themselves from the
  Team page.
- **Last owner.** The database trigger refuses removing or demoting it, and its message is
  shown in plain words.
- **Removing** someone needs `team.delete`. Their work stays and attribution degrades as in
  D181.

Changes take effect on the person's next request, because access is read per request.
Generations already running finish (the job belongs to the person who started it).

### 7.2 Invite lifecycle

1. **Create.** `inviteMemberAction` validates the rules above, refuses an email that
   already has a membership (§4), revokes any open invite for the same email in this
   agency, and inserts the invite:
   - 32 random bytes, base64url; only their sha256 is stored
   - `expires_at` = now + 7 days
2. **Deliver.** The link is `/invite/[token]`. It is emailed through **Resend** from our
   server (`RESEND_API_KEY`, sender domain set up once), and the owner can also copy it
   from the dialog. If the email fails to send, the invite still exists, and the dialog
   says so and offers the copy link.
3. **Accept.** `/invite/[token]` is public and shows the agency name and who invited. The
   person sets their name and password. The server then:
   - looks up the hash; it must be unaccepted, unrevoked and unexpired
   - creates the auth user (`email_confirm: true`)
   - creates the profile and the membership with the invite's preset, changes and clients
     (client ids no longer in the agency are dropped)
   - marks the invite accepted and signs the person in

   If any step after creating the user fails, the user is deleted, mirroring
   `addOrgMember`'s cleanup.
4. **Resend** issues a new token and invalidates the old one. **Revoke** sets `revoked_at`.

A copied link can be forwarded. The account is created with the invited email, and the
owner vouches for who receives it.

**The super admin uses the same path.** Onboarding an agency = creating it on `/admin`,
then inviting its owner with the Owner preset. The temporary-password `addOrgMember` flow
and `must_change_password` for new accounts are retired. The forced change stays only for
accounts that already have the flag set.

### 7.3 Preset editor (super admin, on `/admin`)

`/admin/presets` lists the presets with the same matrix. The super admin can:
- edit Senior and Designer
- add a preset
- archive a preset nobody uses

Owner is shown read-only. A save names how many people it affects ("Changes access for 12
people in 3 agencies") before it is applied.

## 8. Rollout

1. **Migration 0062.** Applied before the code; nothing reads the new tables yet.
2. **Code.**
   - the RPC and the effective-access function
   - CASL (pinned) with the ability builder
   - chokepoint `need` arguments on every route, and the coverage tests
   - `/api/me` on TanStack Query, seeded from the layout
   - read-only rendering
   - the Team page, invites and the preset editor
   - the RLS rewrite
3. **After production runs on the new code:** migration drops `org_role`.

On day one every person has their old role's preset and all clients. Senior and Designer
can do exactly what they could before. Owners additionally see the Team page.

`docs/auth-production-migration.md` is updated in the same change as each migration.

## 9. Testing

- **Unit (pure):** effective access (preset + granted − revoked, Owner = all, any tick →
  view, unknown keys ignored), no-escalation checks, `areaOf` for every node type.
- **Ability:** rules built for "all clients" and for a picked list. A client-scoped check
  without `clientId` is refused. A check for a client outside the list is refused. The
  packed rules survive the server → browser round trip unchanged.
- **Rendering:**
  - the first server render of a page shows the right buttons for a view-only person,
    with no change after hydration
  - a 403 refreshes `meKeys.current()`
  - `GatedButton` shows its reason when disabled
- **Coverage:** every route handler and action declares a permission, and every catalogue
  key is checked somewhere.
- **Chokepoints:** a client out of scope → 404; a missing permission → 403; a failed access
  read → error, not empty.
- **Invites:** hashing, expiry, single use, resend invalidates, revoke, email already in an
  agency, client deleted between invite and accept, rollback on failure.
- **Database:** last-owner trigger with presets, the composite foreign key refusing another
  agency's client, `auth_org_ids()` in the rewritten policies.
- **Performance check:** on a 300-node canvas, load makes the same number of requests as
  today. The access read replaces the membership read, and permission checks are in
  memory.

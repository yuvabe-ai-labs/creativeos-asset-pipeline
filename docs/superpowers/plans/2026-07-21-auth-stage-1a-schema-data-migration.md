# Auth Stage 1A — Schema & Data Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the organizations / profiles / org_memberships schema and safely move all existing data under the Yuvabe org, losing nothing — with the app still running exactly as today (unauthenticated).

**Architecture:** Two plain-SQL migrations. `0012` creates the three new tables + a last-owner trigger + a one-org-per-user unique index, and seeds the Yuvabe org. `0013` is the data migration: it adds `clients.org_id` nullable, backfills every existing client to Yuvabe, guards against any missed row, then locks the column `not null`. No app code changes in 1A; no RLS (that is Stage 2).

**Tech Stack:** PostgreSQL (Supabase), plain `.sql` migration files applied via the Supabase dashboard SQL editor (this repo has no Supabase CLI / migrate script).

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-1-index.md` · **Spec:** `docs/superpowers/specs/2026-07-21-auth-staging-rollout-plan.md` (Stage 1)

## Global Constraints

- **No RLS in Stage 1.** Do not add `enable row level security` or policies. (Stage 2.)
- **Migration numbering:** next files are `0012_auth_multi_tenancy.sql` then `0013_clients_org_id.sql`. Plain SQL, up-only files (matching repo style — e.g. `0011_client_drive_folder.sql` is a single `alter table`). Rollback SQL lives in this plan doc, not in the migration files.
- **Apply migrations against the staging Supabase project** via the dashboard SQL editor (no CLI in repo). Verify with the SQL queries given in each task.
- **`platform_role` is never a DB column** — it lives in `auth.users.app_metadata`. The bootstrap doc sets it via `update auth.users ... raw_app_meta_data`.
- **Do not lose data.** `clients.org_id` goes nullable → backfilled → `not null`; the final lock is a guard that aborts if any row missed backfill. Record pre/post counts.
- **`org_role` check constraint accepts `owner`/`senior`/`designer`** (schema stays multi-seat-ready) but the pilot only ever creates `owner`.

## File Structure

**New files**
| File | Responsibility |
|---|---|
| `supabase/migrations/0012_auth_multi_tenancy.sql` | organizations, profiles, org_memberships; unique-one-org-per-user index; last-owner trigger; seed Yuvabe org |
| `supabase/migrations/0013_clients_org_id.sql` | Data migration: `clients.org_id` add-nullable → backfill Yuvabe → guard → not null → index |
| `docs/auth-bootstrap.md` | One-time manual super_admin bootstrap (dashboard + SQL); not app code |

No app/source files change in 1A.

## Rollback reference (run only if staging verification fails; reverse order)

```sql
-- Undo 0013 (data migration). Original client data is untouched — only the added column drops.
drop index if exists clients_org_id_idx;
alter table clients drop column if exists org_id;

-- Undo 0012 (schema). Drop in reverse dependency order.
drop trigger if exists org_memberships_last_owner on org_memberships;
drop function if exists enforce_last_owner();
drop table if exists org_memberships;
drop table if exists profiles;
drop table if exists organizations;
```

---

## Task 1: Migration 0012 — auth & multi-tenancy schema

**Files:**
- Create: `supabase/migrations/0012_auth_multi_tenancy.sql`

**Interfaces:**
- Produces: tables `organizations(id, name, slug, monthly_credit_limit, created_at)`, `profiles(user_id, display_name, created_at)`, `org_memberships(user_id, org_id, org_role, joined_at)`; unique index `org_memberships_one_org_per_user`; trigger `org_memberships_last_owner`; a seeded org with `slug = 'yuvabe'` and `monthly_credit_limit = null`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0012_auth_multi_tenancy.sql`:

```sql
-- Stage 1A auth & multi-tenancy schema. No RLS here (Stage 2). No clients change here (0013).

-- 1. Tenant boundary
create table organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  monthly_credit_limit  numeric,            -- null = unlimited (Yuvabe's own org)
  created_at            timestamptz not null default now()
);

-- 2. App's extension of auth.users (display info only)
create table profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

-- 3. Membership bridge — multi-seat-ready from day one; pilot creates only 'owner'.
create table org_memberships (
  user_id   uuid not null references auth.users(id) on delete cascade,
  org_id    uuid not null references organizations(id) on delete cascade,
  org_role  text not null check (org_role in ('owner', 'senior', 'designer')),
  joined_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- One active org per user in the pilot (D80). Multi-seat later drops this index.
create unique index org_memberships_one_org_per_user on org_memberships (user_id);
create index org_memberships_org_id_idx on org_memberships (org_id);

-- 4. Last-owner guard (D80): an org must always keep at least one owner.
create or replace function enforce_last_owner()
returns trigger language plpgsql as $$
declare
  target_org uuid;
  remaining_owners int;
begin
  target_org := coalesce(old.org_id, new.org_id);
  select count(*) into remaining_owners
    from org_memberships
    where org_id = target_org and org_role = 'owner'
      and user_id <> old.user_id;
  if tg_op = 'DELETE' and old.org_role = 'owner' and remaining_owners = 0 then
    raise exception 'Cannot remove the last owner of an organization';
  end if;
  if tg_op = 'UPDATE' and old.org_role = 'owner' and new.org_role <> 'owner'
     and remaining_owners = 0 then
    raise exception 'Cannot demote the last owner of an organization';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger org_memberships_last_owner
  before update or delete on org_memberships
  for each row execute function enforce_last_owner();

-- 5. Seed the Yuvabe org (unlimited credits)
insert into organizations (name, slug, monthly_credit_limit)
  values ('Yuvabe Studios', 'yuvabe', null);
```

- [ ] **Step 2: Apply to staging**

Open the Supabase dashboard → SQL editor for the **staging** project. Paste the file contents and run.
Expected: "Success. No rows returned." No errors.

- [ ] **Step 3: Verify tables, index, trigger, and seed exist**

Run each query in the SQL editor:

```sql
-- tables present
select table_name from information_schema.tables
  where table_schema = 'public'
    and table_name in ('organizations','profiles','org_memberships')
  order by table_name;
-- expect 3 rows

-- unique index present
select indexname from pg_indexes
  where tablename = 'org_memberships'
    and indexname = 'org_memberships_one_org_per_user';
-- expect 1 row

-- trigger present
select tgname from pg_trigger where tgname = 'org_memberships_last_owner';
-- expect 1 row

-- Yuvabe org seeded, unlimited
select slug, monthly_credit_limit from organizations where slug = 'yuvabe';
-- expect: yuvabe | null
```
Expected: each returns the row count noted in the comment.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_auth_multi_tenancy.sql
git commit -m "feat(auth): schema — organizations, profiles, org_memberships + last-owner guard"
```

---

## Task 2: Migration 0013 — clients data migration (the "don't lose data" step)

**Files:**
- Create: `supabase/migrations/0013_clients_org_id.sql`

**Interfaces:**
- Consumes: the seeded Yuvabe org from Task 1.
- Produces: `clients.org_id uuid not null references organizations(id)`, every existing client attributed to Yuvabe, index `clients_org_id_idx`.

- [ ] **Step 1: Record the pre-flight client count**

In the SQL editor, run and **write down the number**:

```sql
select count(*) as clients_before from clients;
```
Keep `clients_before` for Step 4's parity check.

- [ ] **Step 2: Write the data-migration file**

Create `supabase/migrations/0013_clients_org_id.sql`:

```sql
-- Stage 1A data migration: attribute all existing clients to the Yuvabe org.
-- Nullable → backfill → guard → not null. The guard + the not-null lock make silent
-- data loss impossible: if any client misses backfill, this migration ABORTS.

alter table clients add column org_id uuid references organizations(id);

update clients
  set org_id = (select id from organizations where slug = 'yuvabe')
  where org_id is null;

-- Guard: abort loudly before locking the column if any row slipped through.
do $$
declare unbackfilled int;
begin
  select count(*) into unbackfilled from clients where org_id is null;
  if unbackfilled > 0 then
    raise exception 'Aborting data migration: % client row(s) have no org_id after backfill', unbackfilled;
  end if;
end $$;

alter table clients alter column org_id set not null;
create index clients_org_id_idx on clients (org_id);
```

- [ ] **Step 3: Apply to staging**

Paste into the SQL editor and run.
Expected: "Success." If instead you see `Aborting data migration: N client row(s)...`, STOP — do not force `not null`; investigate why a client has no org_id (should be impossible with one org). The transaction rolls back and no column is locked.

- [ ] **Step 4: Verify no data lost, everything under Yuvabe**

```sql
-- No client left unattributed
select count(*) as unbackfilled from clients where org_id is null;
-- expect 0

-- Count parity: every client still here, all under Yuvabe
select count(*) as clients_after,
       count(*) filter (where org_id = (select id from organizations where slug='yuvabe')) as under_yuvabe
  from clients;
-- expect clients_after == clients_before (Step 1) AND under_yuvabe == clients_after

-- FK tree intact: canvases still resolve to their clients (spot check)
select c.slug, count(cv.id) as canvases
  from clients c left join canvases cv on cv.client_id = c.id
  group by c.slug order by canvases desc limit 5;
-- expect the same client/canvas counts as before the migration
```
Expected: `unbackfilled = 0`; `clients_after == clients_before`; `under_yuvabe == clients_after`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_clients_org_id.sql
git commit -m "feat(auth): data migration — attribute existing clients to Yuvabe org"
```

---

## Task 3: Bootstrap doc + first super_admin (one-time)

**Files:**
- Create: `docs/auth-bootstrap.md`

**Interfaces:**
- Consumes: the seeded Yuvabe org (Task 1) and the trigger/index (Task 1).
- Produces: `docs/auth-bootstrap.md`; on staging, one super_admin user linked to Yuvabe as `owner`.

- [ ] **Step 1: Write the bootstrap doc**

Create `docs/auth-bootstrap.md`:

```markdown
# Auth bootstrap — first super_admin (one-time per environment)

The first Yuvabe operator can't be created by the admin UI (the UI needs a logged-in
super_admin to already exist). Do this once per environment, **after migrations 0012 + 0013**.
Every org after Yuvabe is created via `/admin/orgs/new` — never repeat this by hand.

## 1. Create the auth user (dashboard)
Supabase dashboard → Authentication → Add user → enter the operator's email + a password,
enable **Auto Confirm User**. Copy the new user's **UUID**.

## 2. Grant super_admin + link to the Yuvabe org (SQL editor)
Paste the new UUID in place of <USER_UUID>:

    update auth.users
      set raw_app_meta_data = raw_app_meta_data || '{"platform_role":"super_admin"}'::jsonb
      where id = '<USER_UUID>';

    insert into profiles (user_id, display_name)
      values ('<USER_UUID>', 'Yuvabe Operator');

    insert into org_memberships (user_id, org_id, org_role)
      values ('<USER_UUID>', (select id from organizations where slug = 'yuvabe'), 'owner');

## 3. Verify
    select u.email, u.raw_app_meta_data->>'platform_role' as platform_role,
           p.display_name, m.org_role
      from auth.users u
      join profiles p on p.user_id = u.id
      join org_memberships m on m.user_id = u.id
      where u.id = '<USER_UUID>';
    -- expect: email | super_admin | Yuvabe Operator | owner

Rollback (remove this bootstrap user):
    delete from org_memberships where user_id = '<USER_UUID>';
    delete from profiles where user_id = '<USER_UUID>';
    -- then delete the user in the dashboard Authentication panel
```

- [ ] **Step 2: Perform the bootstrap on staging**

Follow the doc against the staging project. Run the Step-3 verify query.
Expected: one row — `super_admin`, `Yuvabe Operator`, `owner`.

- [ ] **Step 3: Behavioral check — last-owner trigger + one-org-per-user index**

With the real owner now existing, confirm the guards actually fire (all should error):

```sql
-- (a) last-owner delete is blocked
delete from org_memberships
  where org_id = (select id from organizations where slug = 'yuvabe');
-- expect ERROR: Cannot remove the last owner of an organization

-- (b) last-owner demote is blocked
update org_memberships set org_role = 'designer'
  where org_id = (select id from organizations where slug = 'yuvabe');
-- expect ERROR: Cannot demote the last owner of an organization

-- (c) one-org-per-user: a throwaway second org + second membership for the same user
insert into organizations (name, slug) values ('Throwaway', 'throwaway-check');
insert into org_memberships (user_id, org_id, org_role)
  values ('<USER_UUID>', (select id from organizations where slug='throwaway-check'), 'owner');
-- expect ERROR: duplicate key value violates unique constraint "org_memberships_one_org_per_user"

-- cleanup the throwaway org
delete from organizations where slug = 'throwaway-check';
```
Expected: (a), (b), (c) each raise the noted error; the Yuvabe owner row is untouched; the throwaway org is cleaned up.

- [ ] **Step 4: Commit**

```bash
git add docs/auth-bootstrap.md
git commit -m "docs(auth): one-time super_admin bootstrap steps"
```

---

## Final verification (1A checkpoint)

- [ ] `0012` + `0013` applied to staging with no errors
- [ ] `select count(*) from clients where org_id is null;` → **0**
- [ ] `clients_after == clients_before` (no rows lost), all under Yuvabe
- [ ] Canvas/node counts per client unchanged (FK tree intact)
- [ ] One super_admin exists, linked to Yuvabe as `owner`; last-owner + one-org-per-user guards verified firing
- [ ] The app still builds and runs unchanged (no source files touched): `npm run build` passes
- [ ] Three commits made (0012, 0013, bootstrap doc)

**On completion, update the tracker:** set 1A → ✅ in `2026-07-21-auth-stage-1-index.md`, then the next step is to write sub-plan **1B (Session Foundation)**.

---

## Self-Review notes (traceability)

- **"Existing data moved under Yuvabe, don't lose data"** → Task 2 (nullable→backfill→guard→not-null, pre/post parity counts, FK-tree spot check) + rollback reference.
- **D80 (one-org-per-user + last-owner)** → Task 1 index/trigger; behaviorally verified in Task 3 Step 3.
- **D82 (no CLI onboarding; manual bootstrap only for the very first super_admin)** → Task 3 doc; all later orgs via 1D's UI.
- **No RLS, no app code in 1A** → only two SQL files + one doc; `npm run build` unaffected.
- **localStorage identities not migrated** → they aren't real accounts (D29); real accounts begin here at bootstrap. (Noted in the index doc.)

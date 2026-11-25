---
name: database-schema
description: >
  The CreativeOS database: which table holds what, and the rules for changing it. Load this
  before adding or changing a table, column, index, constraint, view, RLS policy, trigger, SQL
  function/RPC or migration under supabase/migrations/, and when you need to know which table or
  column holds something (or whether one already exists). Do not load it for ordinary UI, API
  route or query work that only reads or writes existing columns.
---

# Database schema: read before you change it

## 1. Know what exists

1. Read the relevant section of `docs/database-schema.md` (the map of every table, view and
   function after all migrations).
2. Open the migrations it cites for the tables you touch. Later migrations alter earlier ones;
   the newest definition wins.
3. Grep `src/lib/db/` for the table to see how the code reads and writes it.

## 2. A new table only when it is needed

Pick the structure the data actually has. Don't add a table out of habit, and don't squeeze data
onto an existing table where it doesn't belong either. Before adding a table, write down in the ADR
and the PR why existing structure can't hold it:

- Does an existing table already hold this kind of thing?
- Is it a property of an existing row (one value per row), so a column fits?
- Can it be derived on read (a query, a view, a SQL function)?

A table is right for a new entity, a many-to-many relation, rows with their own lifecycle
(created, changed and ended on their own), or many values per parent row. A column is right for
one value that belongs to an existing row. Neither is right for history the audit log already keeps.

- **Example, columns:** the 50-a-day invite limit (0063) is two columns on `organizations`
  (`invite_window_start`, `invite_window_count`) and one atomic update in `take_invite_send`:
  one value per agency. A send-log table was rejected because only today's count is needed and
  Admin's per-send history is in the audit log.
- **Example, tables:** `membership_clients` (0062) is a many-to-many between a membership and a
  client, with its own permissions per pair. `org_invitations` (0062) rows have their own
  lifecycle (sent, resent, accepted, revoked, expired) and exist before any user does.

## 3. Table rules

- `uuid` primary key, `default gen_random_uuid()` (composite PK only for pure join tables).
- `org_id uuid not null references organizations(id)` on every tenant table.
- Composite FKs `(x_id, org_id) references x (id, org_id)` where a row links two tenant rows, so
  nothing can point across agencies (see `membership_clients`, `org_invitations`; target needs a
  `unique (id, org_id)`).
- Index every foreign key and every column used in a frequent `where`, join or sort
  (performance rule 9). Partial unique indexes for "one open/live row" rules.
- `alter table … enable row level security` on every new table. Default deny: no policies, the
  server reaches it through the service role. Add a policy only when the browser truly needs the
  rows (Realtime), and then `using (org_id in (select auth_org_ids()))`, never `limit 1`.
- Views: `alter view … set (security_invoker = true)` and `revoke all … from anon, authenticated`
  (0063: plain public views were readable with the anon key across agencies).
- `security definer` functions: `set search_path = public`, `revoke all on function … from public,
  anon, authenticated`, `grant execute … to service_role`.
- Migrations: idempotent (`if not exists`, `create or replace`, `drop … if exists`, guarded `do $$`
  blocks), numbered next in sequence (`ls supabase/migrations`), end with
  `notify pgrst, 'reload schema';` when functions or columns change.
- Never edit a migration that has been applied anywhere. 0062 was rewritten in place only because
  it had never been applied; ask the user before assuming that.
- In code: select only the columns used; never trust ids from the client, check the caller may
  access every one (performance rules 8 and 14).

## 4. Process

- Never run SQL, connect to a database or apply a migration. The user applies them.
- In the same change as the migration:
  - update `docs/database-schema.md` (bump "up to NNNN"; `src/lib/db/schema-map.test.ts` fails
    if a table or view has no heading);
  - add the migration's section to `docs/auth-production-migration.md` (apply order, verify
    queries, rollback);
  - record the decision in the ADR log in place
    (`docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7);
  - add a migration text test that pins what the code depends on, like
    `src/lib/permissions/migration-0062.test.ts`.

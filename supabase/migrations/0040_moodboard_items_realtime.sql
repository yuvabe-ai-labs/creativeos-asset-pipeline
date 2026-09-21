-- D276: moodboard_items joins Supabase Realtime so the Market board hears the archive
-- task (and any other writer) finish, instead of only learning on its own refetch.
--
-- The same four moves 0030 made for node_versions:
--   1. org_id — Realtime filters on one column; the browser needs one that scopes to an
--      org, and moodboard_items is two hops (moodboard → client → org) from having one.
--   2. A BEFORE INSERT trigger, not an assignment in addItem(): any insert path that
--      forgets the column produces a row no subscription ever hears about, and that
--      failure presents as "the tile just never updates" — the exact bug this fixes.
--   3. An org-isolation SELECT policy — 0026 enabled RLS with ZERO policies
--      (default-deny). Realtime delivers postgres_changes rows THROUGH RLS, so without
--      a policy the socket subscribes fine and receives nothing, silently. Writes are
--      unaffected: every API write goes through the service role.
--   4. Publication membership, guarded so the file is safe to re-run.

-- ── 1. org_id ────────────────────────────────────────────────────────────────
alter table moodboard_items add column if not exists org_id uuid references organizations(id);

-- 2-hop backfill: item -> moodboard -> client -> org.
update moodboard_items i set org_id = cl.org_id
  from moodboards m
  join clients cl on cl.id = m.client_id
 where m.id = i.moodboard_id
   and i.org_id is null;

create index if not exists moodboard_items_org_id_idx on moodboard_items(org_id);

-- ── 2. Trigger keeps it true for every future insert ─────────────────────────
create or replace function set_moodboard_item_org_id() returns trigger
language plpgsql as $$
begin
  if new.org_id is null then
    select cl.org_id into new.org_id
      from moodboards m
      join clients cl on cl.id = m.client_id
     where m.id = new.moodboard_id;
  end if;
  return new;
end;
$$;

drop trigger if exists moodboard_items_set_org_id on moodboard_items;
create trigger moodboard_items_set_org_id
  before insert on moodboard_items
  for each row execute function set_moodboard_item_org_id();

-- ── 3. RLS: required for Realtime delivery ───────────────────────────────────
-- Same shape as 0014 / 0030: a member reads their own org's rows only.
drop policy if exists "org isolation" on moodboard_items;
create policy "org isolation" on moodboard_items for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- ── 4. Publication (guarded — safe to re-run) ────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'moodboard_items'
  ) then
    alter publication supabase_realtime add table moodboard_items;
  end if;
end $$;

-- Stage 1A data migration: attribute all existing clients to the Yuvabe org.
-- Nullable → backfill → guard → not null. The guard + the not-null lock make silent
-- data loss impossible: if any client misses backfill, this migration ABORTS.
-- Pre-flight count recorded before applying: 28 clients.

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

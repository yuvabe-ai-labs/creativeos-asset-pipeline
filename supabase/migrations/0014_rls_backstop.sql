-- Stage 2B RLS backstop. org_id added directly to the three tables read independently
-- of the withClient/withCanvas/withNode app-layer chokepoints (D78, corrected scope —
-- node_files is not a real table, see the Stage 2 index doc). No super_admin bypass in
-- any policy (D85) — super_admin's normal-app view is already org-scoped, same as everyone.
-- Pre-flight counts (staging, 2026-07-21): 36 canvases, 23 client_kb_jobs, 252 generations.

-- ── canvases ─────────────────────────────────────────────────────────────────
-- Direct FK to clients — one-hop backfill.
alter table canvases add column org_id uuid references organizations(id);
update canvases c
  set org_id = cl.org_id
  from clients cl
  where c.client_id = cl.id and c.org_id is null;

do $$
declare unbackfilled int;
begin
  select count(*) into unbackfilled from canvases where org_id is null;
  if unbackfilled > 0 then
    raise exception 'Aborting: % canvases row(s) have no org_id after backfill', unbackfilled;
  end if;
end $$;

alter table canvases alter column org_id set not null;
create index canvases_org_id_idx on canvases (org_id);

alter table canvases enable row level security;
create policy "org isolation" on canvases for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- ── client_kb_jobs ───────────────────────────────────────────────────────────
-- Direct FK to clients — one-hop backfill. Already in supabase_realtime (migration 0008).
alter table client_kb_jobs add column org_id uuid references organizations(id);
update client_kb_jobs j
  set org_id = cl.org_id
  from clients cl
  where j.client_id = cl.id and j.org_id is null;

do $$
declare unbackfilled int;
begin
  select count(*) into unbackfilled from client_kb_jobs where org_id is null;
  if unbackfilled > 0 then
    raise exception 'Aborting: % client_kb_jobs row(s) have no org_id after backfill', unbackfilled;
  end if;
end $$;

alter table client_kb_jobs alter column org_id set not null;
create index client_kb_jobs_org_id_idx on client_kb_jobs (org_id);

alter table client_kb_jobs enable row level security;
create policy "org isolation" on client_kb_jobs for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- ── generations ──────────────────────────────────────────────────────────────
-- No direct client_id — backfill via nodes.canvas_id -> canvases.org_id (now populated
-- above), a 2-hop join instead of the 3-hop nodes -> canvases -> clients chain.
alter table generations add column org_id uuid references organizations(id);
update generations g
  set org_id = c.org_id
  from nodes n
  join canvases c on c.id = n.canvas_id
  where g.node_id = n.id and g.org_id is null;

do $$
declare unbackfilled int;
begin
  select count(*) into unbackfilled from generations where org_id is null;
  if unbackfilled > 0 then
    raise exception 'Aborting: % generations row(s) have no org_id after backfill', unbackfilled;
  end if;
end $$;

alter table generations alter column org_id set not null;
create index generations_org_id_idx on generations (org_id);

alter table generations enable row level security;
create policy "org isolation" on generations for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Confirm generations is in the realtime publication — add only if not already present
-- (its current state isn't recorded in any prior migration; this is safe either way).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'generations'
  ) then
    alter publication supabase_realtime add table generations;
  end if;
end $$;

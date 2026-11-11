-- D489–D492: presets + per-person ticks + picked clients, invites, and agency-ready keys.
-- Apply to an environment's database and verify it BEFORE the code that reads it is merged or
-- deployed there (merging deploys on this repo). The old code keeps working on top of it: it
-- reads org_role, which stays (and is kept in sync) until a later migration drops it. The new
-- code without it fails every signed-in request, because get_membership_access() is missing.

-- ── 1. Presets ───────────────────────────────────────────────────────────────
create table if not exists role_presets (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text not null default '',
  is_owner    boolean not null default false,
  sort        int not null default 0,
  archived_at timestamptz,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create unique index if not exists role_presets_one_owner on role_presets (is_owner) where is_owner;

create table if not exists role_preset_permissions (
  preset_id      uuid not null references role_presets(id) on delete cascade,
  permission_key text not null,
  primary key (preset_id, permission_key)
);

insert into role_presets (key, name, description, is_owner, sort) values
  ('owner',    'Owner',    'Everything, including the team.',                 true,  0),
  ('senior',   'Senior',   'Everything except the team.',                     false, 1),
  ('designer', 'Designer', 'Like Senior, without approving images, video or audio.', false, 2)
on conflict (key) do nothing;

with senior_keys(k) as (values
  -- seed:senior-keys:start
  ('client_profile.edit'),
  ('brand_knowledge.view'), ('brand_knowledge.edit'), ('brand_knowledge.generate'), ('brand_knowledge.delete'),
  ('brand_assets.view'), ('brand_assets.edit'), ('brand_assets.generate'), ('brand_assets.delete'),
  ('market.view'), ('market.edit'), ('market.generate'), ('market.delete'),
  ('moodboards.view'), ('moodboards.edit'), ('moodboards.delete'),
  ('scripts.view'), ('scripts.edit'), ('scripts.generate'), ('scripts.approve'), ('scripts.delete'),
  ('storyboard.view'), ('storyboard.edit'), ('storyboard.generate'),
  ('avatars.view'), ('avatars.edit'), ('avatars.generate'), ('avatars.delete'),
  ('voices.view'), ('voices.edit'), ('voices.generate'), ('voices.delete'),
  ('canvases.view'), ('canvases.edit'), ('canvases.generate'), ('canvases.delete'),
  ('image_generation.generate'), ('image_generation.approve'),
  ('video_generation.generate'), ('video_generation.approve'),
  ('audio.generate'), ('audio.approve'),
  ('canvas_copilot.generate'),
  ('video_editor.view'), ('video_editor.edit'), ('video_editor.generate'), ('video_editor.share'),
  ('internal_review.view'),
  ('client_review.view'), ('client_review.edit'), ('client_review.share'),
  ('downloads.view'), ('downloads.share'),
  ('clients.edit'), ('clients.delete'),
  ('credits.view')
  -- seed:senior-keys:end
),
presets as (select id, key from role_presets where key in ('senior', 'designer'))
insert into role_preset_permissions (preset_id, permission_key)
select p.id, s.k
  from presets p cross join senior_keys s
 where p.key = 'senior'
    or (p.key = 'designer' and s.k not in (
      -- seed:designer-drops:start
      'image_generation.approve', 'video_generation.approve', 'audio.approve'
      -- seed:designer-drops:end
    ))
on conflict do nothing;

-- ── 2. Memberships carry a preset and a client scope ─────────────────────────
alter table org_memberships
  add column if not exists preset_id   uuid references role_presets(id),
  add column if not exists all_clients boolean not null default true,
  add column if not exists invited_by  uuid references auth.users(id) on delete set null;

update org_memberships m set preset_id = p.id
  from role_presets p
 where p.key = m.org_role and m.preset_id is null;

alter table org_memberships alter column preset_id set not null;
create index if not exists org_memberships_preset_id_idx on org_memberships (preset_id);
create index if not exists org_memberships_invited_by_idx on org_memberships (invited_by);

-- Until plan 3 retires the org_role writers (addOrgMember / updateMemberRole), keep preset_id
-- following org_role. Named with "0_" so it fires BEFORE org_memberships_last_owner (Postgres
-- fires same-event triggers in name order) and the last-owner check sees the new preset.
-- Definer: reads role_presets, which is default-deny under RLS, so it must not depend on the caller's privileges.
create or replace function sync_preset_from_org_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.preset_id is null) or (tg_op = 'UPDATE' and new.org_role is distinct from old.org_role) then
    select id into new.preset_id from role_presets where key = new.org_role;
  end if;
  return new;
end;
$$;

drop trigger if exists org_memberships_0_sync_preset on org_memberships;
create trigger org_memberships_0_sync_preset
  before insert or update of org_role on org_memberships
  for each row execute function sync_preset_from_org_role();

-- Last owner (D80/D181), now on presets. Same messages as 0012: removeOrgMemberAction shows them.
-- Definer: reads role_presets and counts owners across memberships under RLS; without it the guard can silently pass.
create or replace function enforce_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_owner   boolean;
  still_owner boolean;
  remaining   int;
begin
  select is_owner into was_owner from role_presets where id = old.preset_id;
  if not coalesce(was_owner, false) then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    select is_owner into still_owner from role_presets where id = new.preset_id;
    if coalesce(still_owner, false) then return new; end if;
  end if;
  select count(*) into remaining
    from org_memberships m join role_presets p on p.id = m.preset_id
   where m.org_id = old.org_id and p.is_owner and m.user_id <> old.user_id;
  if remaining = 0 then
    if tg_op = 'DELETE' then
      raise exception 'Cannot remove the last owner of an organization';
    end if;
    raise exception 'Cannot demote the last owner of an organization';
  end if;
  return coalesce(new, old);
end;
$$;
-- org_memberships_last_owner (0012) keeps calling enforce_last_owner(); no trigger change needed.

-- ── 3. Per-person ticks and picked clients ───────────────────────────────────
create table if not exists membership_permission_changes (
  user_id        uuid not null,
  org_id         uuid not null,
  permission_key text not null,
  granted        boolean not null,
  primary key (user_id, org_id, permission_key),
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_id_org_unique') then
    alter table clients add constraint clients_id_org_unique unique (id, org_id);
  end if;
end
$$;

create table if not exists membership_clients (
  user_id   uuid not null,
  org_id    uuid not null,
  client_id uuid not null,
  primary key (user_id, org_id, client_id),
  foreign key (user_id, org_id) references org_memberships (user_id, org_id) on delete cascade,
  foreign key (client_id, org_id) references clients (id, org_id) on delete cascade
);
create index if not exists membership_clients_client_idx on membership_clients (client_id);

-- ── 4. Invitations (used by plan 3; created now so the schema lands once) ────
create table if not exists org_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null,
  display_name text,
  preset_id    uuid not null references role_presets(id),
  changes      jsonb not null default '{"granted":[],"revoked":[]}',
  all_clients  boolean not null default true,
  client_ids   uuid[] not null default '{}',
  token_hash   text not null unique,
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  revoked_at   timestamptz
);
create unique index if not exists org_invitations_one_open_per_email
  on org_invitations (org_id, lower(email)) where accepted_at is null and revoked_at is null;
create index if not exists org_invitations_org_idx on org_invitations (org_id);
create index if not exists org_invitations_preset_id_idx on org_invitations (preset_id);
create index if not exists org_invitations_invited_by_idx on org_invitations (invited_by);

-- Default-deny like 0017: only the service-role server path reads or writes these.
alter table role_presets enable row level security;
alter table role_preset_permissions enable row level security;
alter table membership_permission_changes enable row level security;
alter table membership_clients enable row level security;
alter table org_invitations enable row level security;

-- ── 5. One access read per request ───────────────────────────────────────────
create or replace function get_membership_access(p_user_id uuid)
returns table (
  org_id uuid, preset_key text, is_owner boolean, all_clients boolean,
  preset_keys text[], granted text[], revoked text[], client_ids uuid[]
)
language sql stable security definer set search_path = public as $$
  select m.org_id, p.key, p.is_owner, m.all_clients,
         coalesce((select array_agg(rpp.permission_key) from role_preset_permissions rpp
                    where rpp.preset_id = p.id), '{}'),
         coalesce((select array_agg(c.permission_key) from membership_permission_changes c
                    where c.user_id = m.user_id and c.org_id = m.org_id and c.granted), '{}'),
         coalesce((select array_agg(c.permission_key) from membership_permission_changes c
                    where c.user_id = m.user_id and c.org_id = m.org_id and not c.granted), '{}'),
         coalesce((select array_agg(mc.client_id) from membership_clients mc
                    where mc.user_id = m.user_id and mc.org_id = m.org_id), '{}')
    from org_memberships m
    join role_presets p on p.id = m.preset_id
   where m.user_id = p_user_id;
$$;
revoke all on function get_membership_access(uuid) from public, anon, authenticated;
grant execute on function get_membership_access(uuid) to service_role;

-- ── 6. RLS ready for more than one agency per person (D492) ──────────────────
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

-- ── 7. Nodes and edges stay on their own canvas ──────────────────────────────
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

notify pgrst, 'reload schema';

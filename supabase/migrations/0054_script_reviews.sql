-- supabase/migrations/0054_script_reviews.sql
-- Script copilot spec 4 (D347–D356): client review of a script. One link per script, a frozen
-- version per share, comments per part, and an append-only activity log. Kept apart from the
-- script document: nothing here alters client_scripts.doc. The only writes to client_scripts are
-- stage / approved_at / updated_at, inside the three functions below.
-- Server code reads and writes with the service-role client. The public page goes through
-- /api/r/s/* (withScriptShareToken), as D309. RLS on, no policies (default-deny).

create table script_reviews (
  id          uuid primary key default gen_random_uuid(),
  script_id   uuid not null unique references client_scripts(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  -- D311's short code: the first 4 hex characters of the script id, longer on a clash.
  share_token text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table script_review_versions (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references script_reviews(id) on delete cascade,
  number      int  not null check (number >= 1),
  scope       text not null check (scope in ('script', 'avatars', 'panels')),
  -- The script document exactly as shared (scriptDocSchema), and what the share froze besides it:
  -- { avatars: { <castId>: AvatarSnapshot }, panels: { <shotId>: { takeId, url } } }. Image URLs
  -- are copied, not files: avatar images and panel takes are never deleted (spec 3 §6.6).
  doc         jsonb not null,
  visuals     jsonb not null,
  shared_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (review_id, number)
);

create table script_review_comments (
  id               uuid primary key default gen_random_uuid(),
  review_id        uuid not null references script_reviews(id) on delete cascade,
  -- The version the comment was made on (spec 4 §5). A reply carries its thread's version.
  version_id       uuid not null references script_review_versions(id) on delete cascade,
  part_kind        text not null check (part_kind in ('context', 'shot', 'panel', 'cast', 'view')),
  part_id          text check (part_id is null or char_length(part_id) between 1 and 64),
  part_view        text check (part_view is null or part_view in ('front', 'left', 'right', 'back')),
  parent_id        uuid references script_review_comments(id) on delete cascade,
  author_kind      text not null check (author_kind in ('client', 'team')),
  author_name      text not null check (char_length(author_name) between 1 and 60),
  author_user_id   uuid references auth.users(id) on delete set null,
  body             text not null check (char_length(body) between 1 and 2000),
  edited_by_name   text check (edited_by_name is null or char_length(edited_by_name) between 1 and 60),
  resolved_at      timestamptz,
  resolved_by_name text check (resolved_by_name is null or char_length(resolved_by_name) between 1 and 60),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((part_kind = 'context') = (part_id is null)),
  check ((part_kind = 'view') = (part_view is not null))
);

create index script_review_comments_review_created on script_review_comments (review_id, created_at);

-- Append-only: no code path updates or deletes a row (spec 4 §7, "nothing in the activity is edited
-- or removed later"). Keyed by script, so a stage move before the first share is recorded too.
create table script_review_events (
  id             uuid primary key default gen_random_uuid(),
  script_id      uuid not null references client_scripts(id) on delete cascade,
  kind           text not null check (kind in ('moved_to_review', 'moved_back', 'shared', 'approved', 'reopened')),
  version_number int,
  actor_kind     text not null check (actor_kind in ('client', 'team')),
  actor_name     text not null check (char_length(actor_name) between 1 and 80),
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index script_review_events_script_created on script_review_events (script_id, created_at);

-- ── The three locked writes ─────────────────────────────────────────────────────────────────
-- Each is one transaction that locks the script's client_scripts row first, so a share, an
-- approval and a stage move on one script never interleave (the reserve_credits pattern, 0020).
-- SECURITY INVOKER (the default): an anon caller hits default-deny RLS and changes nothing.

-- A team stage move (spec 4 §3, §8): compare-and-set on the stage, plus its activity line.
-- False when the script is not at p_from (someone else moved it) or is archived.
create or replace function script_review_move(
  p_script_id uuid,
  p_client_id uuid,
  p_from text,
  p_to text,
  p_kind text,
  p_actor_name text
) returns boolean
language plpgsql
as $$
begin
  update client_scripts
     set stage = p_to,
         approved_at = case when p_from = 'approved' then null else approved_at end,
         updated_at = now()
   where id = p_script_id
     and client_id = p_client_id
     and stage = p_from
     and archived_at is null;
  if not found then
    return false;
  end if;
  insert into script_review_events (script_id, kind, actor_kind, actor_name)
  values (p_script_id, p_kind, 'team', p_actor_name);
  return true;
end;
$$;

-- One share (spec 4 §3 step 3): the next version number, the frozen version, and its activity
-- line. 'stale' when another share landed after the caller read the latest version (its diff
-- would be against the wrong version); 'not_in_review' when the script is not In review.
create or replace function script_review_share(
  p_review_id uuid,
  p_expected_latest int,
  p_scope text,
  p_doc jsonb,
  p_visuals jsonb,
  p_changes jsonb,
  p_shared_by uuid,
  p_actor_name text
) returns jsonb
language plpgsql
as $$
declare
  v_script_id uuid;
  v_stage text;
  v_latest int;
  v_row script_review_versions;
begin
  select script_id into v_script_id from script_reviews where id = p_review_id;
  if v_script_id is null then
    return jsonb_build_object('status', 'not_in_review');
  end if;
  select stage into v_stage
    from client_scripts
   where id = v_script_id and archived_at is null
     for update;
  if v_stage is distinct from 'in_review' then
    return jsonb_build_object('status', 'not_in_review');
  end if;
  select coalesce(max(number), 0) into v_latest from script_review_versions where review_id = p_review_id;
  if v_latest <> p_expected_latest then
    return jsonb_build_object('status', 'stale');
  end if;
  insert into script_review_versions (review_id, number, scope, doc, visuals, shared_by)
  values (p_review_id, v_latest + 1, p_scope, p_doc, p_visuals, p_shared_by)
  returning * into v_row;
  insert into script_review_events (script_id, kind, version_number, actor_kind, actor_name, detail)
  values (v_script_id, 'shared', v_row.number, 'team', p_actor_name,
          jsonb_build_object('scope', p_scope, 'changes', coalesce(p_changes, '[]'::jsonb)));
  return jsonb_build_object('status', 'ok', 'version', to_jsonb(v_row));
end;
$$;

-- The client's approval (spec 4 §8) of the version on their screen. Checked in this order:
-- 'stale' (a newer version exists), 'already' (a second tap: no second line), 'not_in_review',
-- 'partial' (not a full share). 'ok' moves the script to Approved and records who.
create or replace function script_review_approve(
  p_review_id uuid,
  p_version_number int,
  p_actor_name text
) returns text
language plpgsql
as $$
declare
  v_script_id uuid;
  v_stage text;
  v_latest int;
  v_scope text;
begin
  select script_id into v_script_id from script_reviews where id = p_review_id;
  if v_script_id is null then
    return 'not_found';
  end if;
  select stage into v_stage
    from client_scripts
   where id = v_script_id and archived_at is null
     for update;
  if v_stage is null then
    return 'not_found';
  end if;
  select number, scope into v_latest, v_scope
    from script_review_versions
   where review_id = p_review_id
   order by number desc
   limit 1;
  if v_latest is null or v_latest <> p_version_number then
    return 'stale';
  end if;
  if v_stage = 'approved' then
    return 'already';
  end if;
  if v_stage <> 'in_review' then
    return 'not_in_review';
  end if;
  if v_scope <> 'panels' then
    return 'partial';
  end if;
  update client_scripts
     set stage = 'approved', approved_at = now(), updated_at = now()
   where id = v_script_id;
  insert into script_review_events (script_id, kind, version_number, actor_kind, actor_name)
  values (v_script_id, 'approved', p_version_number, 'client', p_actor_name);
  return 'ok';
end;
$$;

alter table script_reviews enable row level security;
alter table script_review_versions enable row level security;
alter table script_review_comments enable row level security;
alter table script_review_events enable row level security;

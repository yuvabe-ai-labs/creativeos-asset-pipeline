-- Script copilot spec 3 (Visualise). See
-- docs/superpowers/specs/2026-10-08-script-copilot-3-visualise-design.md and ADRs D337–D346.
-- Additive: one column on client_avatars, one owner column on generations, two new tables.
-- Nothing existing is rewritten.

-- D339 — an avatar's sheet is four views, each its own 3:4 image made from the front:
-- { front, left, right, back }, each an AvatarImage JSON or null (not made yet, or failed).
-- Null for an avatar whose sheet is the older single three-view image, or that has none.
alter table client_avatars add column if not exists sheet_views jsonb;

-- D337 — a storyboard panel's generation belongs to its script: a third kind of owner beside
-- the canvas node and the avatar (0042). Cascade, as the other two owners do.
alter table generations
  add column if not exists script_id uuid references client_scripts(id) on delete cascade;
create index if not exists generations_script_id_idx on generations (script_id);

alter table generations drop constraint if exists generations_owner_check;
alter table generations
  add constraint generations_owner_check
  check (node_id is not null or avatar_id is not null or script_id is not null);

-- D337, D343 — every drawing of a shot's storyboard panel, kept as a take. Keyed by script and
-- shot id; the script document itself is never touched.
create table script_panel_takes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  script_id     uuid not null references client_scripts(id) on delete cascade,
  shot_id       text not null,
  generation_id uuid references generations(id) on delete set null,
  status        text not null default 'running'
                  check (status in ('running', 'succeeded', 'failed')),
  url           text,
  width         integer,
  height        integer,
  -- D344 — the exact prompt sent, and whether a person wrote it rather than the script.
  prompt        text not null,
  prompt_edited boolean not null default false,
  -- D343 — what the panel was drawn from: a fingerprint of the shot's text, and for each cast
  -- member on screen { avatarId, faceKey }. A mismatch with today's values means out of date.
  shot_key      text not null,
  faces         jsonb not null default '{}'::jsonb,
  error         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index script_panel_takes_script_idx
  on script_panel_takes (script_id, shot_id, created_at desc);

-- D343 — the take the client sees: one per shot.
create table script_panel_picks (
  script_id uuid not null references client_scripts(id) on delete cascade,
  shot_id   text not null,
  take_id   uuid not null references script_panel_takes(id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (script_id, shot_id)
);

-- Default-deny RLS with zero policies, as 0041 and 0051: the app reads and writes through the
-- service-role client; this only closes the direct-REST path the anon key opens.
alter table script_panel_takes enable row level security;
alter table script_panel_picks enable row level security;
